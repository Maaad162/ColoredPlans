# Auditoria da arquitetura — Fase 1: Fundação

Registro da Fase 1. As lacunas de testes, lint, CI, sincronização e histórico
abaixo descrevem aquela entrega; consulte a revisão da
[Fase 2 — Confiabilidade operacional](confiabilidade.md) para o estado atual.

Revisão inicial: 18/09/2026; consolidação: 19/09/2026. Fonte principal: código presente no workspace, incluindo as
alterações locais anteriores a esta revisão. README, regras e testes foram
confrontados com essa implementação. Esta auditoria não inspecionou a produção.

O critério de decisão é preservar a planta como centro: entender imediatamente
o que foi feito, o que falta e o que é necessário para continuar. O escopo desta
auditoria começou como inventário, diagnóstico e documentação. A tabela de
achados distingue correções implementadas na Fundação de limites preservados.

## Inventário e responsabilidades

| Local | Responsabilidade verificada |
| --- | --- |
| `src/main.tsx` | Monta React em `StrictMode`, escolhe a obra inicial, importa `App` e apresenta falha de inicialização. |
| `src/App.tsx` | Encadeia sessão, perfil, mapas e Central de Kits; recebe `obra` por parâmetro e remonta a aplicação por UID/obra/setor. |
| `src/components/Auth`, `Conta` | Login e conta aguardando liberação. Não há formulário de cadastro ou escolha de setor. |
| `src/components/Planta` | SVG, blocos, unidades, seleção, zoom, arraste e contorno de utilização de Kit. |
| `MapTabs`, `Toolbar`, `BuscaUnidade` | Abas, criação/renomeação/exclusão de mapas manuais, filtros, pincel, borracha, busca e importação/exportação. |
| `PainelUnidade`, `PaletaStatus`, `Legenda` | Detalhes, edição de status e resumo das marcações do mapa ativo. |
| `GerenciarLegendas` | CRUD de legendas; verifica duplicidade, uso nas abas carregadas e preservação da última legenda na interface. |
| `CentralKits` | Lista, editor de materiais, associação de unidades, consumo calculado e abertura do mapa do Kit. |
| `src/hooks/useAuth.ts` | Observação da sessão, login por e-mail/senha e logout. |
| `src/hooks/usePerfil.ts` | Observa perfil, carregamento e erro; perfil inválido interrompe acesso à aplicação operacional. |
| `src/hooks/usePlanta.ts` | Estado de abas, marcações, seleção e filtros; inicia migração, observa mapas e cria mapa inicial quando necessário. |
| `src/hooks/useKits.ts` | Observa Kits do usuário/obra e expõe salvar, excluir e vincular unidades. |
| `src/hooks/useLegendas.ts` | Observa legendas do usuário e expõe criar, editar e excluir. |
| `src/services/caminhos.ts` | Constrói referências de perfil, obra, mapas, Kits e legendas com a instância Firebase da aplicação. |
| `src/services/perfil.ts` | Leitura e validação de UID, setor e versão. Não escreve perfis. |
| `src/services/firestore.ts` | Persistência e leitura de mapas, incluindo alteração de uma marcação ou substituição de todas. |
| `src/services/inicializarMapa.ts` | Cria o primeiro mapa somente se ausente, em transação, sem sobrescrever uma inicialização concorrente. |
| `src/services/kits.ts` | Persistência dos pares Kit/mapa, normalização de leitura e cálculo do consumo. |
| `src/services/legendas.ts` | Persistência de legendas; calcula cor de texto e símbolo. |
| `src/services/storage.ts` | Preferência da aba ativa, validação/importação JSON e geração/download de JSON/CSV. Não armazena mapas em localStorage. |
| `src/services/migracoes.ts` | Executa grupos transacionais e marca conclusão na obra; recebe Firestore por parâmetro para testes. |
| `src/services/migracoes/planejarV1.ts` | Planejador puro da migração 0 → 1; valida entrada e saída simulada, reserva vínculos explícitos e detecta conflitos. |
| `src/config/dados.ts` | Schema atual 1, nomes de collections, leitura de versões/obra legada, validação de IDs e obra padrão. |
| `src/config/statuses.ts` | Exemplos de legendas padrão, contraste, símbolo e representação de status desconhecido/ausente. |
| `src/config/firebase.ts` | Inicializa Firebase Auth e Firestore com cache persistente e múltiplas abas. |
| `src/data/planta.ts` | Geometria fixa, 100 unidades e índice de unidades por ID. |
| `src/types/planta.ts` | Modelos da interface e contrato do JSON. |
| `src/App.css`, `src/styles`, `Planta.css` | Apresentação, responsividade e estados visuais. |
| `tests/` | Testes Node e integração com emulador Firestore. |
| `scripts/auth-fechado.ps1` | Verifica ou aplica bloqueio de cadastro de usuários finais no Authentication por API administrativa. |
| `vite.config.ts`, `tsconfig*.json`, `index.html` | Build e entrada da SPA; TypeScript estrito. |
| `firebase.json`, `.firebaserc` | Regras, Hosting de `dist`, rewrite da SPA, headers e alias `lmcoloredplans`. |
| `.env.example`, `src/vite-env.d.ts` | Variáveis Firebase esperadas. Os valores de `.env.local` não foram expostos nesta auditoria. |
| `README.md`, `docs/fundacao.md` | Guia operacional e registro de decisões. |

