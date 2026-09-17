# ColoredPlans

> Olhar a planta e entender imediatamente o que foi feito, o que falta e o que é necessário para continuar.

A planta é o centro da aplicação. O ColoredPlans é uma ferramenta visual para a
execução da obra, não um ERP. A Fase 1 organiza usuários, permissões, obras e dados
sem acrescentar módulos administrativos ou redesenhar a experiência.

## Tecnologias

React, TypeScript estrito, Vite, Firebase Authentication (e-mail/senha), Cloud
Firestore e Firebase Hosting. A planta atual é um SVG com 100 unidades em sete
blocos. Os testes usam o runner do Node e `@firebase/rules-unit-testing` com o
emulador Firestore. Não há servidor próprio nem painel administrativo.

## Arquitetura

```text
App React
  -> Authentication: identifica o usuário
  -> perfil Firestore: setor provisionado pelo responsável
  -> hooks: estado da interface e observação em tempo real
  -> serviços Firestore: usuário + obra
  -> mapas / Kits da obra
  -> legendas do usuário (comuns às suas obras)
```

- `src/types/planta.ts`: perfil, setor, obra, mapas, Kits, legendas e exportação.
- `src/config/dados.ts`: versão do schema e identificação da obra padrão.
- `src/services/caminhos.ts`: referências aos documentos e collections atuais.
- `src/services/perfil.ts`: leitura do perfil, sem criação ou edição pelo cliente.
- `src/services/firestore.ts`, `kits.ts`, `legendas.ts`: persistência e observação.
- `src/services/migracoes.ts`: execução da migração; `migracoes/planejarV1.ts` valida e monta seu plano.
- `src/hooks/`: autenticação, perfil, mapas, Kits e legendas.
- `src/components/`: planta, ferramentas, abas, detalhes, legendas e Central de Kits.
- `src/data/planta.ts`: unidades e geometria da planta atual.
- `src/services/storage.ts`: preferência da aba ativa e importação/exportação.

As decisões, a auditoria e os limites desta etapa estão em
[docs/fundacao.md](docs/fundacao.md).

## Contas e permissões

Não existe cadastro público no produto. O responsável técnico cria a conta no
Authentication e define seu setor no Firestore antes de entregar o acesso.
O usuário final não escolhe, altera ou promove o próprio setor.

A aplicação apenas lê `usuarios/{uid}`. As regras negam **qualquer escrita de
cliente** nesse documento, inclusive criação, substituição, atualização e exclusão.
Somente Console/Admin SDK, autenticados administrativamente por IAM, podem
provisionar o perfil. Campos ou claims inventados pelo cliente não concedem acesso.

Uma sessão autenticada sem perfil válido recebe a tela **Conta aguardando liberação**,
e as regras também negam acesso aos mapas, obras, legendas e Kits. Perfis existentes
sem `schemaVersion` continuam legíveis como versão 0; o responsável deve conferir os
setores antigos, pois anteriormente havia escolha no primeiro acesso.

| Setor | Permissões atuais |
| --- | --- |
| Apontamento | Seus mapas manuais, marcações, filtros, busca, legendas, importação JSON e exportações JSON/CSV. |
| Estoque | As mesmas funções e seus Kits: materiais por unidade, associação de unidades, consumo calculado e operações atômicas com o mapa associado. |

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
`atualizadoEm`. A configuração transitória `OBRA_PADRAO` fica em um único arquivo.

Hooks e serviços de mapas e Kits recebem a obra explicitamente. A aba ativa no
navegador também é isolada por usuário e obra. Não há seletor de obras nesta fase;
a aplicação continua abrindo a obra padrão, com a planta atual.

Conceitualmente, mapas representam a execução da obra. Fisicamente, continuam no
espaço do usuário para preservar o isolamento existente. Transferi-los para uma
obra compartilhada sem definir membros, acesso e resolução de conflitos seria
inseguro. Essa transferência foi adiada, sem mover ou excluir dados nesta fase.

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
sem esse campo. As regras exigem que os dois lados do vínculo pertençam ao mesmo
usuário e à mesma obra. Não é permitido transferir um Kit de obra por edição.

