# Fase 1: decisões e auditoria

## Situação encontrada

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
7. A migração valida todo o plano antes de gravar. Cópias conservam campos extras;
   alterações usam merge e não regravam marcações. Grupos Kit/mapa são atômicos,
   com detecção de alteração concorrente. A origem global nunca é apagada.
8. A única mudança de tela da fase é a substituição da escolha de setor pelo aviso
   de conta aguardando liberação; a planta e os recursos anteriores são mantidos.

## Migração e operação

`src/services/migracoes.ts` recebe a instância Firestore para permitir testes reais
no emulador. Chamadas simultâneas na mesma instância são reunidas. A versão da obra
dispensa varreduras após a conclusão. Em outra sessão, alterações concorrentes
interrompem a tentativa em vez de sobrescrever o que foi modificado.

Documentos com versões futuras, nomes ambíguos, campos inválidos ou vínculos
inconsistentes precisam de revisão administrativa. A migração não escolhe qual
documento apagar. O administrador deve revisar a origem e o destino com backup,
corrigir a inconsistência e reabrir a aplicação. Não marcar a obra como versão 1
manualmente para ocultar uma falha de migração.

O cache local permanece disponível durante a preparação. Transações não são
enfileiradas offline. Isso preserva o limite do mecanismo já usado pelos Kits.

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