`node_modules`, `dist`, `.firebase`, `.edge-*` e logs são dependências ou artefatos,
não novas camadas da aplicação. `package-lock.json` registra versões resolvidas.
Não foi encontrado `AGENTS.md` no repositório nesta revisão.

## Modelos TypeScript

| Modelo | Significado e limites |
| --- | --- |
| `TipoConta`, `PerfilUsuario` | Setores `apontamento`/`estoque`, UID, e-mail, versão e data. Não há papel por obra. |
| `Obra` | Identidade e nome (`id`, `nome`); não modela geometria nem todos os metadados do documento remoto. |
| `Bloco`, `Unidade` | Geometria SVG e identidade `bloco-{bloco}-{numero}`. |
| `StatusConfig`, `LegendaUsuario` | Aparência/nome do status, acrescidos de proprietário, versão e data na legenda remota. |
| `StatusId`, `StatusFilter`, `FerramentaPintura` | IDs livres de texto e sentinelas `todos`/`sem-marcacao`. Não são estados fixos de workflow. |
| `Marcacoes`, `MapaServico` | Dicionário unidade → status, tipo manual/Kit, proprietário, obra e vínculo opcional. |
| `MaterialKit`, `Kit` | Materiais por unidade, IDs de unidades atendidas e referência ao mapa. Não modelam estoque físico. |
| `EstadoMapas` | Abas carregadas e aba ativa no React; não é documento Firestore. |
| `SchemaVersion` (`config/dados.ts`) | Versões remotas conhecidas: 0 (legado) e 1 (atual). |
| `ArquivoMarcacoes`, `UnidadeExportada` | JSON versão 1 com bloco, número e status; não contém definições de legendas, Kits ou obra. |
| `DadosKit` (`services/kits.ts`) | Entrada de criação/edição de Kit. |
| `DocumentoLegado`, `AlteracaoMigracao` | Entradas e operações do planejador. |

Datas remotas são convertidas para ISO nos leitores. Se faltarem timestamps,
alguns leitores usam a hora atual como fallback; isso não recupera a data histórica.
As interfaces TypeScript não substituem validação de dados vindos do Firestore.

## Fluxo de autenticação e permissões

1. `useAuth` observa Authentication. Sem sessão, `AuthScreen` permite somente login.
2. Com sessão, `usePerfil` observa `usuarios/{uid}`. Perfil ausente ou inválido leva
   a `ContaPendente`; nenhum cliente pode criar, editar ou excluir esse perfil.
3. `App` habilita a Central de Kits apenas para Estoque. Ambos os setores têm
   mapas manuais e legendas próprios.
4. As regras conferem UID, perfil/setor e versão conhecida. Kits exigem Estoque;
   os mapas verificam o vínculo com Kit ao gravar.

Authentication armazena a identidade; Firestore armazena o perfil e o setor.
O cadastro público não existe na interface, mas impedir chamadas diretas ao
Authentication depende da configuração administrativa de `disabledUserSignup`.
Essa configuração de produção não foi consultada ou aplicada nesta revisão.
Não há claims personalizados usados para liberar o setor.

## Persistência real e relações

