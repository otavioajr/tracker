#!/usr/bin/env bash
# Arquiva posições GPS mais antigas que RETENTION_DAYS em arquivos gzip
# (formato COPY text + header) e remove do banco.
#
# - Partição mensal inteira fora da retenção: exporta em positions_AAAA-MM.tsv.gz e faz DROP.
# - Partição parcial (mês corrente/anterior, default): exporta as linhas antes do cutoff em
#   positions_ate_AAAA-MM-DD.tsv.gz e apaga, conferindo a contagem.
# - Garante as partições do mês atual e dos próximos FUTURE_MONTHS meses.
#
# Uma passada por partição (não há índice começando por server_time).
#
# Restaurar um arquivo:
#   gunzip -c ARQUIVO.tsv.gz | psql "$URL" -c "\copy positions from stdin with (format text, header true)"
set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-15}"
ARCHIVE_DIR="${ARCHIVE_DIR:-$HOME/tracker-archive/positions}"
ENV_FILE="${ENV_FILE:-$HOME/tracker/gateway/.env}"
LOCK_FILE="${LOCK_FILE:-/tmp/archive-positions.lock}"
FUTURE_MONTHS="${FUTURE_MONTHS:-2}"

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "outra execução em andamento"; exit 0; }

if [[ -z "${ARCHIVE_DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")"
  # Session pooler (5432) em vez do transaction pooler (6543).
  ARCHIVE_DATABASE_URL="${DATABASE_URL/:6543\//:5432/}"
fi

log() { echo "$(date -u +%FT%TZ) $*"; }
sql() { psql "$ARCHIVE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt -c "$1"; }

# Exporta "select ... " para $2; imprime o número de linhas exportadas.
export_query() {
  local query="$1" file="$2" lines
  mkdir -p "$(dirname "$file")"
  psql "$ARCHIVE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q \
    -c "copy (${query}) to stdout with (format text, header true)" \
    | gzip -9 > "${file}.tmp"
  gzip -t "${file}.tmp"
  lines="$(gunzip -c "${file}.tmp" | wc -l)"
  mv "${file}.tmp" "$file"
  echo $((lines - 1))
}

cutoff="$(sql "select (date_trunc('day', now() at time zone 'utc') - interval '${RETENTION_DAYS} days')::date")"
last_day="$(date -u -d "${cutoff} - 1 day" +%F)"
log "início retention=${RETENTION_DAYS}d cutoff=${cutoff}"

# nome|droppable(t/f)|ano|mes  (ano/mes vazios para positions_default)
mapfile -t parts < <(sql "
  with p as (
    select c.relname,
           case when c.relname ~ '^positions_[0-9]{4}_[0-9]{2}\$'
                then to_date(substr(c.relname, 11), 'YYYY_MM') end as month_start
    from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.positions'::regclass
  )
  select relname,
         coalesce(month_start + interval '1 month' <= '${cutoff}'::date, false),
         coalesce(to_char(month_start, 'YYYY'), ''), coalesce(to_char(month_start, 'MM'), '')
  from p
  where relname = 'positions_default' or month_start < '${cutoff}'::date
  order by 1" | tr '|' ' ')

for row in "${parts[@]}"; do
  read -r part droppable year month <<<"$row"

  if [[ "$droppable" == "t" ]]; then
    file="${ARCHIVE_DIR}/${year}/positions_${year}-${month}.tsv.gz"
    n="$(export_query "select * from public.${part} order by server_time" "$file")"
    sql "do \$\$ declare c bigint; begin
           select count(*) into c from public.${part};
           if c <> ${n} then raise exception '${part}: % linhas, exportadas ${n}', c; end if;
           execute 'drop table public.${part}';
         end \$\$"
    log "${part}: ${n} linhas arquivadas em ${file}; partição dropada"
  else
    dir_year="${year:-${last_day:0:4}}"
    file="${ARCHIVE_DIR}/${dir_year}/${part#positions_}_ate_${last_day}.tsv.gz"
    n="$(export_query "select * from public.${part} where server_time < '${cutoff} 00:00:00+00' order by server_time" "$file")"
    if [[ "$n" == 0 ]]; then
      rm -f "$file"
      continue
    fi
    sql "do \$\$ declare c bigint; begin
           delete from public.${part} where server_time < '${cutoff} 00:00:00+00';
           get diagnostics c = row_count;
           if c <> ${n} then raise exception '${part}: apagou % linhas, exportadas ${n}', c; end if;
         end \$\$"
    log "${part}: ${n} linhas arquivadas em ${file} e apagadas"
  fi
done

# Garante partições do mês atual e dos próximos FUTURE_MONTHS meses.
sql "do \$\$ declare m date; name text; begin
  for i in 0..${FUTURE_MONTHS} loop
    m := (date_trunc('month', now() at time zone 'utc') + make_interval(months => i))::date;
    name := 'positions_' || to_char(m, 'YYYY_MM');
    if to_regclass('public.' || name) is null then
      begin
        execute format('create table public.%I partition of public.positions for values from (%L) to (%L)',
                       name, (m::text || ' 00:00:00+00')::timestamptz,
                       ((m + interval '1 month')::date::text || ' 00:00:00+00')::timestamptz);
      exception when others then
        raise warning 'não foi possível criar %: %', name, sqlerrm;
      end;
    end if;
  end loop;
end \$\$"

log "fim; tamanho do banco: $(sql "select pg_size_pretty(pg_database_size(current_database()))")"
