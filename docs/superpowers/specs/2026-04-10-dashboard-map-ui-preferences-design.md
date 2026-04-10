# Dashboard Map UI Preferences — Design Spec

**Data:** 2026-04-10  
**Área alvo:** `web/src/app/(dashboard)/page.tsx`, `web/src/app/(dashboard)/dashboard-map.tsx` e uma nova camada cliente de preferências em `web/src/lib/`

## Problema

A tela do mapa já oferece vários controles operacionais locais, como busca, filtro de status, abertura do painel lateral e `Mostrar rastro` por veículo. Hoje esse estado existe apenas em memória durante a sessão da aba. Se o usuário recarrega a página ou volta ao sistema depois, a interface perde o contexto que ele tinha deixado configurado.

Para operação diária, isso gera atrito desnecessário: o operador precisa reabrir o painel, reaplicar filtros e religar toggles que representam preferência de uso, não estado efêmero do backend.

## Objetivo

Persistir preferências de interface do mapa no navegador do usuário, com escopo inicial restrito ao dashboard map e sem depender de backend novo.

A v1 deve restaurar:

- busca por veículo;
- filtro de status;
- painel lateral desktop aberto ou fechado;
- conjunto de veículos com `Mostrar rastro` ativo.

## Decisão de Produto

Adotar persistência local em `localStorage`, com uma camada genérica de preferências de UI no cliente e uso inicial apenas na tela do mapa.

### Motivo

- resolve o problema descrito sem introduzir schema, actions ou sincronização servidor-cliente;
- mantém baixo custo de implementação e de manutenção;
- cria uma base reutilizável para outras telas do dashboard;
- evita espalhar `localStorage` diretamente por múltiplos componentes.

### Alternativas consideradas

1. **Salvar diretamente no banco por usuário**
   - sincronizaria entre dispositivos;
   - aumenta bastante a complexidade para um requisito que hoje é local;
   - exige modelagem de preferências, carregamento no login e merge de defaults.

2. **Usar `localStorage` diretamente em cada componente**
   - é o caminho mais rápido para esta tela;
   - vira dívida técnica assim que outras páginas precisarem do mesmo comportamento;
   - dificulta versionamento, validação e tratamento consistente de erros.

3. **Usar cookie**
   - não traz ganho para preferência puramente client-side;
   - limita payload e mistura estado de UI com mecanismo mais útil para sessão e leitura no servidor.

## Escopo da V1

Persistir apenas preferências de UI do mapa:

- `searchQuery`
- `statusFilter`
- `desktopRailOpen`
- `activeTrailDeviceIds`

Fora do escopo nesta etapa:

- sincronização entre dispositivos;
- persistência em banco;
- persistir seleção do veículo;
- persistir estado de follow;
- persistir o estado da gaveta mobile;
- persistir pontos do rastro ou cursores do rastro;
- aplicar a mesma camada em outras telas já nesta entrega.

## Regras de Comportamento

### Busca, filtro e painel desktop

- ao abrir novamente o sistema no mesmo navegador, a busca deve voltar com o último valor salvo;
- o filtro de status deve reaparecer com a última opção escolhida;
- o painel lateral desktop deve voltar aberto ou fechado conforme o último estado salvo.

### `Mostrar rastro`

- o `toggle` deve voltar marcado para os veículos cujo `device_id` estiver salvo em `activeTrailDeviceIds`;
- o rastro não deve ser reconstruído com pontos antigos após reload;
- quando a tela carrega de novo, um veículo salvo como ativo apenas volta com o toggle ligado e começa a acumular novas posições dali em diante;
- desligar o toggle continua removendo o rastro e limpando o estado acumulado daquela sessão.

### Mobile

- a gaveta inferior mobile continua começando recolhida sempre;
- o estado `expanded/collapsed` do mobile não entra na persistência desta versão.

## Arquitetura

```text
DashboardPage (server)
  ├── lê usuário autenticado
  └── DashboardMap (client)
        ├── recebe userId
        ├── usa camada genérica de preferências UI
        ├── hidrata estado inicial do mapa
        ├── persiste mudanças relevantes
        ├── mantém estado efêmero de trilhas em memória
        └── renderiza mapa, painel desktop e sheet mobile
```

### Camada genérica de preferências

Criar uma camada cliente reutilizável para preferências de UI, responsável por:

- montar a chave de storage;
- ler e fazer parse de JSON com fallback seguro;
- validar e normalizar payload;
- salvar atualizações;
- lidar com ausência de `window` durante SSR;
- ignorar payload inválido, antigo ou corrompido sem quebrar a tela.

Essa camada não precisa conhecer regras específicas do mapa além do schema que receber.

### Preferências específicas do mapa

Definir um schema ou contrato específico da tela do mapa com:

- `searchQuery: string`
- `statusFilter: "all" | "moving" | "stopped" | "offline"`
- `desktopRailOpen: boolean`
- `activeTrailDeviceIds: string[]`

