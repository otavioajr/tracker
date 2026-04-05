# Dashboard Map Redesign — Design Spec

**Data:** 2026-04-04  
**Área alvo:** `web/src/app/(dashboard)/page.tsx` e componentes do mapa/dashboard relacionados

## Problema

A tela atual do dashboard é essencialmente um mapa full-bleed com alguns overlays utilitários. Esse formato funciona para visualização geral, mas é lento para o fluxo operacional principal pedido pelo usuário:

1. Encontrar um veículo específico rapidamente.
2. Colocar esse veículo em follow sem depender de abrir popup no marker.
3. Manter o mapa como contexto principal, sem transformar a página em uma tela de KPIs.

Hoje o follow depende do popup do marker, a seleção não tem um painel dedicado, e no mobile não existe um padrão claro para busca e navegação entre veículos.

## Objetivo

Redesenhar a tela de mapa como uma interface de despacho/monitoramento com:

- mapa ainda dominante;
- trilho lateral recolhível no desktop para busca, filtros rápidos e lista enxuta de veículos;
- bottom sheet no mobile com o mesmo papel do trilho;
- fluxo primário otimizado para encontrar e seguir um veículo específico;
- linguagem visual consistente com o dashboard atual, sem ampliar o escopo para um redesign global do sistema.

## Abordagem Escolhida

Seguir a abordagem **mapa-first com trilho recolhível**.

### Decisões aprovadas pelo usuário

- Direção: despacho/monitoramento
- Densidade da lista: essencial
- Mobile: bottom sheet
- Fluxo principal a acelerar: encontrar e seguir um veículo específico

## Layout

### Desktop

A página passa a ter duas camadas principais:

1. **Mapa dominante**
   - continua ocupando a maior parte da área útil;
   - recebe apenas overlays essenciais;
   - permanece como contexto geográfico principal.

2. **Trilho lateral recolhível à direita**
   - largura compacta, suficiente para busca, filtros e lista;
   - pode ser recolhido para devolver área ao mapa;
   - fechado, permanece visível como uma aba estreita com contexto mínimo.

### Mobile

Manter o mapa em tela cheia e substituir o trilho por um **bottom sheet** com três estados úteis:

1. colapsado;
2. semiaberto;
3. expandido.

Ao selecionar um veículo, a folha recua para devolver área ao mapa, sem perder acesso à lista.

## Fluxo Principal

### 1. Encontrar

- Campo de busca sempre visível no topo do trilho/bottom sheet.
- Busca por nome, placa ou identificador.
- Filtragem instantânea, sem submit.

### 2. Selecionar

- Clicar na linha de um veículo seleciona o item e centraliza o mapa.
- Clicar no marker também sincroniza a seleção com a lista e entra no mesmo fluxo de follow da seleção pela lista.
- A seleção passa a ser um estado explícito da tela, não um efeito colateral do popup.

### 3. Seguir

- Seleção aciona o estado de follow no fluxo principal.
- A linha selecionada fica destacada na lista.
- Uma barra compacta sobre o mapa mostra o veículo seguido, velocidade atual e ação clara para sair do follow.

### 4. Sair do follow

- Arrastar o mapa cancela o follow, mas preserva a seleção do veículo.
- A busca atual e os filtros não são limpos ao sair do follow.
- O botão `Ver todos` continua disponível como ação secundária clara.

## Componentes da Tela

### 1. Painel de seleção de veículos

Estrutura fixa:

- campo de busca;
- filtros rápidos `Todos`, `Em movimento`, `Parados`, `Sem sinal`;
- lista rolável de veículos.

### 2. Linha de veículo

Cada item da lista mostra somente:

- nome e/ou placa;
- status operacional;
- velocidade;
- último sinal.

O layout da linha deve ser enxuto, em duas faixas visuais:

- faixa principal com nome/placa;
- faixa secundária com status, velocidade e último sinal.

### 3. Barra de follow