| Entidade | Caminho | Escopo |
| --- | --- | --- |
| Perfil | `usuarios/{uid}` | Próprio usuário; escrita administrativa. |
| Obra | `usuarios/{uid}/obras/{obraId}` | Obra privada do usuário. |
| Mapa | `usuarios/{uid}/obras/{obraId}/mapas/{mapaId}` | Usuário + obra; `userId` e `obraId` também nos dados. |
| Kit | `usuarios/{uid}/kits/{kitId}` | Usuário; `obraId` associa a obra. |
| Legenda | `usuarios/{uid}/legendas/{legendaId}` | Usuário; compartilhada entre suas próprias obras. |
| Mapa global antigo | `obras/{obraId}/mapas/{mapaId}` | Fonte legada; leitura pelo criador com perfil válido, sem escrita de cliente. |

Um mapa representa um serviço sobre a planta única. Cada mapa mantém suas próprias
marcações. O par Kit/mapa repete intencionalmente o nome e as unidades vinculadas
para leitura visual direta: `kit.mapaId ↔ mapa.kitId`,
`kit.unidadeIds == mapa.kitUnidadeIds`. A duplicação é protegida nas operações
normais pelas regras e não deve ser removida apenas por estética.

Criação usa `writeBatch`; edição do Kit, associação de unidades e exclusão usam
`runTransaction`. Pintar uma unidade não altera o vínculo nem registra entrega de
material. Consumo é `quantidadePorKit × quantidade de unidades distintas`.

## Caches e migrações

O SDK Firestore usa cache persistente com `persistentMultipleTabManager`.
`usePlanta` observa metadados dos mapas e acompanha gravações e conectividade.
O indicador de salvamento não agrega o estado de Kits e legendas. Logout chama
`signOut`, sem rotina de limpeza do cache.

A preferência local de aba é isolada por UID/obra. O sufixo `v3` da chave é legado
do armazenamento local, independente do schema remoto 1 e do JSON versão 1.
Não existe migração de mapas a partir de localStorage na implementação atual.

A migração lê o servidor, planeja antes de gravar, conserva fontes globais e
agrupa alterações relacionadas em transações. Compara os valores dos documentos
para detectar alterações concorrentes nos grupos. Chamadas simultâneas são
reunidas por instância Firestore e UID/obra. Kits só são consultados quando o
setor habilita esse acesso. A obra é marcada com schema 1 ao final; esse marcador
dispensa futuras varreduras. Perfis não são migrados pelo cliente; legendas recebem
versão atual ao serem editadas.

## Achados e pendências

As linhas abaixo distinguem garantias existentes de limites ainda presentes.
Corrigir a descrição não equivale a corrigir o comportamento registrado.

