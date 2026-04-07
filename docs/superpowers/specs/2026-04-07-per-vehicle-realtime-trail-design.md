# Per-Vehicle Realtime Trail — Design Spec

**Data:** 2026-04-07  
**Área alvo:** `web/src/app/(dashboard)/dashboard-map.tsx` e componentes do mapa em `web/src/components/map/`

## Problema

O fluxo atual de despacho em tempo real permite selecionar e seguir veículos no mapa, mas não mostra o caminho recente percorrido enquanto o veículo está em movimento. Para operação, isso reduz a leitura espacial do deslocamento e dificulta validar rapidamente direção, manobras e continuidade de rota.

O pedido é adicionar uma flag por veículo para exibir rastro no mapa somente enquanto essa flag estiver marcada.

## Objetivo

Adicionar um controle por veículo no painel de despacho para ativar ou desativar o rastro daquele veículo no mapa em tempo real, com comportamento explícito e baixo impacto operacional:

- a flag fica dentro do card do próprio veículo;
- ao ligar, o rastro começa vazio;
- enquanto ligada, novas posições do veículo são acumuladas;
- ao desligar, o rastro daquele veículo é limpo;
- mais de um veículo pode manter rastro ao mesmo tempo;
- o rastro continua visível mesmo se outro veículo for selecionado depois.

## Abordagem Escolhida

Seguir a abordagem **cliente puro, sem backend novo**.

### Motivo

- reutiliza o mesmo stream realtime já consumido pela tela;
- não adiciona consultas extras ao banco;
- não altera gateway, Supabase ou protocolo de ingestão;
- concentra o custo no browser, onde ele pode ser controlado com limite de pontos por veículo.

### Alternativas descartadas

1. **Persistir o rastro em storage local**
   - preservaria a linha após refresh;
   - adiciona complexidade e comportamento menos previsível;
   - não foi pedido no escopo atual.

2. **Buscar ou persistir rastro no backend**
   - aumentaria custo de query e banda;
   - mistura realtime operacional com histórico;
   - é desnecessário para uma trilha efêmera de sessão.

## Comportamento

### Flag por veículo

Cada card de veículo no painel de despacho passa a exibir um controle `Mostrar rastro` logo abaixo do badge de status.

- `desligado`: o mapa não desenha trilha para aquele veículo;
- `ligado`: o mapa passa a acumular e desenhar a trilha daquele veículo a partir do momento da ativação.

### Regras da trilha

1. Ligar a flag cria um rastro vazio para aquele veículo.
2. Cada nova posição realtime recebida enquanto a flag está ligada adiciona um novo ponto à trilha.
3. Desligar a flag remove imediatamente a linha do mapa e limpa os pontos acumulados daquele veículo.
4. Trocar a seleção ou entrar em follow de outro veículo não limpa trilhas já ativas.
5. Mais de um veículo pode ter trilha ativa ao mesmo tempo.
6. Se o veículo parar de receber atualização, a trilha permanece com os últimos pontos já acumulados até a flag ser desligada.

### Relação com seleção e follow

- a trilha não depende de o veículo estar selecionado;
- a trilha não depende de o veículo estar em follow;
- selecionar um veículo continua ativando o fluxo atual de follow;
- o novo controle de rastro é complementar ao follow, não um substituto.

## Regras de performance

Para manter custo de infraestrutura praticamente nulo e proteger o browser:

- a trilha existe apenas no estado cliente da tela;
- nenhuma nova chamada ao backend deve ser feita para ativar ou manter o rastro;
- cada veículo com rastro ativo deve manter apenas uma janela limitada dos pontos mais recentes;
- o limite inicial recomendado é **300 pontos por veículo**.

Esse limite é suficiente para mostrar deslocamento recente sem deixar a sessão degradar rapidamente quando múltiplos rastros estiverem ativos.

## Arquitetura

```text
DashboardMap
  ├── estado atual do mapa (seleção, follow, filtros)
  ├── activeTrailDeviceIds: Set<string>
  ├── vehicleTrails: Record<string, TrailPoint[]>
  ├── DashboardVehicleBrowser
  │     └── DashboardVehicleListItem
  │           └── toggle "Mostrar rastro"
  └── TrackingMap
        ├── MapController
        ├── VehicleMarker[]
        └── VehicleTrailLayer[]
```

## Estado

### `activeTrailDeviceIds`

Coleção dos veículos com a flag ligada no momento.

Responsabilidades:

- determinar quais veículos devem acumular pontos;
- informar à lista quais cards estão com rastro ativo;
- controlar a visibilidade das trilhas no mapa.

### `vehicleTrails`

Mapa por `device_id` contendo os pontos acumulados em sessão.

Cada ponto deve armazenar no mínimo:

- latitude;
- longitude;
- `server_time`.

