# Vehicle Tracker — Design Spec

## Visão Geral

Plataforma SaaS multi-tenant de rastreamento veicular. Dispositivos GPS (começando com Suntech) comunicam via GPRS/TCP enviando posições para o sistema. Clientes acessam via PWA (Web + Mobile) com rastreamento em tempo real, histórico de rotas, geocercas, alertas e relatórios.

## Modelo de Negócio

- **SaaS multi-tenant** — cada cliente é um tenant isolado
- Cliente compra o equipamento GPS por fora
- Plataforma cobra mensalidade pelo uso do sistema
- **Papéis:** admin da plataforma (dono) e usuários clientes (cada um vê seus veículos)
- **Notificações:** in-app + e-mail inicialmente, expansível para WhatsApp/SMS

## Arquitetura

### Stack

| Componente | Tecnologia | Hospedagem (Fase 1) |
|---|---|---|
| Device Gateway | Go | Oracle Cloud Always Free (1GB RAM) |
| Web Platform | Next.js (TypeScript) | Vercel Free Tier |
| Banco + Auth + Realtime | Supabase (PostgreSQL + PostGIS + GoTrue + Realtime) | Supabase Cloud Free Tier |

### Fluxo de Dados

```
Dispositivo GPS → TCP/GPRS → Go Gateway (Oracle)
    → Gateway parseia protocolo Suntech, valida IMEI
    → INSERT posição no PostgreSQL (Supabase) via connection pooler
    → Supabase Realtime detecta INSERT via WAL
    → Broadcast via WebSocket para clientes subscritos (filtro: tenant_id)
    → Next.js (Vercel) recebe via Supabase SDK → Mapa atualiza em tempo real
```

### Supabase Realtime — Estratégia de Subscription

O cliente Next.js se inscreve nas mudanças da tabela `positions` usando o Supabase Realtime SDK:

```typescript
supabase.channel('positions')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'positions',
    filter: `tenant_id=eq.${user.tenant_id}`
  }, (payload) => {
    // Atualizar posição no mapa
  })
  .subscribe()
```

**Requisitos para funcionar:**
- RLS habilitado na tabela `positions` com policy `SELECT` filtrando por `tenant_id` do JWT
- O Go Gateway conecta via **connection string direta** (não PostgREST) usando a `service_role` key para INSERTs
- O cliente subscribe usando seu JWT de usuário — Supabase Realtime filtra automaticamente via RLS

**Limites do free tier:** 200 conexões WebSocket simultâneas, 100 eventos/segundo. Na Fase 1 (validação com poucos clientes), isso é suficiente. Na Fase 2, o Supabase self-hosted remove esses limites.

### Componentes

**1. Device Gateway (Go) — Oracle Cloud**

Servidor TCP que recebe dados brutos dos rastreadores e transforma em posições padronizadas.

- **TCP Listener** (:5001) — 1 goroutine por conexão persistente. Na Oracle Cloud Always Free, abrir porta TCP 5001 no Security List da VCN
- **Connection Manager** — registro por IMEI, heartbeat 30s, auto-cleanup de conexões mortas
- **Protocol Router** — interface `Parser` extensível:
  ```go
  type Parser interface {
      Identify(data []byte) bool
      Parse(data []byte) (*Position, error)
      ACK(data []byte) []byte
  }
  ```
  - Implementação inicial: `SuntechParser`
  - Extensível para Coban, Teltonika, etc. sem mexer no core
- **PostgreSQL Writer** — batch insert (a cada 1s ou 100 posições) via connection pooler do Supabase. **Buffer em memória com fallback em disco:** se a conexão com o Supabase cair, posições são acumuladas em um buffer circular em memória (até 10k posições) e persistidas em arquivo local se o buffer encher. Quando a conexão restabelecer, o buffer é drenado em ordem. No startup, o Gateway verifica se há arquivo de fallback pendente e drena antes de aceitar novas conexões. Nenhuma posição é perdida.
- **Alert Engine** — checa regras contra cada posição recebida:
  - **Velocidade/Ignição/Bateria:** regras carregadas em memória, avaliadas no Gateway
  - **Geocercas:** delegadas ao PostgreSQL via query PostGIS `ST_Within` no momento do INSERT (trigger ou função pós-insert), evitando sincronizar geometrias complexas para o Gateway
