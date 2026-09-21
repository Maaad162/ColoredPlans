# Fase 4 — Evolução do produto

## Auditoria de entrada

A base 1.5.0 tinha perfil administrativo e isolamento por UID, obra explícita nos serviços,
mas uma única obra escolhida no `main.tsx`. Geometria e validações importavam as 100
unidades fixas. Mapas ficavam em `usuarios/{uid}/obras/{obraId}/mapas`; Kits ficavam
na conta e carregavam obraId. Não existiam catálogo de plantas, templates, cadastro
de equipes, empresa ou membros. Responsável era texto livre no contexto da unidade.

Já existiam categorias operacionais, cálculos teóricos de execução/materiais,
histórico atômico, cache persistente, fila offline, tratamento de erros, regras,
testes de navegador e CI. Foram reutilizados, não reconstruídos. A auditoria inicial
executou `npm run check` antes de editar os arquivos: 26 testes unitários, 29 de
regras/integração, 10 de navegador, typecheck, lint e build passaram.

## Modelo e preservação

```text
Conta autorizada
  Obra selecionada
    Planta selecionada → template geométrico interno
      Mapa selecionado → estados por ID estável de unidade
        Contextos (observação/responsável)
    Equipes → associação operacional ao mapa
    Histórico → obra + planta + mapa + unidades
```

Os caminhos e IDs foram mantidos. `plantaId` é uma associação, não uma duplicação
da geometria. O mesmo template em duas plantas não compartilha estados. IDs dos
mapas continuam únicos dentro da obra. Empresas e colaboração entre contas não
foram inferidas: o mesmo obraId em duas contas não prova identidade física.

O schema remoto permanece 1 por compatibilidade aditiva. Documentos antigos sem
plantaId são lidos na planta original; dados inválidos não ativam fallback. O JSON
exportado passou de 1 para 2 para incluir o contexto e IDs estáveis; a importação
continua aceitando 1 e ausência de versão. Não houve alteração em produção.

O passo de migração 0 → 1 foi preservado. Agora seu documento de obra deve ser
provisionado antes pelo responsável, pois criação de obra pelo cliente é negada.
Os testes de migração provisionam esse documento com versão 0 e verificam que
falhas não o promovem para 1 nem alteram os dados originais. A migração nunca
apaga suas fontes e continua retomável/idempotente.

## Geometria e provisionamento

`PlantaDefinition` descreve dimensões e blocos/unidades retangulares. O validador
confere IDs, labels, coordenadas, unicidade e limites. O template interno original
preserva as coordenadas/IDs e a decoração existente; novas plantas não exigem
edição de JSX. Não há CAD, scripts em definições ou inserção de SVG arbitrário.

Templates pertencem à obra e são administrativos. O provisionador valida JSON,
deriva o índice de IDs usado pelas regras e faz somente criações com precondição
de inexistência. Sem `--aplicar`, não acessa o Firebase. `--adicionar` exige uma
obra existente compatível e preserva seus metadados. Não é um painel administrativo.

## Navegação e indicadores

Seletores compactos escolhem obra/planta; abas escolhem o mapa. Preferências
são locais e escopadas pelo UID. A seleção é reconciliada com os catálogos
autorizados, nunca aceita como permissão. Não foi introduzido roteador ou URL nova;
a URL anterior continua funcionando.

Dashboard deriva contagens de categorias reais e lista serviços separadamente.
Concluídas, andamento, pendentes, bloqueadas e restantes abrem a planta e o filtro.
Kits usam apenas suas unidades aplicáveis, inclusive lista vazia. Não existem
percentuais médios da obra, totais persistidos ou critérios de semáforo.

A continuidade reutiliza as funções puras da Fase 3. Fonte e atualização acompanham
disponibilidades. O dashboard aceita um provider no modelo interno, com informação
manual por padrão. Valores desconhecidos nunca geram déficit ou capacidade fictícios.
SIENGE continua responsável pelos dados corporativos; nenhuma integração foi criada.

Equipes têm somente ID/nome. Atribuição ao mapa usa gravação com histórico no mesmo
lote; a unidade conserva responsável textual e observação. Não há RH, membros,
ranking ou produtividade individual.

