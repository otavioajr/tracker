# Header Alert Bell Dropdown — Design Spec

**Data:** 2026-04-21
**Área alvo:** `web/src/components/dashboard/alert-bell.tsx`, `web/src/components/alerts/alert-feed.tsx`, `web/src/components/dashboard/header.tsx`, `web/src/lib/actions/alerts.ts`, testes associados.

## Problema

O sininho do header hoje é apenas um link para `/alerts`. Isso força navegação para um fluxo que deveria ser rápido: bater o olho nos últimos eventos e limpar os novos sem sair da tela atual.

Para operação diária, especialmente no mapa e em páginas de monitoramento, o usuário precisa de um painel curto e imediato no próprio header, com rolagem quando necessário, mantendo `/alerts` como tela completa.

## Objetivo

Trocar o comportamento principal do sininho para abrir um painel ancorado abaixo do ícone, mostrando os últimos alertas com destaque visual para os não lidos.

A v1 deve suportar:

- abrir e fechar um painel sob o sininho;
- listar últimos alertas em ordem decrescente;
- destacar alertas não lidos;
- permitir marcar cada alerta como lido por um botão com ícone de olho;
- manter `/alerts` como página completa via ação explícita `Ver todos`;
- limitar altura do painel e habilitar rolagem interna;
- não permitir clique no corpo do alerta por enquanto.

## Decisão de Produto

Usar o primitive existente `DropdownMenu` como base do painel do sininho e reaproveitar a renderização do feed de alertas com uma variante compacta para header.

### Motivo

- Entrega exatamente o comportamento pedido: caixa ancorada abaixo do sino.
- Reusa primitive já presente no projeto para posicionamento, clique fora, `Esc` e foco.
- Evita criar modal central ou componente absoluto custom sem necessidade.
- Mantém `/alerts` viva como superfície detalhada, sem duplicar responsabilidades.

## Alternativas Consideradas

1. **Dropdown ancorado ao sino** — recomendada. Menor patch, encaixa no header atual, boa para leitura rápida.
2. **Dialog/modal central** — descartada para v1. Dá mais espaço, mas foge da ideia de caixa curta embaixo do ícone e interrompe mais o fluxo.
3. **Painel absoluto custom no header** — descartado para v1. Dá controle total, mas reimplementa estado aberto/fechado, clique fora, foco e posicionamento sem ganho claro.

## Escopo da V1

Dentro do escopo:

- sininho vira trigger de painel;
- painel mostra últimos alertas, lidos e não lidos;
- novos aparecem com destaque de superfície;
- ação de marcar como lido por item com ícone de olho;
- contador do sino atualiza após marcar como lido;
- rodapé com link `Ver todos` para `/alerts`;
- estado vazio e estado de erro simples no corpo do painel.

Fora do escopo:

- clique no corpo do alerta;
- navegação contextual por tipo de evento;
- marcar todos como lido;
- realtime dentro do painel;
- paginação ou filtros no painel;
- substituir a página `/alerts`.

## Regras de Comportamento

### Trigger e painel

- clique no sino abre o painel abaixo do ícone, alinhado à direita;
- clique fora e tecla `Esc` fecham o painel;
- painel usa largura fixa de desktop com limite para viewport pequena;
- altura máxima é limitada; acima disso, a lista rola internamente.

### Conteúdo

- topo do painel mostra `Alertas` e contador de não lidos;
- lista mostra os alertas mais recentes primeiro;
- cada item mostra severidade, tipo, veículo/IMEI, mensagem e data;
- alertas não lidos usam fundo destacado; lidos usam fundo neutro;
- corpo do item não é clicável.

### Marcar como lido

- cada item não lido exibe botão com ícone de olho;
- ao clicar, só aquele alerta vira lido;
- item perde destaque visual sem exigir refresh manual;
- badge do sino recalcula logo após a ação;
- itens já lidos não mostram botão.

### Rodapé

- rodapé fixo dentro do painel mostra ação `Ver todos`;
- clicar em `Ver todos` navega para `/alerts`.

### Estados especiais

- sem alertas: mensagem curta `Nenhum alerta encontrado.`;
- falha de carga: mensagem curta no corpo do painel, sem quebrar o header;
- se `markAlertRead` falhar, o item mantém estado anterior e o botão volta ao estado normal sem mudar o badge.