- **Rule Sync** — o Gateway faz polling da tabela `alert_rules` a cada 30 segundos para atualizar o cache em memória (apenas regras de velocidade/ignição/bateria — geocercas são avaliadas diretamente no PostgreSQL e não precisam de cache no Gateway). Na Fase 2, pode ser substituído por notificação HTTP do Next.js quando regras mudam.
- **Observabilidade:** log estruturado (JSON), métricas expostas via endpoint HTTP (:9090, acessível apenas via localhost/SSH tunnel — NÃO abrir no Security List da VCN) — conexões ativas, posições/s, erros, latência de INSERT

**2. Web Platform (Next.js) — Vercel**

Frontend PWA + API routes usando Supabase SDK.

- **Auth:** Supabase Auth (GoTrue) — login, registro, JWT, refresh tokens, reset de senha
- **Realtime:** Supabase Realtime SDK — subscribe em mudanças na tabela `positions` filtrado por tenant
- **Mapas:** Leaflet + OpenStreetMap (gratuito, sem limites)
- **UI:** Tailwind CSS + shadcn/ui
- **Validação:** Zod
- **ORM:** Drizzle ORM + Drizzle Kit (migrations)

**API Routes (prefixo `/api/v1`):**

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/v1/auth/login | Login |
| POST | /api/v1/auth/register | Registro |
| GET | /api/v1/auth/me | Usuário atual |
| GET/POST/PUT | /api/v1/vehicles | CRUD veículos |
| PUT | /api/v1/vehicles/:id/device | Associar/desassociar device |
| GET/POST/PUT/DEL | /api/v1/devices | CRUD dispositivos |
| GET | /api/v1/devices/:id/positions | Posições de um device |
| GET/POST/PUT/DEL | /api/v1/geofences | CRUD geocercas |
| GET | /api/v1/alerts | Listar alertas |
| PUT | /api/v1/alerts/:id/read | Marcar como lido |
| GET/POST/PUT/DEL | /api/v1/alert-rules | CRUD regras de alerta |
| GET | /api/v1/reports/trips | Relatório de viagens |
| GET | /api/v1/reports/stops | Relatório de paradas |
| GET | /api/v1/reports/mileage | Relatório de km rodado |

**Paginação:** todos os endpoints de listagem usam paginação cursor-based com parâmetros `cursor` e `limit` (default 50, max 200). Responses incluem `next_cursor` para a próxima página.

**Telas do Cliente (PWA):**

- **Dashboard/Mapa** — lista de veículos na lateral com status (em movimento/parado/sem sinal) + mapa com posições em tempo real
- **Histórico** — seleção de veículo + período, replay animado do trajeto
- **Geocercas** — desenho de polígonos no mapa, tipo inclusão/exclusão
- **Alertas** — feed em tempo real com tipo, veículo, localização e hora
- **Relatórios** — viagens, paradas, km rodado. Exportação PDF/CSV

**Painel Admin (dono da plataforma):**

- Gerenciar tenants (clientes) — listar, criar, ativar/desativar
- Monitorar dispositivos conectados e status de comunicação
- Dashboard geral — total de devices, posições/dia, alertas, clientes ativos

**Fluxo de Onboarding:**
1. Admin cria tenant via painel admin
2. Admin cria o primeiro usuário do tenant (Supabase Auth cria em `auth.users`, trigger cria perfil em `public.profiles`)
3. Usuário recebe e-mail de confirmação, faz login, cadastra seus veículos e devices

## Modelo de Dados

### tenants
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| name | TEXT | |
| slug | TEXT (UNIQUE) | |
| plan | ENUM | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

### profiles
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | Mesmo UUID do `auth.users.id` |
| tenant_id | UUID (FK → tenants) | |
| role | ENUM (admin_platform, client) | |
| full_name | TEXT | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

> **Nota:** Tabela `profiles` é uma extensão do `auth.users` do Supabase. Não armazena email nem senha — esses dados vivem exclusivamente em `auth.users`. Um trigger `on_auth_user_created` cria o perfil automaticamente no signup.

### devices
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| imei | TEXT (UNIQUE) | |
| protocol | ENUM (suntech, ...) | |
| model | TEXT | |
| active | BOOLEAN | |
| last_communication_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

