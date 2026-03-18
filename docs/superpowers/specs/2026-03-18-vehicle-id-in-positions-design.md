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

- Adicionar coluna `vehicle_id UUID` (nullable) à tabela `positions`
- Criar índice `idx_positions_vehicle_id` em `positions(vehicle_id)`
- Criar índice composto `idx_positions_vehicle_time` em `positions(vehicle_id, server_time DESC)`
- Backfill dos dados existentes: resolver `vehicle_id` a partir da associação atual `vehicles.device_id = positions.device_id`

A coluna é nullable porque um device pode não ter veículo associado.

### 2. Gateway (Go)

**`storage.DeviceInfo`** — adicionar campo `VehicleID string`.

**`Writer.LoadDevices`** — alterar a query para incluir LEFT JOIN com vehicles:

```sql
SELECT d.id, d.tenant_id, d.imei, v.id
FROM devices d
LEFT JOIN vehicles v ON v.device_id = d.id
WHERE d.active = true
```

**`buildBatchInsert`** — incluir `vehicle_id` no INSERT. Se `VehicleID` estiver vazio, inserir `NULL`.

Nenhuma mudança de arquitetura. O cache existente é expandido com um campo e o batch insert ganha um parâmetro.

### 3. Web (Frontend)

**`src/lib/actions/positions.ts`**:
- `getPositionHistory` passa a receber `vehicleId` e filtrar por `.eq("vehicle_id", vehicleId)`
- Tipo `VehiclePosition` ganha campo opcional `vehicle_id`

**`src/components/map/history-player.tsx`**:
- Seletor muda de lista de devices para lista de veículos
- Usuário escolhe veículo pela placa (mais intuitivo)

**Sem mudança:**
- `getLatestPositions` — mapa em tempo real continua por `device_id`
- `use-realtime-positions.ts` — realtime continua por `device_id`
- RLS — `tenant_id` continua sendo o filtro de segurança, `vehicle_id` não precisa de policy própria

## Escopo explicitamente fora

- Tabela de histórico de associações device↔veículo (descartado por simplicidade)
- Trigger no banco para preencher vehicle_id (descartado por performance em tabela particionada de alto volume)
- Alteração no mapa em tempo real ou realtime subscription