O `server_time` evita duplicação simples e ajuda a ignorar atualizações repetidas.

## Componentes e responsabilidades

### `DashboardMap`

Responsável por:

- manter `activeTrailDeviceIds`;
- manter `vehicleTrails`;
- ligar ou desligar a flag de cada veículo;
- observar as posições em tempo real e anexar pontos apenas aos veículos com rastro ativo;
- limpar o rastro do veículo quando a flag for desligada;
- passar os rastros ativos ao mapa para renderização.

### `DashboardVehicleBrowser`

Responsável por:

- receber informação de quais veículos estão com rastro ativo;
- encaminhar a ação de alternar o rastro por veículo;
- manter o restante do comportamento atual de busca, filtro e seleção.

### `DashboardVehicleListItem`

Responsável por:

- renderizar o controle `Mostrar rastro` dentro do card;
- manter o botão principal do card para seleção do veículo;
- impedir que a interação no toggle selecione o card por acidente.

### `TrackingMap`

Responsável por:

- receber a lista de trilhas ativas;
- renderizar uma camada de linha por veículo ativo;
- manter markers, seleção e follow como já funcionam hoje.

## Tratamento visual

Intent: expor a ação no contexto do veículo, sem criar uma barra global para uma decisão local.  
Palette: reaproveitar superfícies e bordas atuais do painel; usar o acento primário já existente no estado ativo do card.  
Depth: o controle de rastro deve parecer uma subcamada do card, não um bloco concorrente.  
Surfaces: fundo sutil, borda leve e contraste curto para não roubar atenção do nome/status do veículo.  
Typography: título curto e legível, com supporting text discreto quando houver espaço.  
Spacing: encaixar abaixo do badge de status e acima da linha de telemetria, mantendo densidade operacional.

## Renderização da trilha

Cada veículo ativo deve ser desenhado como uma `Polyline` do Leaflet usando os pontos acumulados em ordem cronológica.

Decisões:

- uma linha por veículo ativo;
- cor estável e legível sobre os mapas base atuais;
- espessura moderada para leitura rápida sem encobrir markers;
- opacidade suficiente para coexistir com múltiplos rastros.

O styling exato pode ser fechado no plano de implementação, mas deve priorizar legibilidade operacional em mapa claro.

## Edge cases

| Caso | Tratamento |
|------|-----------|
| Usuário liga o rastro e não chega nova posição | Linha continua vazia, sem fallback para histórico |
| Atualização repetida com mesma coordenada e mesmo `server_time` | Ignorar para não inflar a trilha artificialmente |
| Veículo some da lista filtrada, mas a flag estava ativa | A trilha segue no mapa enquanto a flag permanecer ativa |
| Usuário troca a seleção para outro veículo | Não limpar trilhas existentes |
| Muitos veículos com rastro ativo | Limite por veículo evita crescimento indefinido |
| Refresh da página | Trilhas somem, pois são efêmeras de sessão |

## Arquivos prováveis

### Modificados

- `web/src/app/(dashboard)/dashboard-map.tsx`
- `web/src/components/map/dashboard-vehicle-browser.tsx`
- `web/src/components/map/dashboard-vehicle-list-item.tsx`
- `web/src/components/map/tracking-map.tsx`
- `web/src/components/map/types.ts`

### Novos

- um componente leve para renderizar a linha de rastro no mapa, caso a extração melhore a clareza do `TrackingMap`

O nome exato pode ser decidido no plano, mas a separação só vale a pena se ajudar a manter o mapa legível.

## Escopo explícito

- Não persistir rastros no banco.
- Não buscar histórico retroativo ao ligar a flag.
- Não alterar a regra atual de seleção ou follow.
- Não adicionar métricas de infra ou configuração backend para esta feature.
- Não transformar a trilha em recurso de histórico ou playback.

## Critérios de sucesso

1. Usuário pode ativar `Mostrar rastro` diretamente no card de um veículo.
2. O rastro começa vazio no momento da ativação.
3. O mapa atualiza a linha conforme novas posições chegam.
4. Desligar a flag remove e limpa o rastro daquele veículo.
5. Múltiplos veículos podem exibir rastro ao mesmo tempo sem custo adicional de backend.
6. O browser permanece responsivo com o limite de pontos definido.

## Verificação

1. Abrir o mapa de despacho e localizar o toggle `Mostrar rastro` em um card.
2. Ligar o rastro de um veículo em movimento e confirmar que a linha começa vazia.
3. Aguardar novas posições e confirmar crescimento progressivo da linha.
4. Selecionar outro veículo e confirmar que a trilha já ativa continua visível.
5. Ligar o rastro de um segundo veículo e confirmar renderização paralela.
6. Desligar o rastro de um veículo e confirmar limpeza imediata da linha correspondente.
7. Validar que nenhuma nova query é disparada além do fluxo realtime já existente.