### vehicles
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| device_id | UUID (FK → devices, NULLABLE, UNIQUE) | Nullable — veículo pode estar sem rastreador. UNIQUE garante que um device não seja atribuído a dois veículos |
| plate | TEXT | |
| brand / model / year | TEXT / TEXT / INT | |
| color | TEXT | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

### positions
| Campo | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL (PK) | |
| device_id | UUID (FK → devices) | |
| tenant_id | UUID (FK → tenants) | Desnormalizado para RLS |
| location | PostGIS POINT (SRID 4326) | |
| speed | FLOAT | km/h |
| heading | FLOAT | graus |
| ignition | BOOLEAN | |
| altitude | FLOAT | |
| satellites | INT | |
| raw_data | JSONB | Dado bruto do protocolo |
| device_time | TIMESTAMPTZ | Timestamp do dispositivo |
| server_time | TIMESTAMPTZ | Timestamp do servidor |

> **Particionada por mês** (chave: `server_time`) — tabela de maior volume. Partições criadas automaticamente via pg_cron job que roda no 1º dia de cada mês, criando a partição do próximo mês. Na Fase 1 sem pg_cron, o Gateway executa `CREATE TABLE IF NOT EXISTS` da partição do mês atual no startup e a cada virada de mês.

### geofences
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| name | TEXT | |
| area | PostGIS POLYGON | |
| type | ENUM (inclusion, exclusion) | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

### alerts
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| device_id | UUID (FK → devices) | |
| type | ENUM (speed, geofence, ignition, battery) | |
| severity | ENUM (info, warning, critical) | |
| message | TEXT | |
| read | BOOLEAN | |
| metadata | JSONB | Dados extras (ex: velocidade registrada) |
| created_at | TIMESTAMPTZ | |

### alert_rules
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| device_id | UUID (FK → devices, NULLABLE) | Null = aplica a todos do tenant |
| type | ENUM (speed, geofence, ignition, battery) | |
| config | JSONB | Ex: {"max_speed": 120, "geofence_id": "uuid"} |
| notify_email | BOOLEAN | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

> **Nota:** `alert_rules` referencia `device_id` (não `vehicle_id`) porque o Alert Engine no Gateway processa posições por device. A associação device→vehicle é resolvida na camada de apresentação (Next.js).

### Decisões de Modelagem

- **Multi-tenancy via `tenant_id`** em todas as tabelas + Row Level Security (RLS) no PostgreSQL
- **`profiles` em vez de `users`** — extensão do `auth.users` do Supabase, sem duplicar email/senha
- **Device separado de Vehicle** — um rastreador pode ser movido entre veículos
- **`alert_rules` referencia `device_id`** — alinhado com o processamento no Gateway que trabalha por device
- **`raw_data` JSONB em positions** — guarda dado bruto do protocolo para debug e extração futura de campos sem migration
- **Particionamento mensal em `positions`** — a tabela que mais cresce, particionada por `server_time`

## Volume de Dados e Retenção

### Cálculo de volume

Assumindo intervalo de envio de 30 segundos por device e ~500 bytes por row:

| Devices | Rows/dia | Volume/dia | Volume/mês |
|---|---|---|---|
| 10 | 28.800 | ~14 MB | ~420 MB |
| 50 | 144.000 | ~72 MB | ~2.1 GB |
| 100 | 288.000 | ~144 MB | ~4.3 GB |
| 500 | 1.440.000 | ~720 MB | ~21 GB |

### Fase 1 — Free tier (limite 500MB)

O free tier do Supabase suporta confortavelmente **até ~10-15 devices** com retenção de 30 dias. Isso é suficiente para validação do produto com primeiros clientes beta.

### Política de retenção

- **Fase 1:** Retenção de 30 dias. Job no Gateway executa `DROP` da partição mais antiga mensalmente
- **Fase 2 (self-hosted):** Retenção configurável por plano do tenant (30, 60, 90 dias). Partições antigas movidas para cold storage (backup comprimido) antes de drop
- **Futuro:** TimescaleDB com compression policies para retenção longa com custo baixo de armazenamento

## Infraestrutura

### Fase 1 — Validação ($0/mês)

