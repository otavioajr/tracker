# Follow Mode & Fit All — Design Spec

## Contexto

O mapa principal já exibe veículos em tempo real via Supabase, mas o viewport é estático. O usuário precisa acompanhar veículos em movimento sem recarregar a página. Esta feature adiciona dois recursos: (1) Follow mode — centralizar e acompanhar um veículo específico, e (2) Fit All — ajustar o viewport pra caber todos os veículos.

## Comportamento

### Follow Mode
1. Clicar no marker → popup existente com info do veículo + botão "Seguir veículo"
2. Ao clicar "Seguir":
   - Popup fecha
   - Mapa centraliza no veículo com zoom 16
   - Badge azul no topo: "Seguindo: [Nome] — [Velocidade] km/h"
   - Hint discreto no rodapé: "Arraste o mapa para sair do modo follow"
   - Conforme novas posições chegam via real-time, mapa re-centraliza automaticamente
3. Usuário pode ajustar zoom manualmente sem sair do follow
4. **Sair do follow**: arrastar o mapa desativa automaticamente

### Fit All (Ver Todos)
1. Botão "Ver todos" no canto inferior direito (sempre visível)
2. Ajusta viewport pra caber todos os veículos com padding
3. Se follow mode estiver ativo, desativa antes de fazer o fit

## Arquitetura

```
DashboardMap (state: followedDeviceId, fitAllTrigger)
  ├── FollowBadge (overlay, top-center)
  ├── FollowHint (overlay, bottom-center)
  ├── FitAllButton (overlay, bottom-right)
  └── TrackingMap (recebe props de follow)
        ├── MapController (useMap(), controla viewport)
        └── VehicleMarker[] (onFollow callback no popup)
```

**Estado**: `followedDeviceId: string | null` em `DashboardMap`. Fit all usa um counter `fitAllTrigger: number` incrementado a cada clique.

## Arquivos

### Novo
- `web/src/components/map/map-controller.tsx` — componente invisível (`return null`) dentro do `MapContainer` que usa `useMap()` pra controlar o viewport

### Modificados
- `web/src/app/(dashboard)/dashboard-map.tsx` — estado, callbacks, overlay UI (badge, hint, botão)
- `web/src/components/map/tracking-map.tsx` — novos props, renderiza `MapController`, passa `onFollow` aos markers
- `web/src/components/map/vehicle-marker.tsx` — prop `onFollow`, botão "Seguir veículo" no popup

## Detalhes de Implementação

### MapController (`map-controller.tsx`)

Componente filho de `MapContainer`, usa `useMap()`. Três responsabilidades:

1. **Follow**: `useEffect` observa `followedDeviceId` + `positions`. Quando ativo, chama `map.setView()`. Na primeira ativação usa zoom 16, nas atualizações seguintes preserva o zoom atual do usuário.
2. **Drag cancel**: `useEffect` escuta evento `dragstart` do Leaflet → chama `onCancelFollow()`. Leaflet não dispara `dragstart` em `setView()` programático, então não há conflito.
3. **Fit all**: `useEffect` observa `fitAllTrigger`. Computa `L.latLngBounds` das posições e chama `map.fitBounds()` com padding `[50, 50]`.

### VehicleMarker (`vehicle-marker.tsx`)

- Novo prop opcional: `onFollow?: (deviceId: string) => void`
- Botão "Seguir veículo" azul (#3b82f6) abaixo do conteúdo existente do popup
- Usa `ref` no `Marker` pra fechar o popup explicitamente antes de chamar `onFollow`
- Estilo inline (consistente com o popup existente)

### DashboardMap (`dashboard-map.tsx`)

- Estado: `followedDeviceId`, `fitAllTrigger`
- `handleFollow`, `handleCancelFollow`, `handleFitAll` com useCallback
- `followedVehicle` derivado via `positions.find()`
- Overlay UI: badge, hint, botão — todos com `position: absolute`, `zIndex: 1000`

## Edge Cases

| Caso | Tratamento |
|------|-----------|
| Veículo fica offline durante follow | MapController ignora (guard `if (!pos) return`), mapa fica na última posição conhecida |
| Nenhuma posição para fit all | Guard `if (positions.length === 0) return`, nada acontece |
| Uma única posição para fit all | Usa `setView` com zoom 14 em vez de `fitBounds` |
| Zoom manual durante follow | Preservado — só a ativação inicial usa zoom 16 |
| Clicar "Seguir" no veículo já seguido | No-op — mesmo `followedDeviceId`, sem reset de zoom |

## Verificação

1. Subir o gateway + simulator pra gerar posições em movimento
2. Abrir o dashboard, verificar que o botão "Ver todos" aparece e funciona
3. Clicar em um veículo → popup deve ter botão "Seguir veículo"
4. Ativar follow → badge azul aparece, mapa centraliza e acompanha
5. Arrastar o mapa → follow desativa, badge some
6. Com follow ativo, clicar "Ver todos" → follow desativa, viewport ajusta
7. Testar com 0, 1 e N veículos
