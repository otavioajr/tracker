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
Dispositivo GPS → TCP/GPRS → Go Gateway (Oracle) → INSERT → PostgreSQL (Supabase)
                                                         → Supabase Realtime detecta INSERT via WAL
                                                         → WebSocket broadcast
                                                         → Next.js (Vercel) → Mapa do cliente atualiza
```

### Componentes

**1. Device Gateway (Go) — Oracle Cloud**

Servidor TCP que recebe dados brutos dos rastreadores e transforma em posições padronizadas.

- **TCP Listener** (:5001) — 1 goroutine por conexão persistente
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
- **PostgreSQL Writer** — batch insert (a cada 1s ou 100 posições)
- **Redis Publisher** — removido, substituído por Supabase Realtime
- **Alert Engine** — checa regras carregadas em memória contra cada posição recebida. Grava alertas no banco → Supabase Realtime notifica o cliente

**2. Web Platform (Next.js) — Vercel**

Frontend PWA + API routes usando Supabase SDK.

- **Auth:** Supabase Auth (GoTrue) — login, registro, JWT, refresh tokens, reset de senha
- **Realtime:** Supabase Realtime SDK — subscribe em mudanças na tabela `positions` filtrado por tenant
- **Mapas:** Leaflet + OpenStreetMap (gratuito, sem limites)
- **UI:** Tailwind CSS + shadcn/ui
- **Validação:** Zod
- **ORM:** Drizzle ORM + Drizzle Kit (migrations)

**API Routes:**

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Registro |
| GET | /api/auth/me | Usuário atual |
| GET/POST/PUT | /api/vehicles | CRUD veículos |
| GET/POST | /api/devices | CRUD dispositivos |
| GET | /api/devices/:id/positions | Posições de um device |
| GET/POST/DEL | /api/geofences | CRUD geocercas |
| GET | /api/alerts | Listar alertas |
| PUT | /api/alerts/:id/read | Marcar como lido |
| GET/POST/PUT | /api/alert-rules | CRUD regras de alerta |
| GET | /api/reports/trips | Relatório de viagens |
| GET | /api/reports/stops | Relatório de paradas |
| GET | /api/reports/mileage | Relatório de km rodado |

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

### users
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID (PK) | |
| tenant_id | UUID (FK → tenants) | |
| email | TEXT (UNIQUE) | |
| password_hash | TEXT | Gerenciado pelo Supabase Auth |
| role | ENUM (admin_platform, client) | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

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
| device_id | UUID (FK → devices, NULLABLE) | Nullable — veículo pode estar sem rastreador |
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

> **Particionada por mês** — tabela de maior volume, particionamento facilita queries por período e limpeza de dados antigos.

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
| vehicle_id | UUID (FK → vehicles, NULLABLE) | Null = aplica a todos |
| type | ENUM (speed, geofence, ignition, battery) | |
| config | JSONB | Ex: {"max_speed": 120} |
| notify_email | BOOLEAN | |
| active | BOOLEAN | |
| created_at / updated_at | TIMESTAMPTZ | |

### Decisões de Modelagem

- **Multi-tenancy via `tenant_id`** em todas as tabelas + Row Level Security (RLS) no PostgreSQL
- **Device separado de Vehicle** — um rastreador pode ser movido entre veículos
- **`raw_data` JSONB em positions** — guarda dado bruto do protocolo para debug e extração futura de campos sem migration
- **Particionamento mensal em `positions`** — a tabela que mais cresce

## Infraestrutura

### Fase 1 — Validação ($0/mês)

| Provedor | Serviço | Limites Free Tier |
|---|---|---|
| **Supabase Cloud** | PostgreSQL + PostGIS, Auth, Realtime, Studio | 500MB banco, 50k auth users |
| **Oracle Cloud** | Go Gateway (VM 1 vCPU, 1GB RAM) | Always Free — Go usa ~20-50MB RAM |
| **Vercel** | Next.js (frontend + API routes) | 100GB bandwidth/mês |

**Serviços externos:**
- DNS: Cloudflare
- E-mail alertas: Resend (free tier: 100 emails/dia)

### Fase 2 — Monetizando → VPS Self-Hosted

Quando free tiers atingirem o limite e já houver receita:

- Migrar para VPS (Hostinger ou similar) com Supabase self-hosted via Docker
- Go Gateway, Next.js e Supabase na mesma VPS
- VPS recomendada: 8 vCPU, 16GB RAM, 100GB SSD
- **Migração suave:** mesmo schema, mesmo SDK — só troca variáveis de ambiente (URL + chaves)

### Caminho de Escala

- **Fase 1 (0-500 devices):** Free tiers — $0/mês
- **Fase 2 (500-2k devices):** VPS self-hosted — ~$30-50/mês
- **Fase 3 (2k-10k devices):** Gateway dedicado + múltiplas instâncias Next.js
- **Fase 4 (10k+):** Kubernetes + TimescaleDB para positions

### Deploy

- **Gateway:** Build Go → Docker image → deploy na Oracle Cloud
- **Web:** `git push` → Vercel deploy automático com preview por PR
- **Fase 2 (VPS):** GitHub Actions → test → build → SSH deploy → `docker compose pull && up -d`

## Segurança

- **Auth:** Supabase GoTrue — JWT, bcrypt, refresh tokens, rate limiting via Kong
- **Multi-tenant:** RLS no PostgreSQL com policies por `tenant_id` extraído do JWT. Um tenant nunca acessa dados de outro
- **Gateway TCP:** Validação de IMEI (só devices cadastrados), timeout 60s em conexões inativas, rate limiting por IP, sanitização de dados antes do INSERT
- **Web:** HTTPS via Vercel, CORS restrito ao domínio, validação de input com Zod, headers de segurança (CSP, HSTS)

## Testes

- **Gateway (Go):**
  - Unit: parser de cada protocolo (dado bruto → struct), alert engine (posição + regra → alerta?)
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
| Monorepo | Turborepo | Packages: gateway, web, shared types |