| Provedor | Serviço | Limites Free Tier |
|---|---|---|
| **Supabase Cloud** | PostgreSQL + PostGIS, Auth, Realtime, Studio | 500MB banco, 200 WS connections, 50k auth users |
| **Oracle Cloud** | Go Gateway (VM 1 vCPU, 1GB RAM) | Always Free — Go usa ~20-50MB RAM |
| **Vercel** | Next.js (frontend + API routes) | 100GB bandwidth/mês |

**Serviços externos:**
- DNS: Cloudflare
- E-mail alertas: Resend (free tier: 100 emails/dia)
- Monitoramento: Sentry free tier (error tracking), UptimeRobot (uptime check)

**Nota Oracle Cloud:** Abrir porta TCP 5001 no Security List da VCN para permitir conexões dos dispositivos GPS.

### Fase 2 — Monetizando → VPS Self-Hosted

Quando free tiers atingirem o limite e já houver receita:

- Migrar para VPS (Hostinger ou similar) com Supabase self-hosted via Docker
- Go Gateway, Next.js e Supabase na mesma VPS
- VPS recomendada: 8 vCPU, 16GB RAM, 100GB SSD
- **Migração suave:** mesmo schema, mesmo SDK — só troca variáveis de ambiente (URL + chaves)

### Caminho de Escala

- **Fase 1 (0-15 devices):** Free tiers — $0/mês (validação)
- **Fase 2 (15-2k devices):** VPS self-hosted — ~$30-50/mês
- **Fase 3 (2k-10k devices):** Gateway dedicado + múltiplas instâncias Next.js
- **Fase 4 (10k+):** Kubernetes + TimescaleDB para positions

### Deploy

- **Gateway:** Build Go → Docker image → deploy na Oracle Cloud
- **Web:** `git push` → Vercel deploy automático com preview por PR
- **Fase 2 (VPS):** GitHub Actions → test → build → SSH deploy → `docker compose pull && up -d`

## Segurança

- **Auth:** Supabase GoTrue — JWT, bcrypt, refresh tokens, rate limiting via Kong
- **Multi-tenant:** RLS no PostgreSQL com policies por `tenant_id` extraído do JWT (`auth.uid()` → `profiles.tenant_id`). Um tenant nunca acessa dados de outro
- **Gateway TCP:** Validação de IMEI (só devices cadastrados), timeout 60s em conexões inativas, rate limiting por IP, sanitização de dados antes do INSERT, buffer local para resiliência
- **Web:** HTTPS via Vercel, CORS restrito ao domínio, validação de input com Zod, headers de segurança (CSP, HSTS)
- **API:** Versionamento (`/api/v1/`), rate limiting via middleware Vercel

## Testes

- **Gateway (Go):**
  - Unit: parser de cada protocolo (dado bruto → struct), alert engine (posição + regra → alerta?), buffer de resiliência
  - Integration: conexão TCP fake → banco → verificar INSERT
  - Ferramentas: `go test`, testcontainers (PostgreSQL)

- **Web (Next.js):**
  - Unit: lógica de negócio (cálculos, formatação)
  - Integration: API routes com Supabase test environment
  - E2E: fluxos críticos (login → mapa → alertas)
  - Ferramentas: Vitest, Playwright

- **Simulador de Dispositivo:**
  - Script Go que simula rastreador Suntech enviando posições via TCP
  - Usado para: testes sem hardware, dados de demo, testes de carga

## Decisões Técnicas

| Decisão | Escolha | Motivo |
|---|---|---|
| Mapas | Leaflet + OpenStreetMap | Gratuito, sem limite de uso |
| ORM | Drizzle ORM | Type-safe, leve, bom DX |
| Validação | Zod | Integra com TypeScript |
| UI | Tailwind + shadcn/ui | Produtivo, consistente |
| Migrations | Drizzle Kit | Versionamento do schema |
| Estrutura do projeto | Diretórios `gateway/` e `web/` na raiz + Makefile | Go e TypeScript coexistem como projetos irmãos, Makefile orquestra comandos cross-project |
| Logging (Gateway) | Log estruturado JSON | Facilita parsing e busca em produção |
| Error tracking | Sentry (free tier) | Captura erros no Next.js e alertas do Gateway |