| Achado | Evidência e consequência | Encaminhamento |
| --- | --- | --- |
| Preparação multiobra parcial | A partir da terceira tarefa, `main` escolhe a obra e `App` a recebe; `usePlanta`, `kits.ts`, planejador e `CentralKits` ainda importam unidades globais. O SVG anuncia 100 unidades e regras/planejador limitam listas a 100. | Acoplamento de `App` à obra padrão removido. Antes de plantas distintas, fornecer geometria/validação por obra; não criar seletor nesta entrega. |
| Legenda em uso protegida só na interface | `GerenciarLegendas` usa `usoPorLegenda` das abas da obra ativa; `excluirLegendaRemota` chama `deleteDoc` e regras verificam proprietário/perfil. | Pendente de desenho de integridade entre obras e concorrência. Não prometer bloqueio remoto de exclusão em uso. |
| Materiais e marcações sem validação remota completa | Regras exigem `materiais` como lista não vazia e `marcacoes` como mapa, mas não validam cada item, quantidade ou ID de status/unidade. | Limite documentado do contrato existente. Isolamento, setores, versões e vínculos são protegidos remotamente; isso não certifica todo valor operacional. |
| Validações locais adicionais | Duplicidade de nomes/códigos Sienge, última legenda e última aba são controladas pela interface. | Documentado; são contornáveis por chamadas diretas e sujeitos a concorrência entre abas. |
| Leitores normalizam dados | `normalizarMateriais` remove materiais inválidos/IDs repetidos; leitores filtram unidades e marcações. | Corrigido na migração: IDs de materiais repetidos/vazios, tipos, quantidades e textos acima dos limites interrompem o plano. A tolerância dos leitores normais permanece; a migração não é uma auditoria contínua. |
| Limites diferentes de nomes | Mapa manual é limitado/truncado a 48 caracteres no cliente; regras e planejador aceitam 80 para mapas. | Documentado; preservar dados remotos e definir contrato antes de alterar limites. |
| Precedência de vínculos explícitos | Antes, um Kit sem referência podia escolher por nome um mapa explicitamente referenciado por outro. | Corrigido: reserva antecipada de IDs, com regressão nas duas ordens de entrada. Vínculos duplicados continuam gerando erro, sem escolher um vencedor. |
| Migração não é varredura contínua | Obra em schema 1 encerra a execução; documentos introduzidos depois e Kits ocultos por setor não são reavaliados automaticamente. A comparação protege documentos dos grupos, não inserções na coleção inteira. | Operação administrativa deve revisar mudanças de setor/legados; não tratar o marcador como certificação permanente. |
| Criação inicial disputava o mesmo ID | `usePlanta` inicia a criação após snapshot vazio. | Corrigido: `garantirMapaInicial` lê e cria condicionalmente em transação. Teste com duas instâncias Firestore confirma criação e preservação em chamadas posteriores. Outras abas manuais mantêm a escrita usual. |
| Troca de obra exige reset de estado | Estado inicial/preferência de `usePlanta` é inicializado na montagem; `App` usa chave UID/obra/setor. | Preservar a remontagem ao introduzir troca de obra; não reutilizar hooks com dados antigos visíveis. |
| Exclusão de schema futuro | Updates já verificavam versão conhecida; deletes não. | Corrigido: mapas, Kits e legendas exigem schema conhecido também na exclusão. Testes cobrem versões inválidas/futuras, pares com um lado futuro e exclusões permitidas. |
| Documento de obra não é autorização de pertencimento | Regras de mapas não verificam existência do pai. Perfil válido permite criar/atualizar obras próprias. | Documentado; não há membros, lista de obras autorizadas ou compartilhamento. |
| Nomes genéricos e resíduos | `services/firestore.ts` trata só mapas; `storage.ts` mistura preferência/exportação; `types/planta.ts` reúne vários domínios. CSS `.account-type*` permanece sem tela de escolha de setor. | Manter nesta etapa: renomear/remover por estética não traz ganho arquitetural suficiente. |
| Estados e nomenclatura | “Mapa” e “aba” representam o mesmo documento/visualização; `StatusId` é ID de legenda. `STATUSES` não é coleção provisionada automaticamente. `mapa.pdf` é citado num comentário, mas não está no repositório. | Esclarecido; o SVG/TypeScript atual é a fonte da geometria. |
| Indicador “Itens calculados” | `KitUnidadesModal` soma quantidades de materiais diferentes; `MaterialKit` não possui unidade de medida. | Não interpretar esse total como saldo físico ou indicador de estoque; recurso existente preservado. |
| Ambiente de desenvolvimento não é emulador | Configuração do frontend não conecta emuladores; `.firebaserc` e suites fixam `lmcoloredplans`, mas `.env.local` define o projeto do navegador. | README passa a separar execução local, testes e deploy. |
| Dependências não totalmente fixadas no manifesto | React, Vite e TypeScript usam `latest`; Firebase CLI e Java são externos ao projeto. | Usar lockfile com `npm ci` e registrar ferramentas usadas. Não atualizar dependências nesta auditoria. |

Os dois problemas tratados na revisão anterior — importação ignorando versão
explícita e regras aceitando nomes só com espaços — já possuem correções e testes
no workspace. Não foram refeitos nesta entrega documental.

## Caminhos fixos e duplicações intencionais

| Referência | Local e interpretação |
| --- | --- |
| `obra-principal` | Literal executável em `OBRA_LEGADA_ID` de `config/dados.ts` e no fallback de `firestore.rules`. Fixtures agora importam a constante. |
| `OBRA_PADRAO` | Seleção transitória somente em `main`; os serviços não importam a escolha inicial. |
| Fallback do Kit antigo | `lerObraIdDoKit` só aplica `OBRA_LEGADA_ID` ao campo ausente, alinhando a compatibilidade das regras. `null` e identificadores inválidos geram erro. |
| Caminhos da migração | `COLECOES` centraliza os segmentos compartilhados. O executor continua recebendo Firestore para não acoplar testes ao singleton e a `import.meta.env`. |
| Schema 1 no TS e nas regras | Regras são compiladas separadamente; precisam continuar coerentes com `CURRENT_SCHEMA_VERSION`. |
| Nome/unidades em Kit e mapa | Duplicação operacional protegida pelo vínculo, necessária às leituras atuais. |
| Versões remoto/JSON/localStorage | Contratos diferentes, sem obrigação de compartilhar número ou ciclo de migração. |

