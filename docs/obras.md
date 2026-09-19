# Obra como entidade e propriedade dos dados

Decisão da terceira tarefa da Fase 1, em 19/09/2026.

## Conceito e modelo mínimo

**Os mapas pertencem conceitualmente à obra:** representam a execução de um
serviço sobre suas unidades. O usuário identifica quem acessa os dados e, na
implementação atual, delimita seu espaço privado de armazenamento.

O modelo canônico permanece `Obra`, em
[`src/types/planta.ts`](../src/types/planta.ts), com somente `id` e `nome`.
Não existe comportamento de arquivamento, portanto não foi acrescentado `status`.
`MapaServico` e `Kit` já possuem `obraId`; não foi criado um segundo modelo de obra.

A entidade possui documento em `usuarios/{uid}/obras/{obraId}`, com `userId`,
`nome`, `schemaVersion` e `atualizadoEm`. A preparação/migração cria esse documento
quando necessário e preserva seu nome já cadastrado. O objeto usado pelo cliente
identifica o escopo ativo; não é um cadastro completo nem um seletor de obras.

## Inventário da obra fixa

Antes desta tarefa, o literal `obra-principal` aparecia no código executável em:

| Local | Ocorrências e finalidade |
| --- | --- |
| `src/config/dados.ts` | Uma declaração de `OBRA_PADRAO_ID`. |
| `firestore.rules` | Um fallback em `obraDoKit` para Kits sem `obraId`. |
| `tests/firestore.rules.test.mjs` | Três caminhos da fonte global legada: fixture e leituras por dois usuários. |

Os demais usos na aplicação eram indiretos por constantes: `App` usava
`OBRA_PADRAO` na chave React, em `usePlanta` e na Central de Kits;
`services/kits.ts` usava `OBRA_PADRAO_ID` na leitura e nas três operações
transacionais; planejador e storage também usavam essa constante para legado.
Testes de migração, regras, perfis e storage importavam as constantes.

As menções textuais adicionais estavam no registro histórico de
`docs/fundacao.md` e na auditoria `docs/auditoria-arquitetura.md`. Esta decisão
mantém essas referências explicativas. Logs, dependências e bundles gerados
não são fonte da configuração da obra.

Após a alteração, o literal executável permanece somente em dois lugares:

- `OBRA_LEGADA_ID` em `src/config/dados.ts`: identidade histórica estável.
- `obraDoKit` nas regras: a mesma identidade para compatibilidade remota.

As regras têm compilação própria. O valor não foi removido com uma geração de
arquivos adicional; seu vínculo com a constante está comentado e é exercitado
pela migração de Kits sem `obraId` nos testes do emulador. Os três caminhos
literais dos testes foram substituídos pela constante legada.

## Obra inicial e compatibilidade histórica

`OBRA_PADRAO_ID`/`OBRA_PADRAO` representam a escolha temporária da inicialização.
Atualmente o ID padrão é igual ao legado, preservando o comportamento existente.
Os serviços não consultam essa escolha: recebem `obraId` ou `Obra`.

`OBRA_LEGADA_ID` é usado somente quando necessário interpretar dados antigos.
Não deve acompanhar uma futura troca de obra inicial. Essa separação impede que
um Kit sem `obraId`, ou a chave de aba ativa anterior ao escopo por obra, passe a
pertencer a outra obra por uma alteração de configuração.

Os testes de legado também usam a identidade histórica, sem depender da obra
que vier a ser escolhida na inicialização. O sufixo `v3` da chave local foi mantido
para preservar a preferência já armazenada.

## Passagem do escopo pela aplicação

```text
main.tsx: escolha transitória de OBRA_PADRAO
  -> App({ obra })
      -> ContaAutenticada({ usuario, obra })
          -> AplicacaoMapas({ usuario, perfil, obra })
              -> usePlanta(usuarioId, obra, legendas, habilitarKits)
                  -> serviços de mapas e migrarObra(..., obra, ...)
              -> CentralKits({ usuarioId, obraId: obra.id })
                  -> useKits(usuarioId, obraId, habilitado)
                      -> serviços de Kits
```

As chaves React usam UID/obra e, na área operacional, também o setor. Uma troca
do parâmetro de obra remonta o estado dependente do escopo, evitando reaproveitar
abas, seleção e preferências de outra obra. Não foi criada interface de seleção.

O nome completo da obra só é passado onde possui uso: `usePlanta` o entrega à
preparação do documento da obra. A Central de Kits precisa apenas de `obraId`.
Perfil, autenticação e legendas continuam por usuário. `kitsCollection(uid)` não
recebe um parâmetro que não mudaria seu caminho; quem observa ou altera Kits
recebe e verifica a obra explicitamente.

