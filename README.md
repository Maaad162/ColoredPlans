# ColoredPlans

Versão **1.7.0 — Hierarquia, colaboração e contas de teste**.

> Olhar a planta e entender imediatamente o que foi feito, o que falta e o que é necessário para continuar.

A planta é o centro da aplicação. A visão geral ajuda a encontrar um serviço e abrir suas unidades; não substitui a planta por relatórios. ColoredPlans acompanha execução, observações, responsáveis e necessidade teórica de materiais. Não é ERP, estoque oficial, sistema de compras, RH ou BI.

## Tecnologias

React, React DOM, TypeScript estrito, Vite, Firebase Authentication (e-mail/senha), Cloud Firestore e Firebase Hosting. A representação visual usa SVG controlado pelo React e CSS, sem CAD, SVG arbitrário, PDF ou imagens de fundo importadas. Node executa testes de domínio; Firebase Emulator e `@firebase/rules-unit-testing` verificam regras e transações; Playwright testa o navegador real; ESLint verifica o código e os hooks.

Não há servidor próprio, Cloud Functions, Storage, Analytics ou integração real com SIENGE. O DEV dispõe de gestão restrita de acessos já provisionados; contas Auth e mudanças de nível continuam administrativas. O lockfile registra as dependências instaladas.

## Hierarquia e propriedade

```text
Authentication: UID autenticado
  → usuarios/{uid}: perfil provisionado
  → obras autorizadas no espaço desse usuário
      → plantas: instâncias físicas
          → template: geometria reutilizável
          → mapas: serviços e seus estados independentes
              → unidades: marcação + contexto + histórico
      → equipes operacionais
      → histórico da obra
```

Uma obra tem ID, nome e status `ativa` ou `arquivada`. O status ausente no legado equivale a ativa. Obra arquivada continua selecionável e seus dados/histórico permanecem disponíveis; não é escolhida como primeira opção quando há obra ativa. Arquivamento não exclui dados nem bloqueia a execução: é uma classificação administrativa.

**O isolamento é por espaço.** Perfis hierárquicos compartilham dados somente quando provisionados no mesmo `espacoId`, respeitando as obras atribuídas e o nível. Perfis legados mantêm seus dados privados. Obras com o mesmo ID em espaços diferentes continuam independentes; registros existentes não são mesclados. Um documento de membro ou claim inventado não concede acesso.

A aplicação lista os metadados das obras da conta, seleciona uma obra e carrega seu catálogo de plantas. Ao trocar de contexto, remonta os hooks operacionais e cancela os listeners anteriores. Preferências locais nunca concedem autorização. A obra/planta selecionadas são lembradas por UID; o mapa ativo é lembrado por UID, obra e planta. O fallback da preferência antiga só pode selecionar um mapa que exista na planta carregada.

## Contas e permissões

Não existe cadastro público na interface. Contas são criadas administrativamente no Authentication; antes da entrega da conta, o responsável define o setor em `usuarios/{uid}`. O usuário final não escolhe nem altera seu setor.

O modelo canônico é `PerfilUsuario`, com setor `tipoConta: "apontamento" | "estoque"` e, no perfil v2, nível hierárquico independente. As Rules proíbem criação/exclusão de perfis e autopromoção pelo cliente. Somente DEV pode atualizar setor, superior e obras de outros perfis v2 já provisionados no mesmo espaço; não pode editar o próprio perfil nem outro DEV. Perfil ausente/inválido mostra “Conta aguardando liberação” e também impede acesso pelo SDK/DevTools. A matriz v2 está em [Contas de teste](docs/TEST_USERS.md).

A tabela abaixo descreve a compatibilidade dos **perfis legados (schema 0/1)**:

| Setor | Responsabilidades |
| --- | --- |
| Apontamento | Mapas manuais, marcações, contexto das unidades, atribuição de equipe existente, filtros, visão geral, legendas, importação/exportação e histórico autorizado. |
| Estoque | As mesmas funções e composição dos Kits, disponibilidade manual auxiliar, unidades aplicáveis e mapas vinculados aos Kits. |

