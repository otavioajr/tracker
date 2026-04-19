# Dashboard Map Rotation — Design Spec

**Data:** 2026-04-18
**Área alvo:** `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/components/map/tracking-map.tsx`, `web/src/components/map/map-controller.tsx` e um novo controlador de rotação em `web/src/components/map/`.

## Problema

O mapa principal do dashboard opera em `north-up` fixo. Dois cenários operacionais concretos motivam a mudança:

1. Leitura espacial de rotas durante acompanhamento em tempo real — o operador quer alinhar o mapa ao corredor viário onde o veículo anda, não ao norte magnético.
2. Uso em tablet no campo — o usuário gira o dispositivo e espera o mapa acompanhar via gesto de dois dedos.

A feature deve entregar isso sem reescrever o mapa atual e com caminho claro de desligamento caso a camada de rotação se mostre instável.

## Objetivo

Adicionar rotação interativa apenas ao mapa principal do dashboard, preservando a stack `Leaflet + react-leaflet` e mantendo follow, fit all, trilhas e markers intocados.

A v1 deve suportar:

- desktop: `Ctrl + arrastar com botão esquerdo` para rotacionar;
- mobile/tablet: gesto de dois dedos para rotacionar;
- permanência do bearing atual após o gesto;
- botão de reset para o norte visível **apenas** quando o bearing ≠ 0;
- convivência com follow mode (gesto de rotação **não** cancela follow);
- "Ver todos" mantém o ângulo atual e ajusta só centro/zoom;
- retorno ao bearing `0` em reload (nada persiste);
- rollback imediato por feature flag via env var.

## Decisão de Produto

Manter o mapa principal no Leaflet 1.9 e adicionar rotação como uma camada isolada atrás de um controlador dedicado e de uma feature flag por env var.

### Motivo

- Preserva markers, trilhas, follow, fit all, layers control e overlays sem reescrita.
- Concentra risco em um único controlador novo, com rollback por flag.
- Evita persistir bearing (escopo efêmero, reduz superfície de decisão de UI).
- Deixa a porta aberta para migração futura de engine sem comprometer-se agora.

## Alternativas Consideradas

1. **Fork `leaflet-rotate-map` como substituto do pacote `leaflet`** (BSD-2-Clause) — alternativa recomendada. Fork do Leaflet 1.9 que adiciona `rotate: true` no construtor do mapa, `getBearing()`, `setBearing()`, evento `rotate`, rotação de markers/popups. Instalado via `npm alias` no nome `leaflet`, de modo que `react-leaflet` continua compatível. **Não** fornece gestos prontos (`dragRotate`/`touchRotate`) — os handlers Ctrl+drag e dois-dedos são implementados no `MapRotationController`.
2. **Plugin `leaflet-rotate` original** — descartado: é **GPL-3.0**, incompatível com SaaS proprietário.
3. **Migrar dashboard para MapLibre GL JS** — bearing nativo e base mais sólida a longo prazo, mas exige reescrever markers, trilhas, popups, layer control e tiles. Custo desproporcional para uma feature de bearing.
4. **CSS transform no container do mapa** — quebra hit testing, popups, matemática de pan/zoom e gestures touch. Descartada por aumentar risco operacional.

## Escopo da V1

Dentro do escopo:

- rotação apenas no mapa principal do dashboard (`DashboardMap`);
- bearing efêmero, local à sessão da página;
- botão "Norte" condicional (só aparece quando bearing ≠ 0);
- preservação do follow durante rotação;
- desktop e mobile/tablet;
- feature flag `NEXT_PUBLIC_ENABLE_MAP_ROTATION` (off por padrão).

Fora do escopo:

- rotação no player de histórico ou em qualquer outro mapa do sistema;
- persistir bearing entre reloads ou sessões;
- pitch, 3D, tilt;
- redesign visual de markers por causa da rotação;
- substituir a stack de mapas;
- flag por tenant ou por usuário.

## Regras de Comportamento

### Desktop

- arraste simples com botão esquerdo continua fazendo pan;
- `Ctrl + botão esquerdo + arrastar` entra em rotação;
- ao soltar, o mapa permanece no bearing atual;
- esse gesto **não** cancela follow.

