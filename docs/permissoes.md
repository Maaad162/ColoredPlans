# Perfis e permissões — Fase 1

## Modelo e autoridade

O modelo único da aplicação é `PerfilUsuario` em
[`src/types/planta.ts`](../src/types/planta.ts). `TipoConta` representa apenas
`apontamento` e `estoque`; `tipoContaValido` valida esses dois valores na leitura.

| Campo | Contrato |
| --- | --- |
| `userId` | UID do Authentication, igual ao ID de `usuarios/{uid}`. |
| `tipoConta` | Setor provisionado administrativamente; única fonte de autorização por setor. |
| `schemaVersion` | Versão do perfil; ausência é lida como 0 para compatibilidade e 1 é a versão atual. |
| `email` | Informação de identificação; não concede permissão. |
| `criadoEm` | Timestamp remoto convertido para string ISO na interface. |

Perfis antigos podem não ter e-mail/data: o serviço mantém os fallbacks existentes.
UID, setor e versão são conferidos para aceitar o perfil. Não foi acrescentado
papel `admin`, modelo alternativo de setor ou migração de documentos nesta tarefa.

O tipo TypeScript descreve os dados, mas não impede alterações feitas por DevTools.
A proteção efetiva está em [`firestore.rules`](../firestore.rules):

```text
match /usuarios/{userId} {
  allow read: if eProprioUsuario(userId);
  allow write: if false;
}
```

Nenhuma outra regra autoriza gravação nesse documento. As regras das subcoleções
permitem operações específicas em mapas, obras e legendas, e não se aplicam ao
documento pai do perfil. Nem Estoque possui permissão para escrever perfis.
Mesmo uma alteração sem mudança de setor, ou uma gravação idêntica, é negada.

## Auditoria dos caminhos de criação e alteração

| Caminho | Resultado verificado no código |
| --- | --- |
| `AuthScreen` / `useAuth` | Login, observação de sessão e logout; não criam conta ou perfil. |
| `services/perfil.ts` | Apenas `onSnapshot` e conversão/validação de leitura. Não expõe criar, salvar ou editar perfil. |
| `usePerfil` / `App` | Perfil ausente/inválido mostra conta aguardando liberação; erro elimina o perfil do estado. Mudança de setor recebido remonta a aplicação operacional. |
| Serviços operacionais e migração | Escrevem nas subcoleções do usuário; não escrevem em `usuarios/{uid}`. |
| Chamadas diretas pelo SDK ou requests autenticados do usuário | Sujeitas às regras; `create`, `update`, `delete`, substituição e merge do perfil são negados. |
| Lotes/transações | Não concedem exceção: uma escrita negada do perfil impede a operação atômica. |
| Campos `role`, `admin`, `tipoConta` em outros documentos | Não são consultados para autorizar o usuário. |
| Claims no token de usuário | Não substituem o setor do perfil nem concedem permissão de escrita de perfil. |
| Console/Admin SDK autorizado por IAM | Via administrativa de provisionamento. Não é acesso de usuário final e não depende de liberar escrita nas regras do cliente. |
| `scripts/auth-fechado.ps1` | Atua no bloqueio do cadastro do Authentication; não cria/altera documentos de perfil. |

Alterar o JavaScript ou o estado React pode modificar a tela local, mas não muda
o perfil remoto nem autoriza operações de Estoque. As regras leem o perfil
persistido em `usuarios/{request.auth.uid}`; não aceitam um setor enviado no
corpo de um mapa, Kit ou request como autoridade.

## Provisionamento e evolução

O responsável cria a identidade no Authentication e grava o perfil com setor
definido antes de entregar a conta. O passo a passo e os campos estão no
[README](../README.md#provisionar-uma-conta). O usuário final não tem formulário
de criação, escolha de setor ou gestão de permissões.

Um painel técnico futuro poderá reutilizar esse documento e modelo, chamando
uma camada administrativa com autorização própria e IAM. Não será necessário
mover os perfis apenas para introduzir esse painel. Isso não implica que sua
autenticação, backend ou gestão de administradores já estejam implementados.
Não expor credenciais administrativas no frontend nem abrir escrita no perfil
para implementar a futura tela.

## Regressões executadas diretamente no emulador

Em 18/09/2026 passaram o typecheck, os 12 testes unitários e os três arquivos de
integração. A suíte de perfis contém nove cenários nomeados, com múltiplas
tentativas de escrita em cada cenário aplicável.

[`tests/perfis.firestore.test.mjs`](../tests/perfis.firestore.test.mjs) usa clientes
autenticados fictícios sem passar por componentes React. Integra `npm.cmd run
test:rules`, junto das suítes existentes, com execução sequencial.

- Apontamento e Estoque: update, substituição, merge, `mergeFields`, remoção de
  campo, exclusão, mudança de UID/e-mail/versão e introdução de campos de privilégio
  são negados. O documento é relido do servidor para confirmar preservação.
- Usuário sem perfil: não consegue se provisionar em nenhum dos setores, criar
  mapas/obras/legendas/Kits ou acessar a obra.
- Outro usuário e sessão anônima: não conseguem ler/alterar o perfil alvo ou
  listar a coleção de usuários.
- Lote/transação com promoção e gravação operacional: rejeitados sem alterações
  parciais. Também é negado promover o perfil e criar um par Kit/mapa no mesmo lote.
- Claims privilegiados simulados e campos em mapas: não liberam perfil ou Kits.
- Perfil inválido (setor, UID ou versão): não libera operações e não pode ser
  reparado pelo próprio usuário. Perfil legado sem versão permanece compatível,
  mas não pode ser atualizado pelo cliente.
- Alteração administrativa simulada de Estoque para Apontamento: a mesma sessão
  perde acesso ao Kit e escrita em seu mapa, mantendo edição de mapas manuais.
  Remoção administrativa do perfil nega acesso operacional subsequente.
- Controles positivos: perfis válidos leem o próprio documento, ambos os setores
  editam mapas manuais e Estoque cria/lê um par Kit/mapa válido.

O provisionamento nas fixtures usa `withSecurityRulesDisabled`, exclusivo do
ambiente de teste. Isso simula a preparação administrativa; não testa permissões
IAM nem um backend administrativo. O emulador verifica a autorização dos requests,
não a limpeza de dados já presentes no cache do navegador após revogação.

Esta garantia foi verificada para as regras do repositório no emulador. A tarefa
não publica regras nem verifica quais regras estão implantadas em produção.
O bloqueio de cadastro no Authentication também permanece uma configuração
administrativa separada. Não houve criação de painel, alteração de conta real
ou deploy.
