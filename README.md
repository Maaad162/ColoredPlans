# ColoredPlans

## Objetivo e escopo

> Olhar a planta e entender imediatamente o que foi feito, o que falta e o que é necessário para continuar.

A planta é o centro da aplicação. O ColoredPlans é uma ferramenta visual para a
execução da obra, não um ERP. A Fase 1 organiza usuários, permissões, obras e dados
sem acrescentar módulos administrativos ou redesenhar a experiência.

O ColoredPlans existe para permitir que o usuário olhe a planta e entenda
imediatamente o que foi feito, o que falta e o que é necessário para continuar.
Esta entrega se limita à **Fase 1 — Fundação**: documentação, usuários e permissões,
obra, preparação para várias obras, versionamento e consistência dos dados.

## Tecnologias

React, TypeScript estrito, Vite, Firebase Authentication (e-mail/senha), Cloud
Firestore e Firebase Hosting. A planta atual é um SVG com 100 unidades em sete
blocos. Os testes usam o runner do Node e `@firebase/rules-unit-testing` com o
emulador Firestore. Não há servidor próprio nem painel administrativo.

React DOM monta a aplicação; `@vitejs/plugin-react` integra React ao Vite. Estilos
são CSS e a geometria é definida em TypeScript, sem biblioteca externa de mapas.
O SDK Firebase é usado diretamente pelo navegador. Não há uso de Cloud Storage,
Analytics, Messaging ou Cloud Functions, mesmo existindo campos dessas configurações
no objeto Firebase. `package-lock.json` registra as versões resolvidas; várias
dependências no `package.json` ainda usam `latest`.

## Arquitetura

```text
Frontend React (App + componentes)
  -> Firebase Authentication: sessão por UID
  -> Firestore: usuarios/{uid}, perfil provisionado pelo responsável
  -> hooks + serviços, sujeitos às regras Firestore
      -> obras do usuário -> mapas da obra
      -> Kits do usuário, filtrados por obraId
      -> legendas do usuário, comuns às suas obras
```

- `src/types/planta.ts`: perfil, setor, obra, mapas, Kits, legendas e exportação.
- `src/config/dados.ts`: versão do schema, collections, obra inicial e identidade histórica dos dados legados.
- `src/services/caminhos.ts`: referências aos documentos e collections atuais.
- `src/services/perfil.ts`: leitura do perfil, sem criação ou edição pelo cliente.
- `src/services/firestore.ts`, `kits.ts`, `legendas.ts`: persistência e observação.
- `src/services/inicializarMapa.ts`: criação condicional do primeiro mapa, sem sobrescrita entre abas.
- `src/services/migracoes.ts`: execução da migração; `migracoes/planejarV1.ts` valida e monta seu plano.
- `src/hooks/`: autenticação, perfil, mapas, Kits e legendas.
- `src/components/`: planta, ferramentas, abas, detalhes, legendas e Central de Kits.
- `src/data/planta.ts`: unidades e geometria da planta atual.
- `src/services/storage.ts`: preferência da aba ativa e importação/exportação.

O inventário, as evidências e as pendências estão na
[auditoria da arquitetura atual](docs/auditoria-arquitetura.md).
As decisões e o registro histórico estão em [docs/fundacao.md](docs/fundacao.md).

## Contas e permissões

Não existe cadastro público no produto. O responsável técnico cria a conta no
Authentication e define seu setor no Firestore antes de entregar o acesso.
O usuário final não escolhe, altera ou promove o próprio setor.

A aplicação apenas lê `usuarios/{uid}`. As regras negam **qualquer escrita de
cliente** nesse documento, inclusive criação, substituição, atualização e exclusão.
Somente Console/Admin SDK, autenticados administrativamente por IAM, podem
provisionar o perfil. Campos ou claims inventados pelo cliente não concedem acesso.

O modelo canônico é `PerfilUsuario`, com setor `TipoConta`, em
[`src/types/planta.ts`](src/types/planta.ts). O campo de autorização é
`tipoConta: "apontamento" | "estoque"`; `userId` corresponde ao UID do
Authentication e ao ID do documento. Não há um segundo modelo `role`/`UserRole`
nem setor administrativo no cliente. `schemaVersion`, `email` e `criadoEm`
completam a representação de leitura (a data é convertida para ISO no frontend).