### Mobile / tablet

- gesto de dois dedos girando rotaciona o mapa somente quando a feature estiver ativa;
- pan (um dedo) e zoom (pinça) continuam disponíveis;
- rotacionar no touch **não** cancela follow.

### Reset para norte

- quando o bearing for diferente de `0` (tolerância de meio grau), um botão "Norte" aparece no overlay do mapa, vizinho ao botão "Ver todos";
- clique/toque no botão volta o bearing para `0`;
- com bearing em `0`, o botão fica oculto.

### Follow mode

- entrar em follow e rotacionar mantém o follow ativo;
- atualizações de posição seguem recentrando o mapa rotacionado;
- a regra existente "drag cancela follow" continua valendo para drag comum;
- apenas o gesto de rotação é exceção — o controlador de rotação sinaliza "gesture ativa" e o `MapController` pula o cancel durante esse período.

### "Ver todos"

- o botão continua ajustando centro e zoom com base nas posições;
- o bearing atual é preservado (não reseta para norte automaticamente);
- se `fitBounds`/`setView` do plugin não preservar bearing nativamente, salvar antes e restaurar depois dentro do `MapController`.

### Reload

- ao recarregar a página o mapa volta em `0deg`;
- o bearing não entra na camada de preferências persistidas.

## Arquitetura

```text
DashboardMap                         (dona da flag, bearing state, reset trigger)
  └── TrackingMap                    (propaga props, cria ref compartilhado)
        ├── MapController            (follow + fit all, com guarda anti-cancel)
        ├── MapRotationController    (novo: plugin, gesture events, reset)
        ├── VehicleTrailLayer[]
        └── VehicleMarker[]
```

### Separação de responsabilidades

`DashboardMap` mantém seleção, follow, filtros, trilhas, preferências e agora também: flag, bearing atual e trigger de reset. Bearing não vai pra `dashboard-map-preferences`.

`TrackingMap` segue responsável por montar `MapContainer`, layers, markers, trilhas. Passa a criar o `rotationInteractionRef` e a montar `MapRotationController` como irmão do `MapController`.

`MapController` continua cuidando de follow, fit all e cancel por drag. Ganha uma prop `interactionStateRef` e consulta `isRotating` antes de cancelar follow no `dragstart`. Também preserva bearing em `fitBounds` via salva-restaura explícito como rede de proteção.

`MapRotationController` (novo) concentra a integração com o fork `leaflet-rotate-map`. Responsabilidades:

- instalar os handlers customizados de gesture (Ctrl+drag no desktop, 2 dedos no touch) quando `enabled === true`;
- marcar `interactionStateRef.current.isRotating` durante o gesture para o `MapController` não cancelar follow;
- escutar o evento `rotate` do mapa (emitido pelo fork em toda mudança de bearing) e reportar o valor normalizado (0–360) via `onBearingChange`;
- observar `resetRotationTrigger` e chamar `setBearing(0)` quando muda;
- limpar listeners, estado e bearing no unmount.

### Implementação dos Gestos

O fork `leaflet-rotate-map` entrega apenas a matemática/renderização (pane rotacionado, `setBearing`, `getBearing`, evento `rotate`). Os gestos de entrada são implementados no controlador:

- **Ctrl + drag (desktop):** listener em `mousedown` no container do mapa, em fase de captura. Se `event.ctrlKey && event.button === 0`, o listener chama `stopPropagation` para impedir Leaflet de iniciar pan, marca `isRotating = true`, guarda o ângulo inicial entre o ponteiro e o centro do container, e escuta `mousemove`/`mouseup` no `document`. Em `mousemove`, calcula o delta angular e chama `map.setBearing(map.getBearing() + delta)`. Em `mouseup`, desmarca `isRotating` e remove os listeners do documento.
- **Dois dedos (touch):** listener em `touchstart` no container apenas guarda baseline (ângulo e distância entre os dois toques) e não intercepta o evento. A decisão acontece no primeiro `touchmove` com dois toques: se a variação angular atingir pelo menos `8deg` e dominar proporcionalmente a variação de distância, o gesto entra em rotação, passa a marcar `isRotating = true` e só então chama `stopPropagation` / `preventDefault` antes de aplicar `setBearing`. Se a distância dominar primeiro (pinch), o controlador nunca intercepta e o Leaflet continua responsável pelo zoom.

