# Fase 3 — Operação da obra

Implementada sobre a versão 1.5.0. O código é a fonte de verdade; este documento
registra as decisões que não ficam evidentes na interface.

O inventário confirmou que `quantidadePorKit` já significava quantidade necessária
para uma unidade e que `MaterialKit.id` já era uma identidade interna. Foram
preservados. `codigoSienge` passou a ser opcional e continua string. Acrescentaram-se
unidade de medida e disponibilidade manual opcional. O ColoredPlans não consulta,
escreve ou simula o SIENGE.

`unidadeIds` do Kit passa a expressar onde a composição e o serviço se aplicam.
O vínculo bidirecional Kit/mapa existente continua atômico. Um mapa de Kit sem
seleção usa temporariamente toda a planta para não esconder o resumo de documentos
antigos; a Central permite tornar a aplicabilidade explícita.

As categorias operacionais das legendas separam regra de negócio e cor. A função
de compatibilidade classifica IDs/nomes antigos conhecidos; valores não reconhecidos
ficam em “outro”, sem serem contados como concluídos. Ao editar, a interface exige
que o usuário escolha a semântica real.

Observação e responsável são um documento pequeno por mapa/unidade. A escolha
evita regravar o mapa inteiro, mantém o contexto no serviço atual e permite
listener somente para a unidade selecionada. Um lote cria/atualiza o contexto e
cria um evento imutável. As regras vinculam os dois por `ultimoEventoId`.

O schema continua 1 porque todos os campos têm fallback e o novo documento nasce
na versão atual. Não há migração nem alteração dos documentos existentes. Uma
mudança incompatível futura deverá criar o passo 1 → 2.

Fora do escopo: integração SIENGE, importação CSV/XLSX de saldos, compras,
movimentações, cadastro de equipes, chat, anexos, indicadores globais e Fase 4.
