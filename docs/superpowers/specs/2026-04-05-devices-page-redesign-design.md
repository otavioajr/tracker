# Devices Page Redesign — Design Spec

## Contexto

A tela atual de dispositivos funciona, mas opera como uma sequência simples: pendentes no topo, título com ação e uma tabela logo abaixo. Isso resolve o CRUD, porém não constrói uma experiência clara de operação. Pendências reais de provisionamento aparecem sem peso visual suficiente, a tabela principal compete pouco por atenção e a página não comunica de imediato o estado do inventário.

O objetivo deste redesign é transformar `devices` em uma central operacional de provisionamento, onde o usuário entende rapidamente o que precisa de ação, quais dispositivos estão ativos e quais ainda não estão bem vinculados ao restante da frota.

## Objetivo de Produto

Melhorar a UI/UX da página `devices` sem alterar o domínio do fluxo atual.

Isso significa:
- tornar a página mais clara e mais rápida de escanear;
- destacar pendências reais de vínculo sem transformar a tela em um painel caótico;
- melhorar a leitura de status, vínculo e última comunicação;
- manter cadastro, edição, exclusão e vínculo com o mesmo comportamento funcional;
- adaptar a experiência para mobile sem depender de tabela com rolagem horizontal.

Não é objetivo desta etapa adicionar novos fluxos de negócio, filtros avançados, ações em lote ou novas fontes de dados.

## Direção de Interface

Intent: transformar a página em uma central de provisionamento, com prioridade visual para pendências e leitura operacional do inventário.  
Palette: base neutra do dashboard, âmbar para pendência e atenção, verde para status ativos e cinzas suaves para suporte estrutural.  
Depth: superfícies rasas com bordas leves e contraste discreto entre blocos.  
Surfaces: cabeçalho operacional, faixa de métricas, bloco prioritário de pendências e tabela principal em card estável.  
Typography: títulos curtos, labels compactas, status com contraste claro e dados operacionais em mono.  
Spacing: densidade controlada dentro dos blocos e respiro maior entre seções principais.

## Estrutura da Tela

O layout passa a operar em quatro blocos coordenados:

1. **Cabeçalho operacional**
   - mantém o título da página;
   - adiciona um subtítulo curto explicando que a área concentra cadastro, vínculo e acompanhamento;
   - preserva a ação principal de criar novo dispositivo;
   - deixa de parecer apenas um cabeçalho de CRUD.

2. **Faixa de métricas logo abaixo do cabeçalho**
   - resume o estado do inventário com poucos números úteis;
   - não deve virar um mini-dashboard genérico;
   - prioriza apenas sinais operacionais relevantes.

3. **Bloco prioritário de pendências**
   - recebe protagonismo visual quando existirem dispositivos pendentes;
   - mostra contexto suficiente para decidir o vínculo sem exigir leitura da tabela principal;
   - some completamente quando não houver pendências, para a tela voltar a um estado mais calmo.

4. **Tabela principal de dispositivos**
   - continua sendo o núcleo de manutenção do inventário;
   - ganha melhor hierarquia visual e melhor adaptação para mobile;
   - deve parecer parte da central operacional, não uma tabela solta.

## Hierarquia de Conteúdo

### 1. Métricas de topo

As métricas precisam responder rapidamente "há algo a resolver agora?" e "como está o inventário?".

Conteúdo aprovado:
- `pendentes`;
- `ativos`;
- `sem veículo`.

Esses números devem ser visíveis logo após o cabeçalho e antes da tabela.

### 2. Pendências de provisionamento

Este é o bloco com maior prioridade da página quando houver itens pendentes.

Cada item deve exibir, de forma compacta:
- serial;
- recência da primeira ou última conexão;
- volume de mensagens;
- contexto mínimo de origem, como IP quando disponível;
- ação principal de vínculo.

O objetivo é reduzir o tempo entre o surgimento do dispositivo no gateway e sua associação correta no sistema.