Ambos expõem funções puras para cálculo angular (`angleBetweenPoints`, `angleDelta`) para facilitar cobertura unitária.

### Feature Flag

`NEXT_PUBLIC_ENABLE_MAP_ROTATION` com leitura centralizada em `web/src/lib/map/map-rotation-feature.ts`. Parser aceita `1`, `true`, `on`, `yes` (case-insensitive) como ligado; qualquer outro valor (inclusive ausente ou vazio) fica desligado. Default no `.env.local.example` é `0`.

### Fluxo de Dados

Props descendo:

```
DashboardMap
  ├─ rotationEnabled       ──→ TrackingMap ──→ MapRotationController.enabled
  ├─ resetRotationTrigger  ──→ TrackingMap ──→ MapRotationController.resetRotationTrigger
  └─ onBearingChange       ──→ TrackingMap ──→ MapRotationController.onBearingChange
```

Ref compartilhado criado em `TrackingMap`:

```
const rotationInteractionRef = useRef({ isRotating: false })
  ├─→ MapController.interactionStateRef         (consulta)
  └─→ MapRotationController.interactionStateRef (escreve)
```

Sequência do gesto (desktop Ctrl+drag ou touch 2 dedos):

1. Listener de gesture detecta `mousedown` com Ctrl ou `touchstart` com 2 dedos.
2. No desktop, o gesto já entra direto em rotação e chama `stopPropagation` para o Leaflet não iniciar pan.
3. No touch, o controlador fica em estado "undecided" até o primeiro `touchmove`: se o ângulo dominar, entra em rotação e só a partir daí intercepta o evento; se a distância dominar primeiro, fixa o gesto como pinch e deixa o Leaflet cuidar do zoom.
4. Cada `mousemove`/`touchmove` já classificado como rotação calcula delta angular e chama `map.setBearing(current + delta)`. O fork emite `rotate`; o listener do controlador captura o bearing e chama `onBearingChange(normalize(bearing))`.
5. Se por qualquer motivo Leaflet emitir `dragstart` nesse período, `MapController` vê `isRotating === true` e **não** cancela follow.
6. `mouseup` / queda abaixo de 2 toques → marca `isRotating = false`; no touch, o `onBearingChange` final só roda se o gesto realmente virou rotação.

Estado novo em `DashboardMap`:

- `rotationEnabled: boolean` — derivado da flag uma vez no render.
- `mapBearing: number` — controlado via callback; usado só para `showResetRotation = rotationEnabled && Math.abs(mapBearing) > 0.5`.
- `resetRotationTrigger: number` — contador incremental; incrementa a cada clique em "Norte".

Estado que permanece igual:

- `selectedDeviceId`, `followedDeviceId`, `fitAllTrigger`, filtros, trilhas, preferências persistidas.

## Impacto nos Arquivos

### Modificados

- `web/src/app/(dashboard)/dashboard-map.tsx` — flag, bearing state, trigger, botão "Norte" condicional.
- `web/src/components/map/tracking-map.tsx` — aceita novas props, cria ref compartilhado, monta `MapRotationController`, passa `rotate={rotationEnabled}` para `MapContainer`.
- `web/src/components/map/map-controller.tsx` — aceita `interactionStateRef`, exporta `shouldCancelFollowOnMapDrag`, preserva bearing em fit all.
- `web/.env.local.example` — documenta a flag off por padrão.
- `web/package.json` / `web/package-lock.json` — substitui `leaflet` pelo alias npm `leaflet-rotate-map`.
- Testes correspondentes (`dashboard-map.test.tsx`, `map-controller.test.ts`).

### Novos

- `web/src/lib/map/map-rotation-feature.ts` + teste.
- `web/src/components/map/map-rotation-controller.tsx` + teste.

## Tratamento de Erros e Compatibilidade

### Flag desligada

Com `rotationEnabled === false`, o mapa é criado **sem** `rotate: true`, então o fork se comporta exatamente como o Leaflet normal (zero overhead de rotação). O `MapRotationController` vê `enabled === false`, garante `isRotating = false` e `onBearingChange(0)`, não registra nenhum listener.

