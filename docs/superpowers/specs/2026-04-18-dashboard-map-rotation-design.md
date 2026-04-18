# Dashboard Map Rotation — Design Spec

**Data:** 2026-04-18  
**Área alvo:** `web/src/app/(dashboard)/dashboard-map.tsx`, `web/src/components/map/tracking-map.tsx`, `web/src/components/map/map-controller.tsx` e um novo controlador de rotação em `web/src/components/map/`

## Problema

O mapa principal do dashboard já permite acompanhar veículos em tempo real, seguir um veículo específico e ajustar o viewport para mostrar toda a frota visível. O comportamento atual é estritamente `north-up`: o usuário consegue navegar, mas não consegue mudar o bearing do mapa para analisar a operação a partir de outro ângulo.

Para uso operacional, isso limita leitura espacial em situações em que a orientação do corredor viário ou da manobra importa mais do que o norte fixo. O pedido é permitir rotação direta no mapa principal sem reescrever a experiência existente e, principalmente, sem transformar a feature em um ponto sem retorno caso a integração se mostre instável.

## Objetivo

Adicionar rotação interativa apenas ao mapa principal do dashboard, com o menor impacto possível na arquitetura atual do `Leaflet + react-leaflet`.

A v1 deve suportar:

- desktop: `Ctrl + arrastar com botão esquerdo` para rotacionar;
- mobile: gesto nativo de rotação com dois dedos;
- permanência do ângulo atual após o gesto;
- botão explícito para resetar o mapa para o norte;
- compatibilidade com `follow mode`, sem sair do follow ao rotacionar;
- retorno ao bearing `0` ao recarregar a página;
- rollback simples por flag ou remoção de um controlador isolado.

## Decisão de Produto

Manter o mapa principal na stack atual e adicionar rotação como uma camada opcional, isolada atrás de um controlador dedicado e de uma flag de feature.

### Motivo

- preserva o mapa principal atual, incluindo markers, trilhas, `follow`, `fit all` e overlays;
- reduz o escopo em comparação com migrar o mapa inteiro para outra engine;
- cria um ponto de rollback claro caso a rotação interfira em gestures, popups, tiles ou trilhas;
- evita introduzir persistência ou estado compartilhado fora do mapa para uma feature que deve continuar efêmera.

## Alternativas Consideradas

1. **Integrar rotação no Leaflet atual com plugin especializado**
   - é a alternativa recomendada para a v1;
   - mantém a maior parte do mapa intacta;
   - concentra o risco na camada de rotação, não no dashboard inteiro;
   - exige validação prévia de compatibilidade técnica e de licença do plugin escolhido.

2. **Aplicar rotação visual por CSS no container do mapa**
   - parece simples, mas é uma solução frágil;
   - tende a quebrar hit testing, popups, cálculos de pan, tiles e gestos touch;
   - foi descartada por aumentar o risco operacional e técnico.

3. **Migrar o mapa principal para MapLibre**
   - oferece bearing nativo e gestos mais maduros para rotação;
   - resolveria a feature com base mais sólida no longo prazo;
   - foi descartada nesta etapa pelo custo alto de migração de markers, trilhas, basemaps, controles e integração com o dashboard atual.

## Escopo da V1

Dentro do escopo:

- rotação somente no mapa principal do dashboard;
- bearing local ao mapa durante a sessão da página;
- botão para resetar rotação;
- preservação do `follow` durante rotação;
- suporte desktop e mobile;
- feature flag para desligamento rápido.

Fora do escopo:

- rotação no player de histórico;
- rotação em outros mapas do sistema;
- persistir o bearing entre reloads;
- redesign visual dos markers por causa da rotação;
- substituir a stack de mapas;
- introduzir pitch, 3D ou outras interações além de bearing.

## Regras de Comportamento

### Desktop

- arraste normal continua fazendo pan do mapa;
- `Ctrl + botão esquerdo + arrastar` entra em rotação;
- esse gesto não deve cancelar o `follow mode`;
- ao terminar o gesto, o mapa permanece no bearing atual.

### Mobile

- o gesto de rotação com dois dedos deve ficar habilitado apenas quando a feature estiver ativa;
- pan e zoom comuns continuam disponíveis;
- rotacionar no mobile também não cancela o `follow mode`.

### Reset para norte

- quando o bearing for diferente de `0`, deve aparecer um controle visível para resetar o mapa;
- ao clicar ou tocar nesse controle, o mapa volta para o norte;
- com bearing `0`, o controle pode ficar oculto para reduzir ruído visual.

### Follow mode

- seguir um veículo continua funcionando com o mapa rotacionado;
- atualizações de posição do veículo seguido continuam recentrando o mapa normalmente;
- a rotação não altera a regra existente de cancelamento por arraste comum;
- apenas o gesto específico de rotação deve ser tratado como exceção e não disparar cancelamento de follow.

### Reload

- ao recarregar a página, o mapa volta em `0deg`;
- o bearing não entra na camada atual de preferências de UI.

## Arquitetura

```text
DashboardMap
  └── TrackingMap
        ├── MapController (follow + fit all)
        ├── MapRotationController (bearing, gesture bindings, reset)
        ├── RotationResetControl (overlay opcional)
        ├── VehicleTrailLayer[]
        └── VehicleMarker[]
```

### Separação de responsabilidades

`DashboardMap` continua responsável por seleção, follow, filtros, trilhas e shell do dashboard.

`TrackingMap` continua responsável por montar o `MapContainer`, layers e overlays do mapa.

`MapController` continua responsável apenas por:

- `follow`;
- `fit all`;
- cancelamento de follow por arraste comum.

`MapRotationController` passa a ser responsável apenas por:

- inicializar a integração de rotação;
- ler e expor o bearing atual;
- diferenciar gesto de rotação de gesto de pan;
- resetar o mapa para norte;
- falhar de forma segura quando a rotação não puder ser ativada.

Essa separação é a principal proteção de rollback: a feature de rotação fica concentrada em um componente novo e pode ser desligada sem reabrir o restante da lógica do mapa.

## Feature Flag e Estratégia de Rollback

A feature deve ficar atrás de uma flag simples de runtime para permitir desligamento rápido.

Critérios dessa flag:

- desligada: o mapa sobe exatamente com o comportamento atual;
- ligada: o mapa tenta habilitar rotação;
- falha na inicialização: o mapa continua funcional em `north-up`, sem quebrar a tela.

O rollback operacional esperado é:

1. desligar a flag;
2. redeploy;
3. voltar ao mapa atual sem bearing e sem dependência funcional da nova camada.

O rollback técnico esperado é:

- remover ou desregistrar `MapRotationController`;
- preservar `MapController`, markers, trilhas e overlays sem refatoração ampla.

## Dependência de Rotação

A implementação recomendada assume uso de um plugin de rotação compatível com Leaflet, desde que ele passe por uma checagem prévia de:

- compatibilidade com `Leaflet 1.9.x`;
- convivência com `react-leaflet 5`;
- comportamento em touch e desktop;
- licença aceitável para adoção neste projeto.

Se essa validação falhar, a feature não deve ser substituída por hacks de CSS. Nesse cenário, a decisão correta é pausar a implementação dessa abordagem e reavaliar uma migração futura de engine de mapas.

## Fluxo de Dados e Estado

- o bearing pertence ao mapa principal e não ao estado global do dashboard;
- `DashboardMap` não precisa persistir bearing;
- `TrackingMap` recebe somente o suficiente para renderizar o reset e habilitar ou não a rotação;
- o controlador de rotação observa o estado interno do mapa e informa quando o bearing saiu de `0`.

Estado novo da v1:

- `rotationEnabled: boolean` derivado da feature flag;
- `bearing` local ao mapa;
- `showResetRotationControl` derivado de `bearing !== 0`.

Estado que permanece igual:

- `selectedDeviceId`;
- `followedDeviceId`;
- `fitAllTrigger`;
- trilhas e filtros do dashboard.

## Impacto nos Arquivos

### Modificados

- [`web/src/components/map/tracking-map.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/map/tracking-map.tsx)
- [`web/src/components/map/map-controller.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/map/map-controller.tsx)
- [`web/src/app/(dashboard)/dashboard-map.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/dashboard-map.tsx), se o controle visual de reset precisar ser coordenado no shell atual
- testes do mapa e controladores existentes

### Novos

- `web/src/components/map/map-rotation-controller.tsx`
- utilitário ou módulo pequeno para encapsular a integração com o plugin escolhido, se isso reduzir acoplamento
- testes unitários da lógica de rotação e de fallback

Os nomes finais podem ajustar no plano, mas a separação entre controlador de viewport existente e controlador de bearing deve ser preservada.

## Tratamento de Erros e Compatibilidade

### Plugin não carregou ou não inicializou

- registrar fallback silencioso para `north-up`;
- não travar render do mapa;
- ocultar controle de reset se a rotação estiver indisponível.

### Conflito com follow

- rotação não deve disparar o mesmo caminho de `dragstart` que hoje encerra o follow;
- se o plugin não permitir diferenciar esses eventos de forma segura, a feature não está pronta para ativação.

### Conflito com `fit all`

- `fit all` continua ajustando centro e zoom;
- não deve zerar bearing automaticamente;
- o usuário mantém a orientação escolhida até usar o reset.

### Conflito com seleção, popup e trilhas

- markers continuam clicáveis;
- popups continuam abrindo e fechando normalmente;
- trilhas continuam alinhadas ao mapa rotacionado sem alteração de dados.

## Cobertura de Testes

### Unitários

Cobrir pelo menos:

- quando a flag está desligada, a lógica de rotação não é montada;
- quando o bearing sai de `0`, o controle de reset aparece;
- acionar reset devolve o mapa ao norte;
- `follow` continua emitindo recentros mesmo com bearing diferente de `0`;
- gesto de rotação não chama o cancelamento de follow;
- falha de inicialização cai em fallback seguro.

### Integração do mapa

Cobrir:

- renderização do mapa principal com a flag ligada e desligada;
- manutenção de `Ver todos`;
- manutenção de seleção e popup;
- coexistência com trilhas ativas.

## Critérios de Sucesso

1. Desktop permite `Ctrl + drag` para rotacionar no mapa principal.
2. Mobile permite rotação com dois dedos sem degradar navegação básica.
3. O `follow mode` continua ativo enquanto o usuário rotaciona o mapa.
4. O botão de reset devolve o mapa ao norte com previsibilidade.
5. Recarregar a página sempre volta o mapa para bearing `0`.
6. Desligar a feature flag restaura o comportamento atual do mapa.
7. Falha na camada de rotação não quebra o dashboard map.

## Verificação Manual

1. Abrir o dashboard com a flag desligada e confirmar que o mapa se comporta exatamente como hoje.
2. Ligar a flag e validar `Ctrl + drag` no desktop.
3. Validar gesto de rotação com dois dedos no mobile.
4. Seguir um veículo, rotacionar o mapa e confirmar que o follow continua funcionando.
5. Usar `Ver todos` com o mapa rotacionado e confirmar que apenas centro/zoom mudam.
6. Abrir popup, selecionar veículo e alternar trilhas com o mapa rotacionado.
7. Usar o botão de reset e confirmar retorno para o norte.
8. Recarregar a página e confirmar bearing `0`.
9. Simular indisponibilidade da camada de rotação e confirmar fallback sem quebra da tela.