### 3. Inventário principal

A tabela continua sendo a base da gestão do cadastro, mas com leitura mais orientada por prioridade.

Ordem de leitura esperada:
- IMEI;
- vínculo com veículo;
- modelo e protocolo como metadados de apoio;
- última comunicação em linguagem mais humana;
- status com badge mais legível;
- ações de editar e excluir no final.

## Comportamento e UX

### Busca e leitura

A tabela principal deve permitir varredura mais rápida. Mesmo sem introduzir novos filtros complexos, a experiência precisa favorecer leitura por prioridade visual.

### Pendências

Quando houver pendentes:
- o bloco deve aparecer acima da tabela;
- o título e a cópia devem deixar claro que há dispositivos aguardando vínculo;
- a ação de vínculo deve ser a mais evidente do conjunto;
- a ação de ignorar continua existindo, mas com menor peso visual.

Quando não houver pendentes:
- o bloco desaparece completamente;
- a página não deve reservar espaço vazio nem mostrar um estado morto desnecessário.

### Diálogo de cadastro e edição

O fluxo permanece o mesmo, mas a apresentação deve ganhar:
- hierarquia mais clara entre campos;
- melhor relação entre título, descrição e ação;
- tratamento de erro mais legível.

Não entra no escopo ampliar a complexidade do formulário.

## Responsividade

No desktop:
- a página mantém ritmo vertical curto;
- métricas, pendências e tabela aparecem como blocos claramente separados;
- a tabela principal continua apropriada para leitura horizontal.

No mobile:
- a hierarquia visual precisa ser preservada;
- a tabela deixa de operar como grade tradicional;
- os dispositivos devem aparecer em cartões compactos;
- cada cartão prioriza IMEI, vínculo, status, última comunicação e ações;
- a experiência deve evitar scroll horizontal.

## Estados da Tela

### Sem pendências

O bloco prioritário não é renderizado. A página deve parecer limpa e estável.

### Sem dispositivos cadastrados

A tabela principal deve apresentar um estado vazio mais acolhedor e acionável, com mensagem curta e CTA claro para cadastrar o primeiro dispositivo.

### Carregamento e mutações

A interface deve continuar estável durante vínculo, exclusão e cadastro, evitando saltos visuais desnecessários.

### Erro

Erros do diálogo de cadastro/edição precisam continuar próximos do formulário e com contraste suficiente para leitura rápida.

## Escopo da Implementação

Inclui:
- reestruturar o cabeçalho da página `devices`;
- adicionar a faixa de métricas operacionais;
- redesenhar a apresentação do bloco de pendências;
- refinar a hierarquia visual da tabela principal;
- adaptar a experiência mobile para cartões em vez de tabela horizontal;
- polir o diálogo de cadastro/edição mantendo o fluxo atual;
- preservar ações existentes de vínculo, ignorar, editar, excluir e criar.

Não inclui nesta etapa:
- novos filtros avançados;
- ações em lote;
- alterações de backend ou novas regras de negócio;
- redesign amplo das outras páginas do dashboard.

## Arquivos Prováveis de Impacto

- `web/src/app/(dashboard)/devices/page.tsx`
- `web/src/components/devices/device-table.tsx`
- `web/src/components/devices/pending-devices-table.tsx`
- `web/src/components/devices/device-dialog.tsx`

Pode ser útil extrair subcomponentes menores para evitar concentrar toda a nova interface em um único arquivo.

## Verificação de Design

O redesign será considerado correto se:
- a página comunicar imediatamente que existem pendências operacionais;
- o bloco de pendências orientar a ação sem competir excessivamente com a tabela;
- a tabela principal ficar mais fácil de escanear;
- o mobile permanecer utilizável sem rolagem horizontal;
- o fluxo funcional atual continuar intacto;
- a tela parecer parte de uma central operacional, e não apenas uma lista com CRUD.