### Capacidade de rotação ausente

`supportsMapRotation(map)` verifica presença de `getBearing` e `setBearing` no mapa antes de registrar listeners. Se ausentes (por exemplo, `leaflet-rotate-map` falhou ao carregar e o build caiu em `leaflet` puro), o controlador cai em fallback silencioso — mapa funciona 100% em north-up, botão "Norte" nunca aparece.

### Conflito com fit all

Como rede de proteção, `MapController` salva `getBearing()` antes de chamar `fitBounds` e reaplica o bearing depois. Mesmo que o fork já preserve, o código é idempotente e barato.

### SSR

`MapRotationController` e o import do plugin entram como `dynamic(() => ..., { ssr: false })`. Nada vaza para o bundle do servidor.

### Licença e manutenção do plugin

Validação prévia já executada em 2026-04-18: `leaflet-rotate` é GPL-3.0 (rejeitado) e `leaflet-rotate-map@0.3.1` é BSD-2-Clause (aceito). O fork é instalado como alias no nome `leaflet` (`"leaflet": "npm:leaflet-rotate-map@0.3.1"`) para manter `react-leaflet` e os imports existentes intactos.

## Cobertura de Testes

### Unitários

- `map-rotation-feature.test.ts`: parser truthy/falsey, case-insensitive, valor ausente.
- `map-rotation-controller.test.ts` com stub de `map`:
  - `normalizeMapBearing` — `-90 → 270`, `360 → 0`, `450 → 90`.
  - `supportsMapRotation` — detecta mapa sem `getBearing`/`setBearing`.
  - `angleBetweenPoints` / `angleDelta` — cálculo angular puro, incluindo wrap em ±180°.
  - `attachCtrlDragRotation` com container e `map` stub — `mousedown` com Ctrl liga `isRotating` e chama `stopPropagation`; `mousemove` chama `setBearing` com delta correto; `mouseup` desliga `isRotating`; cleanup remove listeners.
  - `attachTouchRotation` com container e `map` stub — pinch puro não intercepta `touchmove`; rotação só começa quando a variação angular domina a distância; gesto que vira pinch cedo continua pinch até o fim; queda para <2 toques só publica bearing final se houve rotação.
- `map-controller.test.ts` — `shouldCancelFollowOnMapDrag(false) === true`, `(true) === false`.
- `dashboard-map.test.tsx`:
  - flag off: `rotation-enabled:no`, botão "Norte" nunca aparece;
  - flag on: botão "Norte" só aparece após `onBearingChange(90)`; clique incrementa `resetRotationTrigger`.

### Verificação manual

1. Flag `0`: dashboard se comporta exatamente como hoje.
2. Flag `1` desktop: `Ctrl + drag` rotaciona; drag simples faz pan.
3. Flag `1` touch emulator / tablet real: dois dedos rotacionam; um dedo faz pan.
4. Entrar em follow, rotacionar: follow permanece ativo e recentros seguem funcionando.
5. "Ver todos" com mapa rotacionado: só centro/zoom mudam, bearing preservado.
6. Botão "Norte" volta bearing para `0` e o botão some.
7. Reload: mapa abre em north-up.
8. Clicar markers e abrir popups com mapa rotacionado: funciona normalmente.
9. Alternar trilhas com mapa rotacionado: linhas alinhadas ao mapa.

## Critérios de Sucesso

1. Desktop permite `Ctrl + drag` para rotacionar no mapa principal.
2. Mobile/tablet permite rotação com dois dedos sem degradar pan/zoom.
3. O gesto de rotação (desktop ou mobile) **não** cancela follow mode.
4. Botão "Norte" aparece só quando bearing ≠ 0 e devolve o mapa ao norte com previsibilidade.
5. "Ver todos" mantém o bearing atual e ajusta apenas centro/zoom.
6. Reload sempre devolve o mapa para bearing `0`.
7. Desligar `NEXT_PUBLIC_ENABLE_MAP_ROTATION` restaura o comportamento atual sem rebuild de UX.
8. Falha na camada de rotação (plugin ausente, incompatível ou quebrado) não derruba o dashboard — mapa segue funcional em north-up.