## Estrutura física preservada

| Entidade | Caminho atual |
| --- | --- |
| Perfil | `usuarios/{uid}` |
| Obra | `usuarios/{uid}/obras/{obraId}` |
| Mapas | `usuarios/{uid}/obras/{obraId}/mapas/{mapaId}` |
| Kits | `usuarios/{uid}/kits/{kitId}`, com campo `obraId` |
| Legendas | `usuarios/{uid}/legendas/{legendaId}` |
| Fonte global histórica | `obras/{obraId}/mapas/{mapaId}`, somente leitura de cliente |

Não houve migração estrutural nova nem aumento da versão do schema nesta tarefa.
A migração 0 → 1 existente continua ativa, preserva suas fontes e recebe uma obra
explícita. Os documentos de uma obra não são movidos ao escolher outra.

## Decisão: adiar o compartilhamento físico

Migrar agora para `obras/{obraId}/mapas` e `obras/{obraId}/kits` não é seguro nem
necessário para tornar a obra explícita no código. Dependências verificadas:

| Dependência | Risco da mudança direta |
| --- | --- |
| Regras conferem UID do caminho e `userId` | Retirar o usuário do caminho exige outra autoridade de acesso; hoje não há membros de obra. |
| Mesmo `obra-principal` em diferentes contas | O ID padrão não prova identidade da obra física. Unificar por ele poderia misturar obras diferentes. |
| IDs de mapas e marcações privados | Documentos com mesmo ID podem conter informações divergentes. Não há política de precedência ou fusão. |
| Legendas por usuário | Mesmo ID pode ter nome/cor diferentes; mover só as marcações pode mudar seu significado visual. |
| Pares Kit/mapa | `mapaId`, `kitId`, nome, unidades e `obraId` precisam ser remapeados juntos, mantendo consistência atômica. |
| Caminho global já contém legado | O destino conceitual futuro pode estar ocupado por fontes históricas; não pode ser tratado como vazio. |
| Cache persistente e clientes antigos | Escritas pendentes e versões antigas podem continuar tentando usar a estrutura anterior. |
| Migração e schema | O marcador atual atesta apenas a preparação 0 → 1 daquela obra privada, não uma migração de propriedade. |

Nesta fase permanecem válidas as garantias atuais: perfil administrado,
isolamento por usuário, mapas separados por obra e vínculo Kit/mapa dentro do
mesmo usuário/obra. Não foram criados membros, colaboração ou estoque compartilhado.

## Requisitos de uma migração futura

Antes de implementar o modelo compartilhado será necessário:

1. Definir identidade real de cada obra e seus participantes autorizados, sem
   inferir associação pelo ID padrão ou pelo nome.
2. Inventariar e fazer backup dos mapas, Kits e legendas dos usuários e das fontes
   globais, identificando colisões e significado dos status.
3. Definir regras de leitura/escrita da obra e a política de resolução de conflitos.
4. Planejar cópias versionadas e retomáveis com rastreabilidade de origem e mapa
   de IDs; validar pares Kit/mapa e legendas antes da troca de leitores.
5. Tratar clientes antigos e gravações offline durante a transição, testar a
   migração no emulador e conferir o destino antes de qualquer retirada de fontes.

São condições para uma decisão futura, não módulos adicionados nesta fase.
A centralização de caminhos, a entidade `Obra` e os parâmetros explícitos
reduzem o acoplamento da interface à obra inicial, mas não eliminam a necessidade
de um plano de migração e de regras novas quando houver compartilhamento.

## Limites e validação

Planta e unidades continuam únicas; não foram implementadas geometrias diferentes
por obra. A exclusão de legendas ainda depende dos mapas carregados, e a consulta
de Kits lê os do usuário antes de filtrar por obra. Essas limitações estão na
[auditoria geral](auditoria-arquitetura.md).

Os testes cobrem preferências por UID/obra, fallback histórico, planejamento de
Kits por obra e migração de duas obras com os mesmos IDs de mapas e marcações
diferentes. A migração da segunda obra deve preservar o nome/metadados já
cadastrados, o par Kit/mapa da primeira e as duas fontes globais. As regras
existentes exercitam isolamento de usuários/obras e rejeição de vínculos cruzados.

Em 19/09/2026 passaram o typecheck, os 13 testes unitários, os três arquivos de
integração no emulador e o build. O aviso já existente de bundle acima de 500 kB
permanece. Não foi introduzida uma suíte de interface nesta tarefa.

Nenhum documento real foi consultado, movido ou excluído. Não houve deploy.
