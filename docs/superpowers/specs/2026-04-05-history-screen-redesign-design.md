# History Screen Redesign — Design Spec

## Contexto

A tela atual de histórico funciona como uma composição linear de filtros, mapa e controles de playback. Ela permite consultar uma rota, mas não prioriza a leitura operacional rápida da viagem. O usuário precisa montar mentalmente o contexto entre mapa, posição atual e metadados, e o bloco de playback aparece como um controle isolado em vez de participar da análise.

O objetivo deste redesign é transformar a tela em um painel de missão para leitura de uma viagem: mapa como foco visual, resumo operacional imediatamente legível e navegação pelo replay sem quebrar o contexto.

## Objetivo de Produto

Priorizar análise operacional rápida de uma viagem já consultada.

Isso significa:
- entender o panorama da rota com um único olhar;
- identificar distância, duração, tempo parado e velocidade máxima sem inspeção manual;
- navegar por trechos importantes sem depender apenas de play linear;
- manter o mapa como centro da experiência.

Não é objetivo desta etapa transformar a tela em uma ferramenta de auditoria profunda com tabelas extensas ou painéis densos de telemetria.

## Direção de Interface

Intent: transformar a tela de histórico em um painel de missão orientado por mapa e resumo de viagem.  
Palette: base neutra do dashboard, azul para rota, verde para deslocamento/estado ativo e âmbar para paradas e atenção.  
Depth: superfícies sutis com bordas leves e quase nenhuma sombra pesada.  
Surfaces: cabeçalho operacional, mapa principal e coluna lateral fixa como trilhos claros de leitura.  
Typography: títulos curtos, hierarquia compacta e números tabulares para métricas.  
Spacing: ritmo estável em 8/12/16/24px para evitar blocos soltos.

## Estrutura da Tela

O layout deixa de ser uma pilha vertical simples e passa a operar em três camadas:

1. **Cabeçalho operacional**
   - concentra veículo, período e ação de busca;
   - funciona como bloco único de contexto, não como formulário espalhado;
   - deve continuar compacto o suficiente para não competir com o mapa.

2. **Área principal com mapa dominante**
   - ocupa a maior parte da largura disponível;
   - apresenta a rota como elemento primário;
   - recebe também a barra principal de playback e uma faixa compacta de métricas rápidas.

3. **Coluna lateral fixa**
   - permanece visível no desktop;
   - complementa o mapa em vez de competir com ele;
   - organiza resumo, destaques e estado do ponto atual em ordem de leitura.

## Hierarquia de Conteúdo

### 1. Resumo da viagem

Este é o bloco mais importante da lateral. Ele precisa responder rapidamente "como foi esta viagem?".

Conteúdo prioritário:
- distância total;
- duração total;
- tempo em movimento;
- tempo parado;
- velocidade máxima.

Esses números devem ser os primeiros dados escaneáveis após a rota no mapa.

### 2. Paradas e destaques

Lista curta de eventos relevantes da rota, usada como índice operacional.

Conteúdo esperado:
- paradas longas;
- marcos relevantes do trajeto;
- pontos com potencial interesse operacional.

Cada item da lista deve ser clicável e levar o playback ao trecho correspondente.

### 3. Ponto selecionado

Bloco de detalhe contextual do frame atual do replay.

Conteúdo esperado:
- horário;
- velocidade;
- ignição;
- coordenadas.

Esse bloco deve refletir tanto scrub manual quanto reprodução automática.

## Mapa e Playback

O mapa continua sendo o centro da experiência. A rota deve ficar sempre visível como contexto principal, com início e fim marcados de forma distinta e paradas relevantes representadas com marcadores discretos.

O playback deixa de existir como rodapé isolado e passa a ficar acoplado ao contexto do mapa.

Controles necessários:
- play;
- pause;
- reset;
- scrubber horizontal;
- contador/progresso;
- horário do frame atual;
- seleção de velocidade.

Para velocidade, a recomendação aprovada é usar presets explícitos:
- `1x`
- `2x`
- `4x`
- `8x`

Essas opções devem ser rápidas de entender e trocar, sem slider fino. Alterar a velocidade muda o ritmo da reprodução sem resetar a posição atual.

## Estados da Tela

### Antes da busca

A estrutura completa da página já deve existir, mas em estado neutro. O usuário precisa entender que está em uma área de análise, não em uma página vazia.

Comportamento esperado:
- mapa em estado inicial neutro;
- cards laterais com mensagens contextuais;
- filtros disponíveis para iniciar a consulta.

### Carregando

O layout não desmonta. A tela mantém a estrutura e usa placeholders leves no resumo e na lateral.

### Sem resultados

Mantém o mesmo layout, preserva filtros e mostra mensagem contextual no mapa e/ou na lateral, evitando a sensação de erro técnico.

### Erro

Erro deve aparecer próximo do cabeçalho operacional, de forma curta e visível, sem substituir a tela inteira.

## Responsividade

No desktop, a coluna lateral permanece fixa ao lado do mapa, preservando a lógica de painel de missão.

No mobile, a hierarquia visual precisa ser mantida sem tentar reproduzir a mesma largura. A adaptação esperada é:
- cabeçalho operacional em pilha vertical compacta;
- mapa ainda como bloco principal da tela;
- resumo da viagem vindo logo após o mapa;
- destaques e ponto selecionado em blocos empilhados abaixo;
- controles de playback permanecendo junto ao mapa ou imediatamente abaixo dele, sem exigir rolagem longa para uso básico.

O objetivo no mobile não é replicar a coluna lateral, e sim preservar a ordem de leitura: rota primeiro, resumo segundo, detalhe terceiro.

## Comportamento Esperado

Após uma busca bem-sucedida:
- o mapa enquadra a rota inteira inicialmente;
- o playback começa parado no primeiro ponto;
- o resumo da viagem é preenchido imediatamente;
- os destaques permitem salto direto para trechos específicos;
- o bloco de ponto selecionado acompanha scrub manual e reprodução automática;
- marcador do veículo e dados do frame atual permanecem sincronizados.

## Escopo da Implementação

Inclui:
- reestruturar a página de histórico para o novo layout;
- transformar os filtros em um cabeçalho operacional coerente;
- promover o resumo da viagem a elemento principal da leitura;
- integrar o playback ao contexto do mapa;
- adicionar seleção de velocidade com presets;
- reorganizar a apresentação dos dados existentes sem perder a lógica atual de busca e renderização da rota.

Não inclui nesta etapa:
- auditoria avançada com tabelas extensas;
- novos cálculos analíticos complexos além do que já puder ser derivado da rota consultada;
- revisão ampla do design system fora da tela de histórico.

## Arquivos Prováveis de Impacto

- `web/src/app/(dashboard)/history/page.tsx`
- `web/src/components/map/history-player.tsx`

Dependendo do recorte da implementação, pode ser útil extrair subcomponentes específicos da nova interface de histórico para evitar concentrar toda a UI em um único arquivo.

## Verificação de Design

O redesign será considerado correto se:
- o usuário entender o panorama da viagem sem acionar o playback;
- a lateral responder primeiro ao resumo e só depois ao detalhe;
- a reprodução com velocidade variável continuar legível;
- o mapa seguir dominante no desktop;
- a tela permanecer compreensível antes, durante e depois da busca.
