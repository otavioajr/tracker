# History Player Improvements — Design Spec

**Data:** 2026-04-04
**Arquivo alvo:** `web/src/components/map/history-player.tsx`

## Problema

1. O marcador de posição atual no history player é um `CircleMarker` vermelho simples, enquanto o mapa principal usa um ícone SVG de carro estilizado. O usuário quer um marcador tipo waypoint/pin: ícone de carro com uma seta sutil apontando para baixo (indicando o ponto exato no mapa).

2. Durante o playback, o mapa pisca/flicka porque o `MapContainer` usa `key={mapCenter.join(",")}`, o que destrói e recria o mapa inteiro a cada 200ms. Isso causa reload de tiles, perda de estado, e uma experiência visual ruim.

## Solução

### 1. Marcador Waypoint — `createHistoryIcon()`

Criar uma função `createHistoryIcon()` que retorna um `L.DivIcon` com SVG combinado:

- **Parte superior:** Círculo com ícone de carro (mesmo SVG do `vehicle-marker.tsx`, cor verde `#22c55e`)
- **Parte inferior:** Triângulo/seta sutil apontando para baixo, mesma cor, como continuação do círculo — formando um shape de pin/waypoint
- **Dimensões:** SVG ~32x40 (32 de largura, 40 de altura para acomodar a seta)
- **iconAnchor:** Ponta da seta `[16, 40]` — o ponto exato no mapa
- **Orientação fixa:** O ícone não rotaciona com o heading

Substituir o `CircleMarker` atual por um `Marker` usando este ícone.

### 2. Câmera Suave — `HistoryMapController`

Criar um componente interno `HistoryMapController` dentro do `history-player.tsx`:

**Props:**
```typescript
{
  center: [number, number];  // posição atual do veículo
  initialCenter: [number, number];  // centro inicial ao carregar posições
}
```

**Comportamento:**
- Usa `useMap()` do react-leaflet para acessar a instância Leaflet
- Quando `center` muda, chama `map.setView(center, map.getZoom(), { animate: true })`
- Mantém o zoom atual do usuário (não força zoom 14 a cada frame)
- Na primeira renderização com posições, faz `setView` com zoom 15

**Mudanças no MapContainer:**
- Remover `key={mapCenter.join(",")}` — o mapa é criado uma vez e nunca destruído
- O `center` inicial do `MapContainer` é usado apenas na criação
- Toda movimentação subsequente é via `HistoryMapController`

## Mudanças no Arquivo

Todas as mudanças são em `web/src/components/map/history-player.tsx`:

1. **Adicionar** função `createHistoryIcon()` — retorna `L.DivIcon` com SVG waypoint
2. **Adicionar** componente `HistoryMapController` — gerencia câmera com `setView` animado
3. **Substituir** `CircleMarker` por `Marker` com `icon={createHistoryIcon()}`
4. **Adicionar** `HistoryMapController` dentro do `MapContainer`
5. **Remover** `key={mapCenter.join(",")}` do `MapContainer`
6. **Importar** `Marker` e `useMap` (adicionar aos imports existentes de react-leaflet)

## Escopo Explícito

- Não altera nenhum outro arquivo
- Não adiciona rotação por heading
- Não muda a velocidade de playback (200ms)
- Não altera a polyline da rota
- Não adiciona popup no marcador do history