Nos perfis legados, mapas de Kit existentes continuam legíveis na própria conta após troca administrativa de setor, mas alterar o mapa vinculado exige Estoque; Apontamento não lê documentos dos Kits. Nos perfis v2, a consulta de Kits acompanha o acesso à obra e a gestão segue a matriz hierárquica. Obras, plantas, templates e cadastro de equipes são administrativos.

Formato do perfil legado provisionado pelo Console/Admin SDK (para v2, consulte a migração administrativa em `docs/TEST_USERS.md`):

```text
usuarios/{uid}
  userId: UID da conta
  email: e-mail
  tipoConta: apontamento ou estoque
  schemaVersion: 1
  criadoEm: timestamp
```

Legendas iniciais podem ser provisionadas a partir de `src/config/statuses.ts`; a interface permite criá-las aos perfis legados e ao DEV do espaço compartilhado. O frontend não cadastra padrões automaticamente.

As regras Firestore não controlam o endpoint de cadastro do Authentication. Para bloquear signup direto, o projeto deve configurar `client.permissions.disabledUserSignup = true`. O script administrativo existente verifica isso sem alterar por padrão:

```powershell
.\scripts\auth-fechado.ps1 -ProjetoId SEU_PROJETO
# Aplicação explícita, com Google Cloud CLI autenticado e IAM adequado:
.\scripts\auth-fechado.ps1 -ProjetoId SEU_PROJETO -Aplicar
```

## Identidade e nome da obra

`Obra` possui `id` (identificador técnico estável) e `nome` (texto exibido), além
dos metadados existentes. Para **Jardim das Tulipas I**, o ID preservado é
`obra-principal`, não `jardim-das-tulipas-i`. No Firestore, o ID é a chave do
documento `usuarios/{uid}/obras/obra-principal`; o nome fica no campo `nome`.
A identidade completa inclui o UID, pois os dados continuam isolados por conta.

Renomear uma obra significa atualizar administrativamente somente `nome` no
documento existente. Não renomeie o documento nem derive caminhos do nome.
Seletores, navegação e visão geral leem `obra.nome`; mapas, plantas, Kits,
contextos, histórico e permissões continuam usando o ID. Novas obras usam
seus próprios IDs e nomes, sem condições específicas na interface.

A substituição de “Obra principal” por “Jardim das Tulipas I” é uma correção de
metadado existente, sem migração estrutural: o schema permanece 1 e as regras
continuam impedindo que clientes alterem o cadastro da obra. Uma atualização
administrativa deve usar máscara somente para `nome` e precondição de versão
do documento, preservando todos os demais campos e subcoleções.

## Plantas, templates e geometria

**Planta** é uma instância física, como Torre A. **Mapa** é um serviço aplicado sobre ela, como Hidráulica. A geometria fica no template, não é duplicada por mapa. Duas plantas podem usar o mesmo template e o mesmo ID físico `apt-042`, mantendo mapas, marcações e contextos independentes.

O formato `PlantaDefinition` contém `schemaVersion`, nome, largura/altura e blocos com retângulos de unidades. Cada unidade tem ID estável, bloco, número, label opcional e coordenadas. Labels podem mudar sem alterar a identidade do histórico. A definição aceita até 1000 unidades e 100 blocos; plantas maiores devem ser divididas em setores para limitar o documento e a interface.

`src/services/geometria.ts` valida versão, textos, IDs duplicados, endereço físico duplicado, dimensões finitas/positivas e limites da geometria. Dados JSON nunca são executados ou inseridos com `dangerouslySetInnerHTML`.

O template interno `original-v1` conserva as 100 unidades, IDs, coordenadas e decoração visual originais. Seu desenho de fundo continua como apresentação controlada no componente SVG. Novos templates usam retângulos definidos em dados, sem alterar componentes. A planta reservada `planta-principal` mantém essa geometria original.

Templates são internos à obra e somente leitura para clientes. Use um novo ID/versionamento de template para novas geometrias; não remova unidades usadas por mapas existentes. O provisionador cria documentos exclusivamente e rejeita sobrescritas.

