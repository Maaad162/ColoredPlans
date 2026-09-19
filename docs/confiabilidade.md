# Fase 2 — Confiabilidade operacional

Revisão de 19/09/2026. Complementa o registro histórico da Fase 1;
o README descreve a operação atual. A planta continua sendo o centro da experiência.

## Auditoria e decisões

A fundação tinha perfis somente leitura, dados privados por UID, mapas por obra,
Kits associados atomicamente aos mapas, schema 1, migração conservadora 0 → 1 e
testes Node/Firestore. Não tinha lint, CI ou testes de navegador versionados.
O indicador cobria mapas, erros eram tratados de formas diferentes e alguns
leitores filtravam itens inválidos. Não existia histórico operacional.

Foram preservados caminhos, IDs, setores e propriedade dos dados. Não houve
reescrita de geometria, mudança de design global, backend, compartilhamento de
obras ou novos módulos. O runner Node existente foi mantido; Playwright cobre
a interface e seus hooks reais, dispensando um segundo framework unitário.

## Erros e sincronização

`ErroOperacional` representa mensagens deliberadamente públicas; erros externos
são traduzidos por categoria, sem exibir a mensagem técnica original. Logs da
aplicação contêm somente contexto e categoria. Validação de Kits rejeita itens
inválidos/repetidos, sem removê-los silenciosamente. A alteração de legenda fica
bloqueada enquanto seu formulário salva, evitando que a conclusão de uma criação
apague uma edição iniciada antes da confirmação.

Cada sessão/obra tem um controlador de sincronização, com fontes de leitura,
operações pendentes e falhas persistentes. Hooks cancelam listeners ao desmontar;
Promises de gravação continuam acompanhadas quando um modal fecha. Snapshots de
cache não confirmam sucesso; um sucesso antigo não apaga uma falha mais recente.
O indicador tem texto e região acessível, sem depender apenas de cor.

Cache persistente e fila são do SDK Firebase, com suporte a múltiplas abas.
Não foi criada uma segunda fila local. Operações em lote toleram interrupções;
transações de Kits, preparação inicial e migrações precisam do servidor. Não há
garantia de primeiro acesso offline nem de reabertura do site sem rede, pois não
há service worker. Logout não apaga o cache físico; o acesso da interface e das
regras continua restrito ao UID autenticado.

## Histórico e concorrência

`usuarios/{uid}/obras/{obraId}/historico/{eventoId}` guarda schema 1, UID, obra,
mapa, ação, unidades, valores anteriores/novos e `serverTimestamp`. O mapa guarda
`ultimoEventoId`; o lote inclui os dois documentos. Eventos são imutáveis para
clientes, e as regras conferem identidade, obra, versão, horário e a alteração
correspondente. IDs automáticos são gerados uma vez por lote, não por snapshot.

Pinturas em unidades distintas coexistem. Um estado anterior divergente na mesma
unidade rejeita o lote; importação/limpeza compara todas as marcações. A interface
exibe rollback e falha; nova tentativa usa o mapa atualmente observado. Não há
reversão automática: desfazer sem analisar alterações posteriores poderia apagar
trabalho de outra sessão. Exclusões e substituições mantêm confirmação explícita.

Criação manual, renomeação/exclusão de mapas manuais e estados de unidades são
registrados. Importação/limpeza produzem um evento agrupado. Seleção, zoom,
abertura de modal e ações sem mudança não geram eventos. Não se reconstruíram
eventos antigos; inicialização, migração e operações estruturais de Kits não
geram histórico. Pintar o mapa de um Kit gera evento normalmente.

É um histórico operacional do cliente, não uma auditoria inviolável. As regras
anteriores dos mapas permanecem compatíveis; clientes antigos podem escrever sem
evento. Os nomes das legendas são resolvidos na leitura, não preservados como
fotografias históricas de seu texto. Dados anteriores não são apagados ou movidos.