Legendas são configurações do usuário, comuns às suas obras. Não são permissões.
A consulta atual não exige índice composto adicional.

## Mapas, legendas e Kits

Cada mapa representa um serviço sobre a mesma planta e mantém marcações próprias.
Os status usam IDs das legendas dinâmicas. Alterações aparecem por snapshots locais
e são confirmadas pelo servidor; dados persistem no cache Firestore do navegador,
inclusive entre abas do mesmo navegador.

Recursos preservados:

- Busca por número com ou sem zeros iniciais, escolha do bloco e seleção sem pintar.
- Renomeação de mapas manuais com validação de nomes vazios/duplicados entre os
  mapas carregados. O ID e as marcações não mudam.
- Resumo do mapa ativo com total, porcentagem marcada e quantidade por legenda.
- Filtros, zoom, pintura rápida, borracha e detalhes da unidade.
- Indicador existente de salvamento, pendência de sincronização e erros.
- Importação e exportação JSON do mapa ativo, mantendo o formato `version: 1`.
- CSV de todos os mapas da obra ativa, inclusive unidades sem marcação:
  mapa, bloco, número e status; UTF-8 com BOM, ponto e vírgula e CRLF.
  O relatório usa os dados locais disponíveis. No Excel, importe bloco e número
  como texto para preservar zeros iniciais.

Um Kit descreve materiais para uma unidade. Seu consumo é a quantidade por Kit
multiplicada pelo número de unidades atendidas. Cada Kit tem um mapa associado:
criação usa lote atômico; renomeação, alteração das unidades e exclusão usam
transações. O nome acompanha o Kit, e o contorno de utilização é independente do
status pintado. Editar ou apagar apenas um lado do vínculo é rejeitado pelas regras.

Marcações manuais continuam funcionando com cache offline; transações de Kits e
migrações precisam de conexão. Não foi criado um novo mecanismo offline nesta fase.

## Schema e migração

`CURRENT_SCHEMA_VERSION = 1` é a primeira versão explícita do schema remoto.
Ausência de versão é tratada como 0. Não confundir com a versão 1 do arquivo JSON
ou com o antigo sufixo v3 da preferência local.

A migração `0 -> 1`:

1. Valida mapas, Kits, proprietários, unidades, materiais e versões.
2. Copia mapas do caminho legado para o usuário sem apagar a origem. Uma colisão
   de ID interrompe a migração; um documento já copiado é reconhecido por `origemLegada`.
3. Consolida pares Kit/mapa antigos, atribui `obraId` e `schemaVersion`.
   Vínculos explícitos têm precedência; associação por nome só ocorre se inequívoca.
4. Executa grupos pequenos em transações, comparando os documentos lidos com o
   plano para impedir sobrescrita de alterações concorrentes.
5. Marca a obra com versão 1 apenas ao concluir. Reexecuções não repetem o trabalho.

O plano completo é validado antes das gravações. Se houver falha durante a execução,
grupos já concluídos permanecem consistentes e a próxima abertura retoma a migração.
Mapas órfãos, ambiguidades e dados inválidos geram erro para revisão administrativa;
não são descartados nem convertidos silenciosamente. Versões futuras são rejeitadas.

Perfis antigos continuam somente leitura; sua versão é atualizada administrativamente.
Legendas antigas continuam legíveis e recebem versão 1 quando editadas. Migrações
não dependem do cache para confirmar sucesso nem bloqueiam a exibição de mapas
já armazenados localmente. Após reconectar, a preparação é tentada novamente.

## Desenvolvimento e validação

Use Node.js 22.16 ou superior, npm, Firebase CLI e Java 21 para o emulador.

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Preencha em `.env.local`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`.
`VITE_FIREBASE_MEASUREMENT_ID` é opcional; Analytics não é inicializado.
API key, auth domain, project ID e app ID são obrigatórios na inicialização.

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
no Authentication. As novas regras e o frontend devem ser entregues juntos:
clientes antigos que gravem sem versão deixam de ser compatíveis com as novas regras.
Preserve um backup administrativo antes da atualização. Não houve deploy automático.

A Fase 1 não inclui equipes, histórico completo, seletor de obras, novos dashboards,
estoque avançado, CI ou novas funções de ERP.
