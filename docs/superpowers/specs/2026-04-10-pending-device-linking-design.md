# Pending Device Linking Expansion — Design Spec

## Contexto

O bloco de pendências operacionais da página `devices` hoje resolve apenas um caso: associar o `serial` detectado pelo gateway a um dispositivo já cadastrado e ainda sem `serial_number`.

Esse fluxo atende parcialmente o provisionamento, mas quebra quando o operador ainda não cadastrou o dispositivo ou quando quer resolver a pendência já deixando o rastreador associado a um veículo. Na prática, isso força navegação extra entre cadastros e aumenta o tempo entre a primeira conexão do equipamento e sua organização correta na frota.

## Objetivo de Produto

Expandir o fluxo de `Vincular` de um dispositivo pendente para que a pendência possa ser resolvida por três novos caminhos no mesmo diálogo:

- cadastrar como novo dispositivo disponível;
- vincular diretamente a um veículo existente sem dispositivo;
- cadastrar um novo veículo já vinculado ao dispositivo criado a partir da pendência.

O caminho legado de `usar dispositivo existente` permanece disponível no mesmo modal.

O objetivo é reduzir atrito operacional sem exigir que o usuário saia da área de pendências.

## Objetivo Funcional

Quando o usuário clicar em `Vincular` em um item pendente, o sistema deve permitir:

1. **Novo dispositivo**
   - criar um registro em `devices`;
   - usar o `serial` do pendente como `serial_number`;
   - exigir `IMEI`;
   - aceitar `modelo` opcional;
   - remover a pendência ao final.

2. **Vincular a carro existente**
   - criar um novo `device` com `serial_number` vindo do pendente;
   - exigir `IMEI`;
   - aceitar `modelo` opcional;
   - listar apenas veículos que ainda não possuem `device_id`;
   - associar o novo dispositivo ao veículo escolhido;
   - remover a pendência ao final.

3. **Cadastrar novo carro**
   - criar um novo `device` com `serial_number` vindo do pendente;
   - exigir `IMEI`;
   - aceitar `modelo` opcional;
   - criar um novo `vehicle` já vinculado ao novo dispositivo;
   - exigir `placa`;
   - manter os demais campos do veículo opcionais, seguindo o padrão atual;
   - remover a pendência ao final.

## Não Objetivos

Não entra no escopo desta etapa:

- eliminar a possibilidade de vincular a um dispositivo existente;
- remodelar o domínio entre `devices` e `vehicles`;
- alterar o gateway ou a captura de `serial` vindos da conexão;
- transformar o fluxo em wizard multi-etapas;
- redesenhar as páginas completas de `devices` ou `vehicles`.

## Abordagens Consideradas

### 1. Um único diálogo com três modos

Esta abordagem mantém o usuário no contexto operacional da pendência e concentra as três resoluções no mesmo modal. A UI fica um pouco mais rica, mas o ganho de velocidade compensa.

### 2. Wizard em etapas

Separar escolha de destino e preenchimento reduziria densidade visual, porém adicionaria cliques e complexidade de navegação para um fluxo que precisa ser rápido.

### 3. Redirecionar para cadastros existentes

Reaproveitaria páginas já prontas, mas quebraria o fluxo operacional ao tirar o usuário da lista de pendências.

### Decisão

Adotar a abordagem de **um único diálogo com três modos**, por ser a forma mais direta de resolver a pendência sem descontextualizar o operador.

## Fluxo de UX

Ao clicar em `Vincular`, o diálogo deixa de mostrar apenas uma lista de dispositivos elegíveis e passa a exibir:

- um cabeçalho com título e descrição contextual;
- um seletor de modo com quatro caminhos disponíveis:
  - `Usar dispositivo existente`;
  - `Novo dispositivo`;
  - `Vincular a carro existente`;
  - `Cadastrar novo carro`;
- o formulário correspondente ao modo atual.

### Modo: usar dispositivo existente

Este modo preserva o comportamento atual:

- lista dispositivos sem `serial_number`;
- permite escolher um candidato;
- associa o `serial` detectado ao dispositivo escolhido;
- remove a pendência ao final.

Esse caminho continua útil quando o operador já cadastrou previamente o rastreador, mas ainda não informou o serial correto.

### Modo: novo dispositivo

Campos:

- `IMEI` obrigatório;
- `modelo` opcional.

Resultado:

- cria o dispositivo já com o `serial_number` do pendente;
- não associa a nenhum veículo;
- o item passa a aparecer como dispositivo disponível no inventário;
- a pendência é removida.

### Modo: vincular a carro existente

Campos:

- `IMEI` obrigatório;
- `modelo` opcional;
- seleção obrigatória de um veículo sem dispositivo.

Resultado:

- cria um novo dispositivo;
- associa esse dispositivo ao veículo escolhido;
- remove a pendência.

### Modo: cadastrar novo carro

Campos do dispositivo:

- `IMEI` obrigatório;
- `modelo` opcional.

Campos do veículo:

- `nome/apelido` opcional;
- `placa` obrigatória;
- `marca` opcional;
- `modelo` opcional;
- `ano` opcional;
- `cor` opcional.

Resultado:

- cria o dispositivo;
- cria o veículo já com `device_id` apontando para o novo dispositivo;
- remove a pendência.

## Direção de Interface

O diálogo deve continuar compacto, mas com hierarquia clara.

- O seletor de modo precisa deixar explícito que o usuário está escolhendo o destino operacional da pendência.
- O formulário deve trocar sem navegação externa nem perda do contexto do `serial`.
- O `serial` detectado deve permanecer visível como referência durante todo o fluxo.
- A ação principal deve mudar o rótulo de acordo com o modo selecionado.
- A ação de ignorar pendência continua fora do modal, como ação secundária na lista.