O `DashboardMap` segue dono do estado da tela, mas passa a:

- inicializar esse estado a partir das preferências válidas;
- persistir alterações nas propriedades cobertas pela v1.

### Chave de armazenamento

A chave deve ser:

- versionada;
- escopada por área da aplicação;
- escopada por usuário autenticado.

Formato conceitual:

`tracker:ui-preferences:v1:dashboard-map:<user-id>`

Isso evita que múltiplos usuários no mesmo navegador compartilhem acidentalmente a mesma configuração local.

## Fluxo de Dados

1. [`page.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/page.tsx) obtém o usuário autenticado no servidor.
2. A página passa `user.id` para [`dashboard-map.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/dashboard-map.tsx).
3. O `DashboardMap` monta a chave de preferência para aquele usuário.
4. No cliente, a camada de preferências lê o payload salvo no `localStorage`.
5. Se o payload for válido, aplica busca, filtro, painel desktop e `activeTrailDeviceIds`.
6. O mapa renderiza com essas preferências já hidratadas.
7. Toda vez que o usuário altera uma dessas preferências, o novo snapshot é salvo no `localStorage`.

## Estados e Responsabilidades

### Estado persistido

Deve incluir apenas o que representa preferência de UI do usuário:

- busca;
- filtro;
- visibilidade do painel desktop;
- dispositivos com toggle de rastro ativo.

### Estado não persistido

Deve continuar efêmero por sessão:

- veículo selecionado;
- veículo em follow;
- `fitAllTrigger`;
- `mobileSheetState`;
- pontos acumulados do rastro;
- cursores internos de ingestão do rastro.

Essa separação evita que preferências duráveis se misturem com estado operacional transitório.

## Tratamento de Erros e Compatibilidade

### `localStorage` vazio

Usar os defaults atuais da tela.

### JSON inválido ou corrompido

Ignorar o payload salvo e voltar aos defaults, sem exibir erro para o usuário.

### Mudança futura de versão

Se a versão do payload não for compatível com a atual, ignorar o conteúdo antigo e usar defaults.

### Valores inesperados

- `statusFilter` inválido deve voltar para `"all"`;
- `searchQuery` inválido deve voltar para `""`;
- `desktopRailOpen` inválido deve voltar para `true`;
- `activeTrailDeviceIds` inválido deve voltar para lista vazia.

### `deviceIds` salvos que não estão visíveis no momento

Se houver `deviceIds` persistidos para veículos ausentes da lista atual, o sistema não deve quebrar.

Comportamento esperado:

- o estado salvo continua válido;
- o toggle só aparece quando o veículo estiver disponível na lista;
- como o rastro só acumula novas posições recebidas na sessão corrente, não há reconstrução retroativa desses pontos.

## Impacto nos arquivos

### Modificados

- [`page.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/page.tsx)
- [`dashboard-map.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/dashboard-map.tsx)
- testes do mapa em [`dashboard-map.test.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/dashboard-map.test.tsx)

### Novos

- utilitário, hook ou módulo cliente genérico em `web/src/lib/` para persistência de preferências de UI;
- testes unitários da nova camada.

O nome exato dos arquivos pode ser definido no plano de implementação, desde que a responsabilidade fique clara e reutilizável.

## Cobertura de Testes

### Camada genérica

Cobrir:

- leitura de defaults quando o storage está vazio;
- persistência e releitura corretas;
- chave separada por usuário;
- fallback seguro para JSON inválido;
- normalização de valores inesperados.

### `DashboardMap`

Cobrir:

- hidratação de `searchQuery`, `statusFilter` e `desktopRailOpen` a partir do storage;
- hidratação de `activeTrailDeviceIds` e renderização do toggle como ativo;
- persistência quando o usuário altera busca, filtro, painel desktop e `Mostrar rastro`;
- ausência de restauração de pontos antigos do rastro;
- manutenção da gaveta mobile iniciando recolhida, mesmo com preferências salvas.

## Critérios de Sucesso

1. O mapa restaura busca, filtro, painel desktop e toggles de `Mostrar rastro` no mesmo navegador.
2. As preferências ficam isoladas por usuário autenticado.
3. O reload da página não recria pontos antigos de rastro.
4. Payload inválido no `localStorage` não quebra a tela.
5. A solução cria uma base reutilizável para outras preferências de UI no dashboard.

## Verificação Manual

1. Abrir o dashboard map com um usuário autenticado.
2. Alterar busca, filtro, painel desktop e ligar `Mostrar rastro` para um ou mais veículos.
3. Recarregar a página e confirmar que essas preferências voltam como foram deixadas.
4. Confirmar que os toggles de rastro voltam marcados, mas a linha recomeça vazia e passa a acumular apenas novas posições.
5. Confirmar que a gaveta mobile continua começando recolhida.
6. Alterar o usuário autenticado no mesmo navegador e confirmar que as preferências não se misturam.
