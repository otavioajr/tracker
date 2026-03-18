# Design: Adicionar vehicle_id na tabela positions

**Data:** 2026-03-18
**Status:** Aprovado

## Problema

O histórico de posições é vinculado ao `device_id`. Quando um equipamento (device) é movido de um veículo para outro, todo o histórico acompanha o device — o veículo original perde seu histórico e o novo veículo "herda" posições que não são dele.

## Solução

Gravar `vehicle_id` diretamente na tabela `positions` no momento da inserção. Cada posição passa a saber a qual veículo pertencia naquele instante, independente de trocas futuras de equipamento.

## Design

### 1. Banco de dados

Nova migration:

- Adicionar coluna `vehicle_id UUID` (nullable) à tabela `positions` (propaga automaticamente para todas as partitions em PostgreSQL 11+)
- Criar índice composto `idx_positions_vehicle_time` em `positions(vehicle_id, server_time DESC)` (cobre também consultas somente por `vehicle_id` via prefixo do B-tree)
- Backfill por partition para evitar locks longos:

```sql
-- Backfill por partition
UPDATE positions_2026_03 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;

UPDATE positions_2026_04 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;
```

A coluna é nullable porque um device pode não ter veículo associado.

**Caveat do backfill:** O backfill usa a associação atual device↔veículo. Se um device já foi transferido antes desta migration, posições antigas serão atribuídas ao veículo atual, não ao original. Isso é uma aproximação best-effort aceita para o escopo atual.

### 2. Gateway (Go)

**`storage.DeviceInfo`** — adicionar campo `VehicleID *string` (ponteiro, pois pode ser NULL).

**`Writer.LoadDevices`** — alterar a query para incluir LEFT JOIN com vehicles:

```sql
SELECT d.id, d.tenant_id, d.imei, v.id
FROM devices d
LEFT JOIN vehicles v ON v.device_id = d.id
WHERE d.active = true
```

O `rows.Scan` deve usar `*string` para `v.id` para lidar com NULL (device sem veículo). Se NULL, `VehicleID` fica `nil`.

**`buildBatchInsert`** — incluir `vehicle_id` no INSERT. Quando `VehicleID` é `nil`, passar `nil` como argumento (não string vazia `""`, que causa erro de UUID inválido no PostgreSQL). O pgx aceita `nil` para colunas nullable.

Nenhuma mudança de arquitetura. O cache existente é expandido com um campo e o batch insert ganha um parâmetro.

### 3. Web (Frontend)

**`src/lib/actions/positions.ts`**:
- `getPositionHistory` passa a receber `vehicleId` e filtrar por `.eq("vehicle_id", vehicleId)`
- Tipo `VehiclePosition` ganha campo opcional `vehicle_id`

**`src/components/map/history-player.tsx`**:
- Trocar import de `getDevices` (de `@/lib/actions/devices`) para `getVehicles` (de `@/lib/actions/vehicles`)
- Renomear state `deviceId` → `vehicleId`, `devices` → `vehicles`
- Seletor exibe lista de veículos por placa (mais intuitivo)
- Chamada `getPositionHistory(vehicleId, start, end)` com o novo parâmetro

**Regenerar tipos**: Após a migration, executar `make db-types` para atualizar `web/src/types/database.ts` com a nova coluna `vehicle_id`.

**Sem mudança:**
- `getLatestPositions` — mapa em tempo real continua por `device_id`
- `use-realtime-positions.ts` — realtime continua por `device_id`
- RLS — `tenant_id` continua sendo o filtro de segurança, `vehicle_id` não precisa de policy própria

## Limitações conhecidas

- **Cache do gateway:** Reatribuições de veículo via web UI não são refletidas no cache do gateway até o próximo ciclo de `LoadDevices`. Posições gravadas nesse intervalo terão o `vehicle_id` anterior. Aceitável para o volume atual.
- **Backfill retroativo:** Aproximação best-effort conforme descrito na seção de banco de dados.

## Escopo explicitamente fora

- Tabela de histórico de associações device↔veículo (descartado por simplicidade)
- Trigger no banco para preencher vehicle_id (descartado por performance em tabela particionada de alto volume)
- Alteração no mapa em tempo real ou realtime subscription