Consulta só quando aberta, com 20 eventos, ordem decrescente e cursores. Há três
índices compostos versionados: obra, mapa e unidade do mapa. O emulador não prova
a disponibilidade dos índices em produção; publique-os e aguarde a criação antes
de entregar a funcionalidade. Não há leitura de toda a coleção nem listener de
histórico enquanto o modal está fechado. Cada ação registrada adiciona uma escrita
de evento e as leituras de regras necessárias; importações não multiplicam eventos
por unidade. Não há política automática de retenção/exclusão nesta fase.

## Matriz de validação

| Camada | Cobertura |
| --- | --- |
| Node sem emulador | Migração/idempotência/preservação, JSON/CSV, preferências UID/obra, validações, erros, metadados e concorrência de confirmações. |
| Firestore Emulator | Perfis imutáveis, ambos os setores, acesso negado/permitido, isolamento, par Kit/mapa, migração real, inicialização concorrente, versões futuras, lote com histórico, conflitos e eventos forjados. |
| Playwright + Auth/Firestore | Login e conta sem perfil, planta, pintura e reload, offline/reconexão, falha e retry, mapas CRUD/troca, legendas CRUD/cor/fallback, Kits e vínculos, importação/exportação, paginação do histórico. |
| TypeScript/ESLint | Tipos, imports, variáveis sem uso, Hooks e promises; sem regras estéticas extensas ou exclusão de testes. |

Os testes de navegador usam login real do Auth Emulator e serviços reais.
`disableNetwork`/`enableNetwork` exercitam a fila e os metadados do SDK; não são
mocks de sucesso. Não equivalem a testar todas as interrupções de rede do sistema
operacional. Integração testa concorrência de gravações; a suíte não pretende
certificar toda combinação de abas, navegadores e dispositivos físicos.

`npm run check` executa todas as camadas e build em sequência. Testes limpam o
projeto `demo-coloredplans` nos emuladores; não reutilize essa instância para dados
manuais importantes. Java 21 e navegador Playwright são necessários.

## CI e entrega

GitHub Actions usa Node 24, Java 21, `npm ci`, Chromium e `npm run check` em PRs
e pushes main/development. Não há deploy automático. A execução remota depende
de enviar o workflow ao GitHub; validação local não comprova uma execução remota.

A versão remota continua 1. A coleção de eventos e os metadados do mapa são
adições; a migração 0 → 1 foi preservada e continua testada. Entregar frontend,
regras e índices juntos. Provisionamento administrativo e bloqueio do cadastro
público do Authentication permanecem separados do deploy.

Ficam fora desta fase: histórico de materiais/vínculos de Kits, auditoria de
servidor, compartilhamento de obras, desfazer concorrente e offline avançado.

## Resultado da validação local

Em 19/09/2026, `npm run check` concluiu com código 0 no Windows, Node 24,
Java 21 e Edge via Playwright (`PLAYWRIGHT_CHANNEL=msedge`):

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou. |
| `npm run lint` | Passou, sem warnings do ESLint. |
| `npm test` | 23 testes passaram, nenhum ignorado. |
| `npm run test:rules` | 25 testes passaram, nenhum ignorado. |
| `npm run test:ui` | 8 testes passaram, nenhuma repetição automática. |
| `npm run build` | Passou. |

O build informa chunk da aplicação de 712,40 kB minificado (207,82 kB gzip),
acima do aviso padrão de 500 kB. O limite não foi elevado para esconder o aviso;
uma divisão adicional do bundle fica para uma tarefa de performance específica.

`npm audit --omit=dev` não encontrou vulnerabilidades. A auditoria completa
identificou sete alertas moderados em dependências transitivas das ferramentas
de desenvolvimento/Firebase CLI. Não se aplicou downgrade incompatível sugerido
por `audit fix --force`; acompanhar atualizações compatíveis dessas ferramentas.
Não houve deploy nem execução remota do workflow nesta validação.