## Provisionar obras e plantas

O exemplo [docs/exemplo-obra.json](docs/exemplo-obra.json) descreve duas torres reutilizando um template e uma equipe. Ajuste o arquivo; não é necessário modificar o frontend.

```powershell
# Só valida e mostra os caminhos; não acessa o Firebase:
node --experimental-strip-types scripts/provisionar-obra.mjs --arquivo docs/exemplo-obra.json --uid UID

# Execução administrativa explícita, com token temporário obtido pelo gcloud:
$env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token
node --experimental-strip-types scripts/provisionar-obra.mjs --arquivo docs/exemplo-obra.json --uid UID --projeto SEU_PROJETO --aplicar
Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN
```

O token precisa de IAM administrativo no projeto. Não o coloque em `VITE_*`, JSON, Git ou navegador. O comando só usa HTTPS com a API oficial do Firestore, não cria infraestrutura ou contas. Um commit atômico exige que todos os documentos de destino sejam inexistentes; uma colisão rejeita o lote inteiro.

`--adicionar` preserva os metadados de uma obra existente e cria apenas os novos templates/plantas/equipes do arquivo. Exige obra com UID e schema compatíveis. Para reutilizar um template já cadastrado ao adicionar outra planta, use o Console/Admin SDK com o contrato documentado; o script valida referências ao template interno ou aos templates definidos no próprio arquivo.

Novas obras recebem `plantaLegada: false`. Obras antigas sem esse campo continuam incluindo a planta original, mesmo após adicionar novas plantas. Não altere esse marcador em uma obra com mapas antigos. Arquivar consiste em atualizar `status` para `arquivada` administrativamente; não existe exclusão de obra pelo cliente.

## Firestore real

### Hierarquia de usuários (perfil v2)

Os níveis `tecnico`, `engenheiro`, `coordenador`, `gestor` e `dev` são separados
do setor `tipoConta` (`apontamento`/`estoque`). O perfil v2 acrescenta `nivel`,
`espacoId`, `superiorId` e `obraIds`. Técnico, Engenheiro e Coordenador acessam
as obras explicitamente atribuídas; Gestor e DEV abrangem todas do mesmo espaço.
O vínculo com o superior não concede obras automaticamente.

Técnicos de Apontamento e Estoque são supervisionados pelo mesmo Engenheiro,
que consulta ambos sem alternar setor. Técnicos criam mapas e apontam;
Engenheiro não altera marcações/contextos e só administra mapas/Kits próprios
(autoria `criadoPor`). Mapas e Kits dos Técnicos são somente consulta para ele.
Técnico Estoque, Engenheiro e Coordenador gerenciam Kits; para DEV, Kits exigem
setor Estoque. A matriz completa e os testes locais estão em `docs/TEST_USERS.md`.

O espaço usa o UID estrutural existente: dados operacionais continuam nos mesmos
caminhos `usuarios/{espacoId}/obras/{obraId}`, sem cópias por colaborador. Autoria
no histórico (`autorId`) e nas atualizações usa o UID de quem realizou a ação.
Jardim das Tulipas I mantém o ID `obra-principal`.

Perfis 0/1 mantêm a operação privada anterior até uma migração administrativa
explícita. Só os perfis migram para 2; o schema operacional continua 1.
O DEV pode editar setor, superior e obras de outros perfis já provisionados no
seu espaço; nível, contas Auth e o próprio perfil exigem administração externa.

Para testar os cinco níveis com login real no Auth Emulator, execute
`npm run dev:test-users`. Credenciais locais, matriz de permissões, limites e
migração estão em [docs/TEST_USERS.md](docs/TEST_USERS.md). O seed é exclusivo de
emuladores locais `demo-coloredplans` e não altera produção.