Na terceira tarefa, o destino implícito dos Kits sem `obraId` e a preferência
local antiga foram vinculados a `OBRA_LEGADA_ID`, separado da escolha inicial.
Mudar a obra inicial não deve alterar essa identidade histórica.
O caminho global `obras/{obraId}` continua sendo fonte histórica, não o modelo
de obra compartilhada em uso.

## Testes, scripts e evidências

| Arquivo ou comando | Cobertura/resultado |
| --- | --- |
| `tests/storage.test.mjs` | Preferências por usuário/obra, CSV com escape/neutralização de fórmulas e JSON com versões. |
| `tests/migracoes.test.mjs` | Planejador, preservação de dados, conflitos, vínculos, schema e isolamento de obra. |
| `tests/firestore.rules.test.mjs` | Regras com usuários fictícios, negação de alteração de perfil, isolamento, nomes, versões e pares Kit/mapa. |
| `tests/migracoes.firestore.test.mjs` | Migração real no emulador, fontes preservadas, reexecução, chamadas simultâneas na mesma instância e comparação dos valores Firestore. |
| `tests/perfis.firestore.test.mjs` | Acrescentada na consolidação de permissões: tentativas diretas de escrita de perfil, lotes/transações, claims, perfis inválidos e revogação administrativa simulada. |
| `tests/dados.firestore.test.mjs` | Inicialização concorrente, preservação de versões futuras, exclusões válidas e retomada após correção administrativa dos materiais. |
| `npm.cmd run typecheck` | Passou em 19/09/2026. |
| `npm.cmd test` | 16 testes passaram em 19/09/2026. |
| `npm.cmd run test:rules` | Quatro arquivos, 18 testes reportados pelo Node, todos passaram em 19/09/2026. |
| `npm.cmd run build` | Passou em 19/09/2026; permanece o aviso de chunk acima de 500 kB. |

Os scripts `dev` e `preview` também estão descritos no README.
Não há testes de componentes/hooks, fluxo real de Authentication ou ponta a ponta.
Os testes de migração simultânea não reproduzem dois navegadores independentes;
o teste de criação inicial usa duas instâncias Firestore distintas.
O teste da comparação detecta alteração de valores sem simular todas as disputas
durante uma migração completa. Não se pode concluir cobertura total da Fundação
apenas porque as suítes atuais passam.

Uma verificação adicional no Edge, com o roteiro local não versionado
`.edge-validation/fundacao.mjs`, passou em 19/09/2026: migração, mapas, marcação
offline/reconexão, renomeação entre páginas, criação/associação de Kit, isolamento
de obra, conta sem perfil e tela móvel. O Firestore foi emulado com regras reais;
o hook de autenticação foi substituído por uma identidade fictícia nesse roteiro.
Isso não valida login com credenciais reais nem configurações de produção.

## Decisão desta entrega

Manter caminhos, interfaces e comportamentos funcionais. README e documentação
separam arquitetura existente, compatibilidade histórica e limites. Foram
implementadas as correções pontuais de migração, inicialização e proteção de
versões descritas acima, com testes direcionados, sem ampliar o produto.

Não implementar dashboards, equipes, histórico completo, relatórios avançados,
novos tipos de Kit, estoque avançado, indicadores, gráficos, notificações ou ERP.
Nenhum deploy, alteração de conta ou migração de produção foi executado.

## Consolidação posterior das permissões

A segunda tarefa preserva a regra de negação de todas as escritas de perfil e o
modelo canônico `PerfilUsuario`/`TipoConta`. Amplia a cobertura de requests diretos
no emulador e documenta o limite entre cliente e provisionamento administrativo.
Detalhes em [Perfis e permissões](permissoes.md). As pendências de domínio da
auditoria acima não são consideradas resolvidas por esses testes de autorização.

## Obra explícita na terceira tarefa

Em 19/09/2026 a obra passou a ser fornecida por `main` a `App`, com o modelo
mínimo existente (`id`, `nome`). A identidade legada foi separada da obra inicial,
sem mover documentos. A [decisão de propriedade](obras.md) registra o inventário
das referências fixas e as condições para compartilhar dados futuramente.