## Segurança e confiabilidade

- Perfil permanece imutável no cliente. Setores continuam Apontamento e Estoque.
- Catálogos, templates e equipes são administrativos; obras não podem ser excluídas.
- Novas obras exigem documento autorizado no espaço do UID. O espaço histórico
  original mantém leitura compatível para recuperação de dados antigos.
- Mapas/Kits não podem trocar de planta; unidades precisam pertencer à geometria
  declarada administrativamente. Pares Kit/mapa devem coincidir também em planta.
- Histórico conserva a planta, inclusive depois de excluir o mapa. Contexto e
  evento são atômicos. O payload do contexto inclui somente campos operacionais.
- A validação do histórico direciona apenas para o tipo de evento solicitado,
  reduzindo expressões avaliadas sem retirar verificações.
- Falhas permanecem no controlador da sessão; reabrir o aviso prioriza gravações
  que precisam de nova tentativa. Mensagens não se acumulam visualmente.

## Consultas e desempenho

Na planta: catálogo da conta/obra, geometria selecionada, mapas daquela planta,
legendas e Kits permitidos, contexto do mapa. Na visão geral: consultas só para
seções abertas da obra ativa. Fechar seção ou trocar contexto cancela listeners.
Atualizações apenas de metadados conservam a identidade dos catálogos para não
reiniciar migração/observações. Definições e estados antigos não são apresentados
como se fossem do novo contexto. O controlador continua acompanhando writes reais.

O caminho de compatibilidade da planta original ainda consulta todos os mapas da
obra e Kits do UID para incluir campos ausentes. É um custo do legado documentado;
não foi feita regravação em massa só para eliminar o fallback. A exclusão de legenda
verifica sob demanda o uso em todas as obras. Essa checagem não é uma trava contra
outra sessão que introduza uso simultaneamente.

O bundle principal ainda contém Firebase e mantém o aviso preexistente de chunk
maior que 500 kB. A avaliação de performance não justificou framework de agregação
ou nova estratégia de cache. O limite de geometria é explícito: até 1000 unidades
e 100 blocos por definição.

## Validação

`npm run check` executa typecheck, lint, domínio, regras, navegador e build. Novos
testes cobrem validação de geometria/provisionamento, JSON contextual, resumos
independentes, obras proibidas, templates administrativos, unidades inexistentes,
troca de planta, vínculos Kit/mapa, contexto, equipes e histórico. No navegador,
duas obras e duas plantas compartilham o template com dados distintos; são
verificados dashboard, filtros, troca rápida, reload, layout estreito e Kits.

Os testes usam apenas projetos demo e emuladores. O script de provisionamento é
validado sem aplicação; cadastro real e deploy exigem operação administrativa.
As suítes anteriores permanecem, com fixtures atualizados para o novo requisito
de provisionamento de obras e expectativa de exportação JSON 2.

## Resultado da validação local — versão 1.6.0

O comando completo `npm run check` passou: typecheck, lint, 32 testes unitários,
35 testes de regras/integração, 12 testes de navegador e build. Nenhum teste foi
ignorado. As mensagens de permissão nos cenários negativos são esperadas e não
representam falhas das suítes. As capturas de desktop e celular foram inspecionadas.

Após corrigir o texto acessível da planta para usar as quantidades da geometria
selecionada, o build foi executado novamente. O aviso de bundle acima de 500 kB
permanece explícito; não impede a geração da aplicação. As mudanças desta fase
foram preparadas para a branch `development`; deploy e provisionamento em produção
não fazem parte desta validação.

## Limites mantidos

Não há colaboração entre UIDs, autenticação SIENGE, notificações, previsão,
gráficos históricos, IA, BIM, CAD, aplicativo nativo ou ERP. Templates não têm
editor visual. Obras/planta/equipes e arquivamento são administrativos. Importação
restaura marcações no contexto existente, não configurações administrativas ou
backup corporativo. Esses limites não impedem adicionar novas obras e plantas por
configuração, sem modificar componentes.