A [auditoria de permissões](docs/permissoes.md) descreve os caminhos de escrita e
os testes diretos contra o Firestore. Um futuro painel técnico pode reutilizar
`usuarios/{uid}` por meio de um backend administrativo autorizado por IAM, sem
mudar o caminho ou liberar escrita do perfil pelo SDK do navegador. Esse backend
e esse painel não fazem parte desta fase.

Uma sessão autenticada sem perfil válido recebe a tela **Conta aguardando liberação**,
e as regras também negam acesso aos mapas, obras, legendas e Kits. Perfis existentes
sem `schemaVersion` continuam legíveis como versão 0; o responsável deve conferir os
setores antigos, pois anteriormente havia escolha no primeiro acesso.

| Setor | Permissões atuais |
| --- | --- |
| Apontamento | Seus mapas manuais, marcações, filtros, busca, legendas, importação JSON e exportações JSON/CSV. |
| Estoque | As mesmas funções e seus Kits: materiais por unidade, associação de unidades, consumo calculado e operações atômicas com o mapa associado. |

### Apontamento

Registra e consulta os estados das unidades nos mapas manuais. Pode criar e
renomear esses mapas, apagar mapas pela interface quando houver outra aba,
gerenciar suas legendas, importar marcações e exportar os dados disponíveis.
Não acessa a Central de Kits; as regras também negam acesso aos documentos de Kits.

### Estoque

Dispõe das funções de Apontamento e cadastra Kits, edita seus materiais, associa
unidades, consulta consumo calculado e abre o mapa correspondente. Renomear ou
excluir um mapa de Kit ocorre pela Central de Kits. Não há entradas, saídas,
saldo de almoxarifado ou integração com Sienge; `codigoSienge` é um campo textual.

O acesso por setor é aplicado na interface e no Firestore. Isso não significa que
toda validação da interface esteja nas regras: nomes duplicados, preservação da
última aba/legenda e impedimento de excluir legendas em uso são controles locais.
As regras de mapas permitem ler os mapas do próprio usuário com perfil válido,
inclusive mapas de Kit que já existam após mudança administrativa de setor;
gravar um mapa vinculado a Kit exige Estoque.

O isolamento atual é por usuário. Dois usuários com o mesmo `obraId` **não**
compartilham dados. Não há equipes, membros, papéis por obra ou colaboração entre
usuários diferentes nesta fase.

### Provisionar uma conta

1. No Firebase Authentication, habilite e-mail/senha e crie o usuário administrativamente.
2. Copie o UID e crie `usuarios/{uid}` pelo Console/Admin SDK com os campos abaixo.
3. Opcionalmente provisione as legendas padrão de `src/config/statuses.ts` em
   `usuarios/{uid}/legendas/{statusId}`. Preserve documentos já existentes.
   Sem esse preparo, o usuário pode cadastrar suas legendas em **Cores e legendas**.
4. Confirme o setor e o acesso antes de entregar a conta. Não coloque credenciais
   administrativas em variáveis `VITE_*` ou no frontend.

```text
userId: UID da conta (string, igual ao ID do documento)
email: e-mail da conta (string)
tipoConta: "apontamento" ou "estoque" (string)
schemaVersion: 1 (number)
criadoEm: timestamp do provisionamento
```

### Bloquear cadastro direto no Authentication