```text
usuarios/{uid}
  userId, email, tipoConta, schemaVersion, criadoEm
  obras/{obraId}
    userId, nome, status?, plantaLegada?, schemaVersion, atualizadoEm?
    plantas/{plantaId}
      schemaVersion, nome, templateId
    templates/{templateId}
      schemaVersion, definicao, unidadeIds[]
    equipes/{equipeId}
      schemaVersion, nome
    mapas/{mapaId}
      userId, obraId, plantaId?, equipeId?, schemaVersion
      nome, tipo, marcacoes, kitId?, kitUnidadeIds[], datas, ultimoEventoId?
      contextos/{unidadeId}
        userId, obraId, plantaId?, mapaId, unidadeId, schemaVersion
        observacao, responsavel, atualizadoEm, atualizadoPor, ultimoEventoId
    historico/{eventoId}
      userId, obraId, plantaId?, mapaId, mapaNome, schemaVersion
      acao, unidadeIds[], antes, depois, nomeAnterior, nomeAtual, criadoEm
  kits/{kitId}
    userId, obraId, plantaId?, mapaId, schemaVersion, nome
    materiais[], unidadeIds[], criadoEm, atualizadoEm, atualizadoPor
  legendas/{legendaId}
    userId, schemaVersion, nome, cor, corTexto, simbolo, categoria?, datas

obras/{obraId}/mapas/{mapaId}
  origem legada: leitura pelo criador, sem escrita ou exclusão pelo cliente
```

Os caminhos dos mapas permanecem planos dentro da obra para conservar todos os IDs e subcoleções existentes. `plantaId` faz a associação hierárquica; não é possível transferir mapa ou Kit para outra planta por edição. Nomes iguais de serviço em plantas diferentes são permitidos; IDs de mapas são únicos dentro da obra.

Kits mantêm seus caminhos históricos no usuário. Os vínculos exigem mesmo usuário, obra e planta, nomes iguais, IDs recíprocos e listas de unidades consistentes. Criação usa lote; renomeação, associação de unidades e exclusão usam transações. Apagar um mapa de Kit isoladamente é negado. Plantas/templates/equipes são provisionados pelo administrador, não pelo SDK do usuário final.

## Visão geral, pendências e continuidade

“Visão geral da obra” apresenta as plantas em seções compactas. Abrir uma seção carrega os seus serviços; fechá-la remove os listeners correspondentes. Os números de cada mapa derivam de suas unidades aplicáveis e das categorias das legendas:

- Concluídas / total;
- em andamento;
- pendentes (categoria não iniciado, incluindo ausência de marcação);
- bloqueadas;
- unidades ainda não concluídas.

Cada botão abre a planta/mapa de origem com o filtro correspondente. Unidades fora do filtro ficam atenuadas. Não há média de percentuais, semáforo arbitrário ou “progresso global da obra”. Cores não determinam a categoria operacional; legendas antigas recebem a interpretação de compatibilidade até serem editadas.

Kits se aplicam exatamente à lista selecionada, inclusive lista vazia. Unidades aplicáveis sem marcação recebem preenchimento verde completo; uma marcação usa a cor da legenda. O pequeno marcador do Kit continua identificando aplicabilidade.

Cálculos puros em `src/services/operacao.ts`, sem totais persistidos:

- Consumo estimado = unidades atualmente concluídas × composição por unidade.
- Necessidade = unidades restantes × composição por unidade.
- Déficit por material = máximo entre necessidade menos disponibilidade e zero, somente com disponibilidade informada.
- Capacidade = menor quantidade inteira executável por todos os materiais, limitada ao restante; desconhecida se qualquer disponibilidade faltar.

Zero é conhecido; ausência é desconhecida. Reabrir uma unidade recalcula os valores, sem somar histórico como consumo. O dashboard aceita um provider de disponibilidades no modelo `DisponibilidadeMaterial`; fonte e timestamp acompanham o resultado. Por padrão, usa a informação manual auxiliar do Kit.

**SIENGE permanece a fonte oficial de estoque, movimentação, compras, requisições, custos, financeiro e processos corporativos.** Nenhuma pintura gera baixa, reserva ou pedido. `codigoSienge` é referência textual opcional. Não foram implementados endpoint, autenticação, webhook ou conexão real com o ERP.

## Equipes, contexto e histórico