Substitui a sensação de “badge solto” por uma barra curta com papel mais claro de estado de navegação:

- nome/placa;
- velocidade;
- status;
- ação para sair do follow.

### 4. Controles do mapa

Permanecem no mapa, mas com linguagem mais coesa com o restante da tela:

- `Ver todos`;
- contador de veículos;
- controle para abrir/recolher o trilho.

### 5. Markers e popup

- O marker continua codificado por status.
- O popup deixa de ser o centro do fluxo.
- O popup pode permanecer como detalhe rápido, mas não deve ser o único caminho para follow.

## Tratamento Visual

Intent: mapa principal com painel utilitário de seleção, priorizando velocidade operacional.  
Palette: base neutra existente do dashboard, acento primário apenas para seleção e follow, cores semânticas reservadas para status.  
Depth: mapa no plano base; trilho, bottom sheet e overlays um nível acima com contraste curto.  
Surfaces: painéis com blur leve, borda sutil e transparência moderada para preservar o contexto geográfico.  
Typography: compacta, legível e com números usando `tabular-nums` quando fizer sentido.  
Spacing: densa, mas sem cair em aparência de tabela comprimida.

## Estados e Regras de Interface

### Estados de status

Os veículos devem ser classificados visualmente como:

- `Em movimento`
- `Parado`
- `Sem sinal`

Cor entra apenas em badges/pontos de status, sem pintar a linha inteira.
Os thresholds que definem esses estados devem reaproveitar a lógica operacional já existente no mapa atual, evitando mudança implícita de regra de negócio no redesign visual.

### Estados vazios

- **Sem veículos:** estado vazio claro na lista, mantendo o mapa disponível.
- **Busca sem resultado:** vazio local na lista, sem alterar o mapa.
- **Carregando:** placeholder/skeleton no painel e placeholder simples no mapa.

### Consistência de tempo

`Último sinal` deve ser exibido em formato relativo curto, por exemplo:

- `agora`
- `3 min`
- `42 min`

## Arquivos Prováveis

### Modificados

- `web/src/app/(dashboard)/page.tsx`
- `web/src/app/(dashboard)/dashboard-map.tsx`
- `web/src/components/map/tracking-map.tsx`
- `web/src/components/map/vehicle-marker.tsx`
- `web/src/components/map/map-controller.tsx`

### Novos

O redesign pode justificar componentes dedicados para manter responsabilidades claras, por exemplo:

- um componente para o painel/trilho de veículos;
- um componente para a linha de veículo;
- um componente para a barra de follow;
- um componente para o bottom sheet mobile.

Os nomes exatos podem ser definidos no plano, mas a separação deve evitar concentrar toda a interface em um único arquivo grande.

## Escopo Explícito

- Não redesenhar a sidebar global nem o header global do dashboard.
- Não transformar a página em um cockpit analítico com KPIs extras.
- Não alterar o protocolo do mapa, realtime ou a origem dos dados.
- Não introduzir filtros avançados além dos status rápidos aprovados.
- Não redesenhar módulos fora da página principal do mapa.

## Critérios de Sucesso

1. Usuário encontra e segue um veículo sem depender do popup.
2. Lista e mapa permanecem sincronizados para seleção.
3. O mapa continua sendo o elemento dominante da página.
4. O mobile mantém acesso rápido à lista sem esconder o mapa por padrão.
5. A nova interface parece uma evolução coerente do dashboard existente, não uma tela visualmente desconectada.

## Verificação

1. Abrir o dashboard em desktop e confirmar presença do trilho recolhível.
2. Buscar um veículo por nome, placa ou identificador.
3. Selecionar um veículo pela lista e verificar centralização + follow no mapa.
4. Selecionar um marker e verificar sincronização com a lista.
5. Arrastar o mapa e confirmar cancelamento do follow sem perder seleção.
6. Usar `Ver todos` e confirmar retorno ao contexto geral da frota.
7. Validar o bottom sheet no mobile nos estados colapsado, semiaberto e expandido.