As regras do Firestore não controlam o endpoint de criação de contas do
Authentication. O projeto também deve ter
`client.permissions.disabledUserSignup = true`, conforme a
[configuração oficial do Identity Platform](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config#Permissions).
A aplicação não altera essa configuração por conta própria.

O script abaixo usa credenciais administrativas do Google Cloud CLI. Sem
`-Aplicar`, apenas verifica a configuração; com a opção, altera somente o campo
de cadastro público e verifica o resultado. Não habilita serviços pagos nem muda
o provedor de login. Requer permissões IAM para ler/alterar a configuração do projeto.

```powershell
gcloud auth login
.\scripts\auth-fechado.ps1 -ProjetoId SEU_PROJETO
.\scripts\auth-fechado.ps1 -ProjetoId SEU_PROJETO -Aplicar
```

A verificação falha explicitamente se o cadastro público continuar habilitado.
Esse passo é separado de `firebase deploy` e não é reproduzido pelo emulador de
regras Firestore. O script não foi aplicado automaticamente à produção.

## Obras e propriedade dos dados

Uma obra tem `id` e `nome`. Ao preparar os dados, é registrado o documento
`usuarios/{uid}/obras/{obraId}`, com `userId`, `nome`, `schemaVersion` e
`atualizadoEm`. `Obra` é uma entidade explícita em `src/types/planta.ts`, sem
campos de arquivamento ou gestão que não tenham uso nesta fase.

A configuração transitória `OBRA_PADRAO` fica em `src/config/dados.ts` e é usada
somente por `main.tsx` para montar `<App obra={OBRA_PADRAO} />`. `App` recebe uma
obra obrigatória e repassa seu escopo à aplicação operacional. Não há leitura da
obra padrão dentro dos hooks ou serviços operacionais.

`OBRA_LEGADA_ID`, no mesmo arquivo, identifica permanentemente a obra dos Kits
antigos sem `obraId` e da preferência local antiga. Hoje a obra inicial usa esse
mesmo ID, mas são conceitos distintos: mudar `OBRA_PADRAO_ID` não deve alterar
`OBRA_LEGADA_ID`. O literal histórico também existe uma vez nas regras Firestore,
que são compiladas separadamente e não importam constantes TypeScript.

Hooks e serviços de mapas e Kits recebem a obra explicitamente. A aba ativa no
navegador também é isolada por usuário e obra. Não há seletor de obras nesta fase;
a aplicação continua abrindo a obra padrão, com a planta atual.

A preparação para várias obras existe no escopo dos caminhos, parâmetros,
preferências e migrações, com testes para uma segunda obra. Não é um produto
multiobra completo: geometria e unidades são únicas, a inicialização escolhe uma obra
e a verificação de uso de legendas considera apenas os mapas carregados da obra
ativa. Uma futura troca de obra deve remontar o estado dos hooks por UID/obra,
como a chave atual de `AplicacaoMapas` já prevê. Não basta trocar o ID para
trabalhar com plantas diferentes.

O documento de obra é preparado pela migração. As regras permitem ao usuário
com perfil válido criar/atualizar suas próprias obras, mas não excluí-las. Não
exigem a existência desse documento pai para gravar mapas, nem implementam
permissões específicas por obra.

Conceitualmente, mapas representam a execução da obra. Fisicamente, continuam no
espaço do usuário para preservar o isolamento existente. Transferi-los para uma
obra compartilhada sem definir membros, acesso e resolução de conflitos seria
inseguro. Essa transferência foi adiada, sem mover ou excluir dados nesta fase.

O mesmo ID transitório em duas contas não comprova que elas representam a mesma
obra física. Mapas com IDs iguais podem ter marcações diferentes, e legendas de
usuários diferentes podem atribuir significados distintos ao mesmo status.
A [decisão de propriedade e preparação multiobra](docs/obras.md) registra as
dependências, os riscos e os requisitos para uma migração compartilhada futura.

## Firestore

```text
usuarios/{uid}
  userId, email, tipoConta, schemaVersion, criadoEm

usuarios/{uid}/obras/{obraId}
  userId, nome, schemaVersion, atualizadoEm
  mapas/{mapaId}
    userId, obraId, schemaVersion, nome, tipo, marcacoes, criadoEm
    kitId?, kitUnidadeIds[], atualizadoEm, ...

usuarios/{uid}/kits/{kitId}
  userId, obraId, schemaVersion, nome, mapaId
  materiais[], unidadeIds[], criadoEm, atualizadoEm

usuarios/{uid}/legendas/{legendaId}
  userId, schemaVersion, nome, cor, corTexto, simbolo, criadoEm, atualizadoEm

obras/{obraId}/mapas/{mapaId}
  fonte legada, somente leitura pelo criador para migração
```

Os Kits mantêm seus caminhos e IDs atuais, com `obraId` explícito. O serviço filtra
a obra após consultar os Kits do próprio usuário, preservando leitura de Kits antigos
sem esse campo. `null`, IDs vazios e valores inválidos geram erro; não equivalem
à ausência histórica de `obraId`. As regras exigem que os dois lados do vínculo pertençam ao mesmo
usuário e à mesma obra. Não é permitido transferir um Kit de obra por edição.

Legendas são configurações do usuário, comuns às suas obras. Não são permissões.
As consultas atuais não exigem índice composto adicional; não há arquivo de
índices configurado em `firebase.json`.

`marcacoes` associa ID da unidade ao ID da legenda. A borracha remove a chave;
valores `null` antigos também são interpretados como ausência de marcação.
Cada material de Kit contém `id`, `codigoSienge`, `descricao`, `detalhe` e
`quantidadePorKit`. Datas são timestamps no Firestore e strings ISO nos modelos
da interface. `criadoPor`/`atualizadoPor` são metadados escritos nos mapas pelos
serviços; não constituem um histórico de alterações ou autoridade de permissão.

## Mapas, planta e legendas

Cada mapa representa um serviço sobre a mesma planta e mantém marcações próprias.
Os status usam IDs das legendas dinâmicas. Alterações aparecem por snapshots locais
e são confirmadas pelo servidor; dados persistem no cache Firestore do navegador,
inclusive entre abas do mesmo navegador.

Após preparar a obra, um snapshot vazio confirmado pelo servidor inicia a criação
de `mapa-principal`. Uma transação cria somente se o documento ainda não existir;
abrir duas abas ou repetir a inicialização preserva nome, marcações e metadados
existentes. A criação de outras abas manuais mantém as gravações usuais do SDK.

A geometria de `src/data/planta.ts` não é carregada do Firestore. Todos os mapas
usam as mesmas 100 unidades. Legendas desconhecidas aparecem em cinza como
“Legenda indisponível”, sem serem interpretadas como unidades não marcadas.
O resumo conta marcações; não calcula avanço físico de obra ou conclusão a
partir do nome da legenda. Os padrões em `src/config/statuses.ts` não são
cadastrados automaticamente no primeiro acesso.

Recursos preservados:

- Busca por número com ou sem zeros iniciais, escolha do bloco e seleção sem pintar.
- Renomeação de mapas manuais com validação de nomes vazios/duplicados entre os
  mapas carregados. O ID e as marcações não mudam.
- Resumo do mapa ativo com total, porcentagem marcada e quantidade por legenda.
- Filtros, zoom, pintura rápida, borracha e detalhes da unidade.
- Indicador existente de salvamento, pendência de sincronização e erros.
- Importação e exportação JSON do mapa ativo, mantendo o formato `version: 1`.
  A importação rejeita versões explícitas diferentes de 1 e mantém compatibilidade
  com arquivos antigos sem o campo `version`.
- CSV de todos os mapas da obra ativa, inclusive unidades sem marcação:
  mapa, bloco, número e status; UTF-8 com BOM, ponto e vírgula e CRLF.
  O relatório usa os dados locais disponíveis. No Excel, importe bloco e número
  como texto para preservar zeros iniciais.

## Kits e consistência com os mapas

Um Kit descreve materiais para uma unidade. Seu consumo é a quantidade por Kit
multiplicada pelo número de unidades atendidas. Cada Kit tem um mapa associado:
criação usa lote atômico; renomeação, alteração das unidades e exclusão usam
transações. O nome acompanha o Kit, e o contorno de utilização é independente do
status pintado. As regras usam `getAfter`/`existsAfter` para rejeitar operações que
deixem o vínculo inconsistente: nomes e listas de unidades devem coincidir, e os
IDs devem apontar um para o outro na mesma obra e usuário. Alterar apenas uma
marcação do mapa ou apenas os materiais do Kit não exige mudar o outro documento.

O consumo é calculado na leitura, não persistido como saldo. O JSON e o CSV
exportam marcações, não os materiais ou as associações de unidades dos Kits;
portanto não são backups completos da conta.

## Cache e sincronização

Marcações manuais continuam funcionando com cache offline; transações de Kits,
migrações e criação do primeiro mapa precisam de conexão. Não foi criado um novo
mecanismo offline nesta fase.

O SDK utiliza cache persistente com gerenciamento de múltiplas abas. O
`localStorage` guarda somente a aba ativa, na chave
`lm-colored-plans:aba-ativa:v3:{uid}:{obraId}`. A chave antiga sem obra é lida
como fallback apenas para `OBRA_LEGADA_ID`, independentemente da obra inicial.
Sair encerra a sessão, mas não há
limpeza explícita do cache Firestore pela aplicação.

“Salvo”, “Salvando”, pendência e erro refletem o estado dos mapas observado por
`usePlanta`; não representam um monitor global de todas as gravações da conta.
Não há garantia de primeiro acesso offline: a preparação inicial depende do
servidor. A criação de Kit usa lote, enquanto suas edições/exclusão e a migração
usam transações.

## Schema e migração

`CURRENT_SCHEMA_VERSION = 1` é a primeira versão explícita do schema remoto.
`SchemaVersion` representa `0 | 1`; ausência de versão é tratada como 0. `null`,
texto, números negativos e versões desconhecidas são rejeitados. Não confundir com a versão 1 do arquivo JSON
ou com o antigo sufixo v3 da preferência local.

A migração `0 -> 1`:

1. Valida nome da obra, mapas, Kits, proprietários, unidades, materiais e versões.
   Materiais com IDs repetidos ou textos que seriam truncados pelo leitor
   interrompem a migração para revisão, preservando o conteúdo original.
2. Copia mapas do caminho legado para o usuário sem apagar a origem. Uma colisão
   de ID interrompe a migração; um documento já copiado é reconhecido por `origemLegada`.
3. Consolida pares Kit/mapa antigos, atribui `obraId` e `schemaVersion`.
   Reserva antecipadamente mapas referenciados explicitamente por Kits. Só os
   demais podem ser associados por nome; candidatos múltiplos e colisões
   interrompem o plano, inclusive quando dois Kits disputam o mesmo mapa por nome.
   A correspondência por nome é compatibilidade do legado 0;
   documentos na versão 1 precisam de vínculos consistentes.
4. Simula os grupos em memória e valida a saída: o resultado deve satisfazer o
   contrato e não exigir nova migração. Os documentos de entrada não são alterados.
5. Executa grupos pequenos em transações, comparando os documentos lidos com o
   plano por seus valores para impedir sobrescrita de alterações concorrentes.
   A ordem das chaves não gera conflito; arrays mantêm sua ordem e tipos como
   timestamps e referências usam as comparações do SDK Firestore.
6. Marca a obra com versão 1 apenas ao concluir. Reexecuções não repetem o trabalho.

O plano completo é validado antes das gravações. Se houver falha durante a execução,
grupos já concluídos permanecem consistentes e a próxima abertura retoma a migração.
Mapas órfãos, ambiguidades e dados inválidos geram erro para revisão administrativa;
não são descartados nem convertidos silenciosamente pelo planejador. Versões
futuras são rejeitadas pelos leitores de schema e nas atualizações protegidas
pelas regras. Exclusões de mapas, Kits e legendas também exigem versão conhecida;
se um lado do par Kit/mapa tiver versão futura, sua exclusão atômica é negada.

Erros chegam ao fluxo de sincronização, são registrados com `console.error` e
exibidos no aviso de sincronização existente. Não há coleção de logs ou histórico
novo. Corrija a origem com revisão administrativa e backup e reabra a aplicação;
não apague documentos nem marque a obra como migrada para ocultar a falha.

Só existe o passo `0 -> 1`. Uma mudança incompatível futura deve acrescentar um
passo explícito `1 -> 2`, com validação e testes, e atualizar leitores e regras
antes de elevar a constante. Não se criaram passos fictícios nem um framework.

Perfis antigos continuam somente leitura; sua versão é atualizada administrativamente.
Legendas antigas continuam legíveis e recebem versão 1 quando editadas. Migrações
não dependem do cache para confirmar sucesso nem bloqueiam a exibição de mapas
já armazenados localmente. Após reconectar, a preparação é tentada novamente.

O marcador na obra dispensa novas varreduras. Não é uma auditoria contínua: dados
legados inseridos depois dele, mudanças administrativas de setor e documentos
novos durante a execução precisam de revisão específica. As transações conferem
os documentos dos grupos planejados, não bloqueiam a coleção inteira. Os leitores
normais de mapas/Kits ainda normalizam ou filtram alguns valores inválidos;
essa tolerância é distinta da validação da migração.

## Desenvolvimento e validação

Use Node.js 22.16 ou superior, npm, Firebase CLI e Java 21 para o emulador.
Os comandos abaixo são para PowerShell no Windows; em outros shells use `npm`.
Prefira `npm.cmd ci` para instalar as versões do lockfile. `npm.cmd install`
fica disponível quando for necessário atualizar dependências.

```powershell
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Preencha em `.env.local`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`.
`VITE_FIREBASE_MEASUREMENT_ID` é opcional; Analytics não é inicializado.
API key, auth domain, project ID e app ID são obrigatórios na inicialização.
As variáveis `VITE_*` entram no bundle do navegador; não devem conter credenciais
administrativas. `.env.local` está no `.gitignore`.

Depois inicie o servidor:

```powershell
npm.cmd run dev
```

Abra o endereço exibido pelo Vite (normalmente `http://localhost:5173`). O
frontend local usa o Authentication e o Firestore do projeto em `.env.local`;
não há chamadas a `connectAuthEmulator` ou `connectFirestoreEmulator` no frontend.
Executar o emulador de testes não redireciona automaticamente o navegador para ele.

| Script | Função real |
| --- | --- |
| `dev` | Servidor de desenvolvimento Vite. |
| `typecheck` | `tsc -b --pretty false`, verificação TypeScript. |
| `test` | Testes Node de storage e do planejador da migração, sem emulador. |
| `test:rules` | Inicia o emulador Firestore, executa regras, migração real, proteção dos perfis e preservação de dados sequencialmente e encerra o emulador. |
| `build` | `tsc -b` e build Vite para `dist`. |
| `preview` | Serve o build local; não publica no Firebase. |

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
npm.cmd run preview
```

Se necessário, instale a CLI com `npm.cmd install -g firebase-tools`.
`test:rules` inicia e encerra o emulador e executa as suítes sequencialmente,
sem escrever no Firestore de produção. Os testes verificam permissões, tentativas
de promoção, acesso sem perfil, isolamento, vínculos Kit/mapa, migração real,
preservação do legado, reexecução, exportação e preferências por obra.
Também cobrem inicialização em duas instâncias, exclusão de versões futuras e
retomada da migração depois de corrigir dados inválidos.

As quatro suítes de integração usam `projectId: "lmcoloredplans"`, chamam
`clearFirestore` no emulador e não devem compartilhar sua instância com dados de
teste que precisem ser preservados. Não há emulador Auth, testes de componentes,
testes ponta a ponta, script de lint ou CI configurados. A cobertura existente
não comprova todas as validações de domínio; veja as lacunas na auditoria.

## Configuração e publicação

Habilite o login por e-mail/senha, autorize `localhost` no Authentication e
provisione os perfis. Para produção, confirme também o bloqueio de cadastro público
descrito acima e revise os setores de contas antigas.

```powershell
firebase login
firebase use --add
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
firebase deploy --only hosting,firestore:rules
```

Selecione o projeto correspondente a `VITE_FIREBASE_PROJECT_ID`. O Hosting publica
`dist` e redireciona rotas da SPA para `index.html`. Autorize o domínio publicado
no Authentication. Os headers configuram `no-store` para `/` e arquivos `.html`,
e cache de um ano com `immutable` para JS/CSS (gerados com hash pelo Vite).
Isso não remove o cache offline do Firestore.
As novas regras e o frontend devem ser entregues juntos:
clientes antigos que gravem sem versão deixam de ser compatíveis com as novas regras.
Preserve um backup administrativo antes da atualização. Não houve deploy automático.

O alias atual de `.firebaserc` é `lmcoloredplans`; a configuração do frontend e
a seleção da CLI são independentes. O deploy acima não cria contas, perfis ou
legendas, não executa a migração no servidor e não bloqueia cadastro no
Authentication. A migração é iniciada pelo cliente ao abrir os mapas.

A Fase 1 não inclui gestão de equipes, histórico completo, seletor de obras,
dashboards complexos, relatórios avançados, novos tipos de Kits, estoque avançado,
novos indicadores/gráficos, notificações, módulos administrativos ou funções de ERP.
Busca, resumo visual e exportações já existentes são preservados.