## Mudanças Técnicas

### Carregamento da página

[`web/src/app/(dashboard)/devices/page.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/devices/page.tsx) deve passar a carregar também os veículos disponíveis para vínculo, além de `devices` e `pending`.

Esses veículos devem chegar ao componente de pendências já filtrados para `device_id = null`, evitando duplicar lógica de seleção no cliente.

### Componente de pendências

[`web/src/components/devices/pending-devices-table.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/devices/pending-devices-table.tsx) passa a:

- manter o modo selecionado do diálogo;
- renderizar os formulários específicos de cada modo;
- continuar suportando o vínculo com dispositivo existente;
- exibir erros inline por operação;
- bloquear submissões concorrentes enquanto uma action estiver em andamento;
- fechar o diálogo apenas em caso de sucesso.

Vale extrair pequenos subcomponentes locais se o arquivo crescer demais, mas a mudança pode começar no próprio arquivo para manter o escopo controlado.

### Server actions

[`web/src/lib/actions/pending-devices.ts`](/Users/otavioajr/Documents/Projetos/tracker/web/src/lib/actions/pending-devices.ts) deve manter `linkPendingDevice(pendingId, deviceId)` e adicionar actions específicas para os novos fluxos:

- `createDeviceFromPending(pendingId, formData)`
- `createDeviceAndAssignVehicleFromPending(pendingId, vehicleId, formData)`
- `createDeviceAndVehicleFromPending(pendingId, formData)`

Essas actions devem:

- buscar o pendente e validar sua existência;
- criar o novo `device` usando o `serial` detectado como `serial_number`;
- realizar a associação com `vehicle` quando aplicável;
- remover o item de `pending_devices` somente no final;
- revalidar `"/devices"` e `"/vehicles"` quando houver impacto no cadastro de veículos.

### Dependências de dados

Para criar dispositivos a partir do pendente, as actions precisam obter `tenant_id` tal como já acontece em `createDevice` e `createVehicle`.

Para o fluxo de veículo existente, o servidor precisa revalidar que o veículo ainda está sem `device_id` no momento da submissão. A filtragem no cliente melhora a UX, mas não é suficiente para garantir consistência.

## Regras de Validação

- `IMEI` é obrigatório em `novo dispositivo`, `vincular a carro existente` e `cadastrar novo carro`.
- `modelo` do dispositivo é opcional nos três modos.
- `placa` é obrigatória em `cadastrar novo carro`.
- `vehicleId` é obrigatório em `vincular a carro existente`.
- o servidor deve impedir vínculo em um veículo que já recebeu dispositivo entre a abertura do modal e a submissão;
- a pendência só pode ser removida após todas as etapas do fluxo concluírem com sucesso.

## Estados e Tratamento de Erro

- durante submissão, o diálogo deve desabilitar ações que possam disparar nova mutação;
- em erro, a pendência permanece visível e o modal continua aberto;
- mensagens de erro devem ficar próximas ao formulário ativo;
- falhas parciais não podem deixar o usuário com pendência removida e vínculo incompleto.

Se necessário, as ações podem ser implementadas em ordem linear para preservar previsibilidade:

1. validar o pendente;
2. criar o dispositivo;
3. associar ou criar veículo;
4. remover a pendência;
5. revalidar páginas.

## Cobertura de Testes

Expandir [`web/src/components/devices/pending-devices-table.test.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/devices/pending-devices-table.test.tsx) para cobrir:

- abertura do diálogo com os novos modos;
- troca de modo pelo usuário;
- renderização dos campos corretos em cada modo;
- disparo da action correta em:
  - novo dispositivo;
  - vínculo com veículo existente;
  - cadastro de novo veículo;
- manutenção do modo legado de `usar dispositivo existente`;
- estados vazios quando não houver veículos disponíveis;
- desabilitação de ações durante submissão.

Se o repositório já comportar testes unitários das server actions com isolamento razoável, vale adicioná-los para as novas regras de negócio. Caso contrário, o mínimo aceitável nesta etapa é fortalecer a cobertura do componente e validar o fluxo com `vitest`.

## Arquivos Prováveis de Impacto

- [`web/src/app/(dashboard)/devices/page.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/app/(dashboard)/devices/page.tsx)
- [`web/src/components/devices/pending-devices-table.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/devices/pending-devices-table.tsx)
- [`web/src/components/devices/pending-devices-table.test.tsx`](/Users/otavioajr/Documents/Projetos/tracker/web/src/components/devices/pending-devices-table.test.tsx)
- [`web/src/lib/actions/pending-devices.ts`](/Users/otavioajr/Documents/Projetos/tracker/web/src/lib/actions/pending-devices.ts)
- [`web/src/lib/actions/vehicles.ts`](/Users/otavioajr/Documents/Projetos/tracker/web/src/lib/actions/vehicles.ts), caso seja útil reaproveitar helpers ou consultas de veículos disponíveis

## Critérios de Aceite

O trabalho será considerado correto se:

- o operador puder resolver uma pendência sem sair da área de `devices`;
- existirem quatro caminhos claros no diálogo, incluindo o legado de dispositivo existente;
- seja possível criar um novo dispositivo apenas com `IMEI`, `modelo` opcional e `serial` vindo da pendência;
- seja possível criar um novo dispositivo e vinculá-lo a um veículo existente sem dispositivo;
- seja possível criar um novo dispositivo e um novo veículo no mesmo fluxo;
- o servidor impedir associações inválidas a veículos já ocupados;
- a pendência só suma após sucesso completo;
- a cobertura automatizada reflita os novos caminhos principais.