Equipes contêm somente ID e nome e pertencem à obra. O seletor “Equipe do serviço” associa uma equipe cadastrada ao mapa. Alteração e evento são gravados atomicamente. A visão geral pode filtrar por equipe; não há membros de RH, ranking ou produtividade individual.

Cada unidade/mapa mantém observação de até 240 caracteres e responsável de até 80. Salvar contexto grava documento e evento no mesmo lote. O histórico registra criação/renomeação/exclusão de mapas manuais, pintura, importação/limpeza agrupada, contexto e equipe. Mantém obra, planta, mapa, unidade e autor; eventos antigos continuam ligados à planta original.

Histórico é paginado em 20 eventos, consultado na obra e opcionalmente no mapa/unidade atuais. Eventos são imutáveis para clientes. É histórico operacional, não auditoria inviolável de servidor: clientes anteriores podem gravar mapas sem eventos, e não existem eventos retroativos ou de materiais/vínculos de Kits.

## Sincronização, offline e desempenho

O Firestore mantém cache persistente entre abas. O indicador considera snapshots, gravações pendentes, conectividade e falhas reais; nunca simula sucesso. “Sincronizado” exige fontes confirmadas e ausência de pendências/falhas.

Uma única mensagem de erro fica visível. A nova substitui a anterior e o X fecha o aviso. O indicador permite reabrir falhas, priorizando gravações pendentes. Fechar não declara sucesso nem descarta o registro da falha. “Tentar novamente” reaplica a operação; confira o contexto identificado no aviso.

Troca de obra/planta é desabilitada durante gravações pendentes. Após falha, a operação continua acompanhada no controlador da sessão. Listeners do contexto anterior são cancelados; callbacks descartam resultados obsoletos. Trocar um contexto não reaproveita a geometria, formulário ou marcações anteriores.

Na entrada, carrega-se catálogo de obras, catálogo da obra ativa, definição e mapas da planta selecionada. A visão geral só observa as seções abertas da obra atual. Contextos pertencem ao mapa aberto; histórico só existe enquanto seu modal está aberto. Não existem agregados materializados, listeners de todas as obras ou carregamento antecipado de todas as geometrias.

Compatibilidade tem um custo delimitado: para encontrar documentos antigos sem `plantaId`, a consulta da planta original lê os mapas da obra e filtra localmente. Kits da planta original ainda usam a consulta histórica por UID para incluir Kits sem `obraId`; plantas novas usam obra/planta na consulta. Uma futura migração administrativa desses campos permitirá restringir todas essas consultas. Não se ocultou o legado para otimizar leitura.

A exclusão de legenda verifica uso nos mapas de todas as obras da conta, sob demanda e com confirmação do servidor. Não cria listeners permanentes. É uma proteção da aplicação, não uma restrição transacional contra alterações simultâneas de outro cliente; referências desconhecidas continuam preservadas e aparecem como legenda indisponível.

Pintura e contexto funcionam com cache/fila do SDK. Primeiro acesso, migração, transações e provisionamento exigem conexão. Se uma definição ainda não estiver em cache, a interface informa indisponibilidade; não substitui por outra geometria. Sair não limpa explicitamente o cache Firestore do dispositivo.

## Importação e exportação

O JSON atual é **versão 2**, por mapa, e inclui obra, planta, ID do mapa, template, definição geométrica e Kit associado quando acessível, além dos IDs estáveis e estados das unidades. Importar exige o mesmo contexto e unidades válidas; restaura marcações atomicamente com histórico. Não sobrescreve configurações administrativas ou materiais do Kit. Assim, o arquivo conserva o contexto sem transformar importação de marcações em administração de obras.

Arquivos antigos versão 1 e sem versão continuam aceitos: bloco/número são resolvidos contra as unidades da planta atual. Versões desconhecidas, unidades repetidas, estados desconhecidos e contextos divergentes são rejeitados. O CSV inclui os mapas da planta selecionada, com BOM UTF-8, `;`, CRLF e neutralização de fórmulas. JSON/CSV não são backup completo da conta ou do histórico.

## Schema e compatibilidade

