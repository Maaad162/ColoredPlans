# Fase 1: decisões e auditoria

O inventário verificado em 18/09/2026 e as pendências da implementação estão na
[auditoria da arquitetura atual](auditoria-arquitetura.md). Este documento
preserva o registro das decisões anteriores, sem substituir a leitura do código.
O contrato de perfil e as regressões da segunda tarefa estão em
[Perfis e permissões](permissoes.md).
A entidade obra e a decisão de manter o armazenamento privado nesta fase estão
em [Obras e propriedade dos dados](obras.md).
O versionamento e as correções de integridade foram consolidados em 19/09/2026,
conforme a seção de revisão abaixo e o README.

## Situação histórica registrada antes da fundação

Os itens abaixo descrevem o diagnóstico registrado anteriormente, não o código
atual. Esta revisão não reexecutou a aplicação histórica para confirmar cada item.

- Frontend React com hooks separados para autenticação, perfil, mapas, Kits e legendas.
- Login por e-mail/senha, sem formulário público de cadastro, mas perfil criado pelo
  próprio usuário no primeiro acesso. As regras permitiam escolher qualquer um dos
  dois setores nesse momento e editar outros campos do perfil depois.
- Mapas privados em `usuarios/{uid}/obras/obra-principal/mapas`; Kits e legendas
  diretamente no usuário. Kits e regras assumiam implicitamente a obra principal.
- Migração de mapas globais com sobrescrita do destino e exclusão da origem.
  A migração Kit/mapa usava heurísticas e podia converter mapas órfãos em manuais.
- Migração de Kits disparada por dois hooks e sem marcador de conclusão.
- `EstadoMapas.version = 3` não representava um schema remoto e não era persistido.
- Preferência da aba ativa isolada por usuário, mas não por obra.
- README com referências antigas a mapas compartilhados, migração de localStorage
  e provisionamento de contas incompleto.

## Decisões

1. Perfil é autoridade de permissão administrada fora do cliente. As regras negam
   todas as escritas de cliente e recursos operacionais exigem perfil válido.
   As contas antigas continuam legíveis; é necessária uma revisão administrativa
   dos setores que antes podiam ser escolhidos no primeiro acesso.
2. Preservar o espaço privado do usuário. Mover tudo para `obras/{id}` agora
   criaria compartilhamento sem modelo de membros ou resolução de conflitos.
   Mapas pertencem conceitualmente à execução da obra, mas a propriedade física
   atual não foi alterada.
3. A obra é explícita e parametriza mapas, Kits e preferência local. Não existe
   permissão diferente por obra; o usuário autorizado acessa suas próprias obras.
4. Kits mantêm o caminho atual e recebem `obraId` obrigatório nas gravações.
   Regras validam ambos os lados do vínculo na mesma obra. Essa escolha evita
   copiar/mover todos os Kits e permite uma migração aditiva.
5. Legendas continuam no usuário e são comuns às suas obras. Uma futura interface
   de múltiplas obras deverá considerar o uso de legendas em todas elas antes de
   permitir exclusão. Hoje só a obra padrão é exposta na interface.
6. Schema remoto 1, legado sem versão 0. A versão do arquivo JSON é independente.
   O `version` não persistido do estado React foi removido.
7. A migração valida entrada e saída simulada antes de gravar. Isso não equivale
   a validar todo o domínio; as lacunas atuais estão na auditoria. Cópias conservam campos extras;
   alterações usam merge e não regravam marcações. Grupos Kit/mapa são atômicos,
   com detecção de alteração concorrente. A origem global nunca é apagada.
8. A tela de conta aguardando liberação substitui a escolha de setor. A planta e
   os recursos operacionais atuais são preservados; esta revisão documental não
   altera telas ou acrescenta módulos.

## Migração e operação

`src/services/migracoes.ts` recebe a instância Firestore para permitir testes reais
no emulador. Chamadas simultâneas na mesma instância são reunidas. A versão da obra
dispensa varreduras após a conclusão. Alterações concorrentes nos documentos
revalidados pelos grupos interrompem a tentativa. Não há bloqueio da coleção
inteira nem detecção automática de documentos inseridos depois do marcador.

Documentos com versões futuras, nomes ambíguos, campos inválidos ou vínculos
inconsistentes precisam de revisão administrativa. A migração não escolhe qual
documento apagar. O administrador deve revisar a origem e o destino com backup,
corrigir a inconsistência e reabrir a aplicação. Não marcar a obra como versão 1
manualmente para ocultar uma falha de migração.

O cache local permanece disponível durante a preparação. Transações não são
enfileiradas offline. Isso preserva o limite do mecanismo já usado pelos Kits.

## Revisão de consistência

A leitura do importador identificou que a versão declarada no JSON era ignorada.
Agora versões explícitas diferentes de 1 são rejeitadas antes da substituição das
marcações; arquivos antigos sem versão permanecem aceitos. Testes cobrem os dois casos.

As regras aceitavam nomes compostos apenas por espaços, embora a interface os
rejeitasse. A validação compartilhada de nomes agora verifica o texto após `trim`,
com cobertura no emulador para mapas, obras, legendas e o par Kit/mapa.

A consolidação do schema mantém a primeira versão explícita em 1. O planejador
reserva os vínculos explícitos antes de buscar mapas pelo nome, rejeita materiais
que seriam descartados/truncados pelo leitor e revalida o estado final simulado.
O executor valida o nome da obra antes de gravar grupos. Os nomes de collections
estão centralizados em `COLECOES`; `lerObraIdDoKit` só aplica o fallback histórico
quando o campo está ausente, rejeitando `null` e identificadores inválidos.

As regras passaram a negar também exclusões de versões desconhecidas. A criação
do mapa inicial usa uma transação condicional: duas instâncias não sobrescrevem
o mesmo documento. Marcações e criação de outras abas continuam usando as
gravações anteriores do SDK, preservando seu comportamento offline.

Erros da migração chegam ao aviso existente de sincronização e ao console. Não
há descarte automático ou log remoto novo. Testes verificam que uma entrada
inválida não grava o marcador e que, corrigida administrativamente, permite
retomar a preparação preservando marcações, materiais e campos adicionais.

## Limites de entrega

Regras Firestore não bloqueiam a criação de identidades no Authentication. O
script `scripts/auth-fechado.ps1` verifica ou aplica `disabledUserSignup` com IAM
administrativo. Essa configuração precisa ser confirmada no projeto publicado;
o teste de regras não substitui essa verificação. O script e o deploy não são
executados automaticamente.

Os testes rodam em dados fictícios do emulador. Esta fase não inspeciona documentos
de produção e, portanto, não afirma que todos os legados reais estejam livres de
ambiguidade. As validações produzem erros explícitos caso encontrem essas situações.

A geometria continua única. Seletor de obras, plantas diferentes por obra,
compartilhamento, membros e migração para propriedade comum pertencem a uma futura
decisão de produto. Nenhum desses módulos foi iniciado.