## Arquitetura

### Composição

```text
Header
  └── AlertBell (Server Component)
        ├── busca unread count
        ├── busca últimos alerts
        └── AlertBellMenu (Client Component)
              ├── trigger do sino
              ├── header do painel
              ├── AlertFeed variant="dropdown"
              └── link "Ver todos"
```

### Separação de responsabilidades

`AlertBell` permanece dono da busca inicial de dados no servidor. Ele passa para o cliente apenas o que o painel precisa renderizar imediatamente: contador e lista recente.

`AlertBellMenu` concentra interação do dropdown: abrir, fechar e reagir à atualização local depois de `markAlertRead`.

`AlertFeed` passa a suportar variante compacta de dropdown, reaproveitando a lógica já existente de severidade, labels, datas e marcação como lido. A versão de página continua existindo, mas usa espaçamento e superfície mais amplos.

Essa separação evita duplicar lista de alertas em dois lugares e mantém `/alerts` e sininho sobre a mesma semântica de item.

## Fluxo de Dados

1. `AlertBell` busca `getUnreadAlertCount()` e `getAlerts(limitCurto)` no servidor.
2. `AlertBellMenu` renderiza trigger com badge e painel fechado por padrão.
3. Ao abrir, painel já aparece hidratado, sem segunda busca.
4. Ao clicar no olho, `AlertFeed` chama `markAlertRead(id)`.
5. Em sucesso, o item muda para lido localmente e o badge decrementa.
6. `revalidatePath("/alerts")` continua garantindo consistência da página completa.

## Impacto nos Arquivos

### Modificados

- `web/src/components/dashboard/alert-bell.tsx` — deixa de ser link puro e passa a renderizar trigger + dados do painel.
- `web/src/components/alerts/alert-feed.tsx` — ganha variante compacta e callback para sincronizar badge local.
- `web/src/lib/actions/alerts.ts` — mantém API atual de leitura e marcação, preservando `revalidatePath("/alerts")`.

### Novos

- `web/src/components/dashboard/alert-bell-menu.tsx` — client component do dropdown.

### Mantidos

- `web/src/app/(dashboard)/alerts/page.tsx` continua como tela completa;
- `web/src/components/dashboard/header.tsx` só mantém encaixe do `AlertBell`, sem redesign.

## Tratamento de Erros e Resiliência

- Se a leitura dos alertas falhar no server component, o painel abre com estado de erro curto e badge zerado ou com fallback seguro.
- Se `markAlertRead` falhar, o loading do botão volta ao normal e o alerta continua não lido.
- O painel não depende de realtime; consistência é eventual e suficiente para v1.

## Acessibilidade

- trigger mantém `aria-label` com quantidade de não lidos;
- painel deve ser navegável por teclado;
- botão do olho precisa de `aria-label` explícito;
- `Ver todos` permanece link real;
- contraste entre alerta novo e lido deve continuar dentro do sistema de tokens do dashboard.

## Estratégia Visual

- **Intent:** leitura rápida de eventos sem sair da tela atual.
- **Palette:** tokens existentes de `popover`, `accent`, `muted-foreground` e `destructive`.
- **Depth:** painel levemente elevado sobre header, sem exagerar sombra.
- **Surfaces:** trigger compacto; painel como superfície flutuante; itens novos com destaque sutil.
- **Typography:** mesma hierarquia já usada no dashboard.
- **Spacing:** denso, mas com respiro suficiente para mensagem e data.

## Testes

- render do sino com badge e sem badge;
- abertura e fechamento do painel;
- estado vazio;
- destaque visual para item não lido;
- clique no olho chama `markAlertRead`;
- sucesso em `markAlertRead` atualiza item e contador local;
- `Ver todos` continua presente e navegável;
- lista respeita limite visual com rolagem.

## Critérios de Aceite

- clicar no sino não navega mais direto para `/alerts`;
- painel abre abaixo do ícone e mostra últimos alertas;
- alertas não lidos ficam visualmente destacados;
- ícone de olho marca item como lido;
- badge do sino atualiza após a ação;
- `/alerts` continua acessível por `Ver todos`.