O schema dos dados operacionais continua **1**, com leitura de `0 | 1`. O perfil hierárquico usa **2**, com migração administrativa explícita e idempotente; perfis legados permanecem compatíveis. A versão da aplicação (1.7.0), da definição geométrica e do arquivo exportado são contratos independentes. Não houve migração destrutiva nem regravação em massa.

A adaptação de leitura associa `plantaId` ausente a `planta-principal`; `null`, vazio e IDs inválidos são erros, não fallback. Novos mapas/Kits e eventos escrevem a planta explicitamente. Materiais antigos continuam com unidade `un` e disponibilidade desconhecida. Todos os IDs usados no histórico são conservados.

A migração existente `0 → 1` permanece: valida o plano completo, copia fontes globais sem apagá-las, conserva pares Kit/mapa, detecta ambiguidades/colisões, compara documentos em transações e só atualiza o marcador da obra após concluir. Reexecuções são idempotentes. Versões futuras são rejeitadas, inclusive em exclusões.

A obra deve estar previamente provisionada. Se um cadastro anterior à Fase 1 ainda não tiver documento pai, crie administrativamente `usuarios/{uid}/obras/{obraId}` com `userId`, nome e `schemaVersion: 0`; não marque como 1 antes da migração. O acesso ao espaço histórico `obra-principal` continua compatível com os documentos legados, mas o cliente não pode criar uma obra. Obras novas começam em 1 pelo provisionador.

## Desenvolvimento

Use Node.js 24, npm e Java 21. A CLI Firebase é dependência local.

```powershell
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev
```

Preencha `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`. `VITE_FIREBASE_MEASUREMENT_ID` é opcional e não ativa Analytics. Nunca use credencial administrativa em variável `VITE_*`.

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`. O frontend usa o projeto de `.env.local`. Para isolamento, configure `VITE_USE_EMULATORS=true`, project ID `demo-coloredplans` e rode em localhost/127.0.0.1:

```powershell
npx firebase emulators:start --project demo-coloredplans --only auth,firestore
```

Provisione conta, perfil e obra no emulador. Testes de navegador preparam seus próprios dados.

| Script | Finalidade |
| --- | --- |
| `dev` | Servidor Vite |
| `typecheck` | TypeScript sem emitir build |
| `lint` | ESLint e hooks, sem tolerância a avisos |
| `test` | Domínio, storage, geometria, provisionamento, migração e sincronização |
| `test:rules` | Regras, isolamento, pares Kit/mapa, migração real e histórico no Firestore Emulator |
| `test:ui` | Playwright com Auth/Firestore Emulator e Vite na porta 4173 |
| `build` | TypeScript e Vite para `dist` |
| `check` | Typecheck → lint → testes unitários → regras → navegador → build |
| `preview` | Servir build local, sem publicar |

```powershell
npx playwright install chromium
npm.cmd run check
# Alternativa Windows: $env:PLAYWRIGHT_CHANNEL='msedge'
```

Não execute suítes de emulador simultaneamente: elas limpam os dados do projeto demo. O workflow `.github/workflows/check.yml` executa `npm run check` em pushes/PRs para `main` e `development`, com Node 24, Java 21 e Chromium; não faz deploy. Proteção obrigatória de branch depende da configuração do GitHub.

## Publicação

```powershell
npm.cmd run check
npx firebase deploy --only hosting,firestore:rules,firestore:indexes --project SEU_PROJETO
```

Publique frontend e regras compatíveis, confira os índices e autorize o domínio no Authentication. `firebase.json` publica `dist`, redireciona rotas à SPA, evita cache do HTML e mantém cache imutável dos assets com hash. O alias atual é `lmcoloredplans`; CLI e `.env.local` precisam apontar para o projeto correto. O deploy não provisiona contas/obras, não executa migrações no servidor e não bloqueia signup no Authentication.

A implementação da Fase 4 não publica nem migra dados de produção automaticamente. Consulte [docs/evolucao-produto.md](docs/evolucao-produto.md) para decisões e limites. Documentos das Fases 1–3 são registros históricos; este README descreve a arquitetura atual.
