# Contas locais para testar a hierarquia

Entrega da versão **1.7.0**: níveis hierárquicos, colaboração no mesmo espaço, proteção dos mapas/Kits dos Técnicos e provisionamento local idempotente. Validação local: typecheck, lint, 47 testes unitários, 52 testes de Rules, 31 testes de navegador e build aprovados.

Este documento e as credenciais abaixo são exclusivos de desenvolvimento. **NÃO É CREDENCIAL DE PRODUÇÃO.** O seed não aceita projetos reais nem hosts remotos. Nenhum usuário real, documento de produção ou autenticação de produção é alterado.

## Iniciar e entrar

Com as dependências instaladas e o Java exigido pelos emuladores disponível:

```sh
npm run dev:test-users
```

No PowerShell, se a política bloquear `npm.ps1`, use `npm.cmd run dev:test-users`; não é necessário alterar a política de execução.

Abra `http://127.0.0.1:5173`. O comando inicia os emuladores Auth/Firestore com as Rules do projeto, cria as contas e executa o Vite apontado exclusivamente para `demo-coloredplans`. Não modifica `.env.local`. Use o formulário normal de e-mail e senha; não existem botões especiais de login.

Senha comum de **TESTE LOCAL**: `ColoredPlans@Teste2026`.

| Nível | Valor interno | E-mail | Setor (`tipoConta`) |
| --- | --- | --- | --- |
| Técnico | `tecnico` | `tecnico.teste@coloredplans.local` | `apontamento` |
| Técnico de estoque | `tecnico` | `tecnico.estoque.teste@coloredplans.local` | `estoque` |
| Engenheiro | `engenheiro` | `engenheiro.teste@coloredplans.local` | `apontamento` |
| Coordenador | `coordenador` | `coordenador.teste@coloredplans.local` | `apontamento` |
| Gestor | `gestor` | `gestor.teste@coloredplans.local` | `apontamento` |
| DEV | `dev` | `dev.teste@coloredplans.local` | `estoque` |
| Engenheiro de estoque (adicional) | `engenheiro` | `engenheiro.estoque.teste@coloredplans.local` | `estoque` |
| Conta pendente | sem perfil | `pendente.teste@coloredplans.local` | nenhum |

`nivel` representa a hierarquia; `tipoConta` continua representando o setor. Os Técnicos de Apontamento e Estoque têm o mesmo Engenheiro como superior. O Técnico Estoque gerencia Kits; o Técnico Apontamento não. Engenheiro e Coordenador gerenciam Kits independentemente do setor. O Engenheiro acompanha simultaneamente os mapas dos dois tipos de Técnico nas obras atribuídas, sem trocar de conta ou setor.

Encerre com Ctrl+C e aguarde o Firebase exportar os dados para `.firebase/test-users/`, ignorado pelo Git. A próxima inicialização importa esse estado. Não execute `check`, `test:ui` ou `test:rules` enquanto este ambiente manual estiver aberto: essas suítes usam as mesmas portas e seus próprios dados descartáveis.

## Seed com emuladores já abertos

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:GCLOUD_PROJECT = 'demo-coloredplans'
npm run seed:test-users
```

O script `scripts/seed-test-users.mjs` exige os dois hosts locais e fixa o projeto `demo-coloredplans`. Variáveis de projeto que apontem a outro destino abortam antes de qualquer chamada de rede. Não há opção para desabilitar a proteção, usar credenciais de produção ou resetar dados.

Reexecutar recupera a senha de teste e as atribuições dos perfis reservados, sem duplicar contas. Após reexecutar, entre novamente se a sessão precisar ser renovada. Mapas, marcações, contextos, histórico, Kits, nomes e legendas existentes são preservados. Documentos de exemplo só são criados quando não existem. Colisões de UID/e-mail abortam sem substituir identidades. A conta pendente é criada apenas no Auth; se alguém a provisionar, o seed pede revisão manual, sem apagar seu perfil.

## Obra e relações

- Nome: **Jardim das Tulipas I**.
- ID histórico preservado: **`obra-principal`**.
- Espaço local compartilhado: **`teste-dev`**.
- Documento: `usuarios/teste-dev/obras/obra-principal`.
- Todas as sete contas provisionadas acessam esta mesma obra; não são criadas cópias por usuário.
- O cenário local contém uma planta `planta-principal` usando `original-v1`, o mapa `mapa-teste` / “Pintura de teste”, do Técnico Apontamento, e `mapa-teste-estoque` / “Estoque de teste”, do Técnico Estoque. Usa apenas dados mínimos de exemplo, sem copiar a base real. Reexecutar o seed não altera autoria nem dados de mapas já existentes.
- A obra adicional `obra-teste-b` existe somente no emulador. Técnico, Engenheiros e Coordenador não a recebem. Gestor e DEV podem acessá-la pelo escopo de todas as obras do seu espaço.

Relações `superiorId`: `teste-dev` → `teste-gestor` → `teste-coordenador` → `teste-engenheiro` → (`teste-tecnico`, `teste-tecnico-estoque`). O Engenheiro de estoque adicional também aponta ao Coordenador; sua conta anterior foi preservada, mas não é necessária para acompanhar Estoque. DEV tem `superiorId: null`. Esta relação valida os níveis adjacentes; **não herda obras automaticamente**. Técnicos, Engenheiros e Coordenador recebem `obraIds: ['obra-principal', 'lirios-do-vale-ii']`. Gestor e DEV abrangem todas as obras do mesmo espaço, nunca de outro espaço.

## Documentos e compatibilidade

Cada conta tem UID fixo no Authentication e, exceto a pendente, perfil em `usuarios/{uid}` com `schemaVersion: 2`, `userId`, `email`, `tipoConta`, `criadoEm`, `nivel`, `espacoId`, `superiorId` e `obraIds`. Senhas nunca são gravadas no Firestore.

Os dados operacionais continuam em `usuarios/{espacoId}/obras/{obraId}`, com o `userId` estrutural igual ao espaço. Os registros de autoria usam o UID de quem realizou a ação. As legendas e os Kits continuam nas subcoleções do espaço. O schema operacional permanece em versão 1; somente o perfil hierárquico usa a versão 2.

Perfis legados permanecem compatíveis e não são migrados automaticamente. A adoção em dados existentes usa o script administrativo abaixo, sem renomear IDs, mover mapas ou copiar dados.

## Matriz de permissões implementada

| Ação | Técnico | Engenheiro | Coordenador | Gestor | DEV |
| --- | --- | --- | --- | --- | --- |
| Ver obra atribuída, planta, mapas, contexto e histórico | Sim | Sim | Sim | Sim | Sim |
| Ver obra não atribuída do mesmo espaço | Não | Não | Não | Sim | Sim |
| Ver obra de outro espaço | Não | Não | Não | Não | Não |
| Alterar marcações e contexto das unidades | Sim | Não | Não | Não | Sim |
| Criar, renomear e excluir mapas manuais | Sim | Somente os próprios | Não | Não | Sim |
| Consultar resumo/dashboard da obra acessível | Sim | Sim | Sim | Sim | Sim |
| Consultar informações de materiais ligadas aos mapas acessíveis | Sim | Sim | Sim | Sim | Sim |
| Gerenciar Kits | Só setor `estoque` | Sim, somente os próprios | Sim | Não | Só setor `estoque` |
| Gerenciar legendas compartilhadas | Não | Não | Não | Não | Sim |
| Administrar perfis já provisionados no mesmo espaço | Não | Não | Não | Não | Sim, com restrições |
| Alterar o próprio nível ou administrar outro DEV | Não | Não | Não | Não | Não |
| Criar conta Authentication pela interface | Não | Não | Não | Não | Não |

O Engenheiro apenas consulta mapas e Kits dos Técnicos, inclusive materiais, nome, unidades aplicáveis e marcações. Pode criar mapas/Kits e administrar os próprios, identificados por `criadoPor` do mapa associado, mas **não aponta nem altera contexto em nenhum mapa**, inclusive os próprios. Importação e limpeza de marcações também são bloqueadas. As Rules não permitem trocar `criadoPor` para assumir um mapa. Mapas antigos sem autor permanecem consultáveis e protegidos para o Engenheiro, sem atribuição automática ou migração. Reutiliza-se o campo de autoria já existente; não houve nova mudança de schema.

Coordenador pode gerenciar a composição e a aplicabilidade dos Kits e seus mapas vinculados, mas não marcações/contextos nem mapas manuais. Essa permissão não concede gestão de mapas manuais.

DEV administra setor, superior e obras de outros perfis já provisionados no mesmo espaço, respeitando a cadeia e as Rules. Mudanças de nível exigem a migração administrativa explícita, com revisão da árvore completa. Não cria Auth, não modifica seu próprio perfil e não promove/cria outro DEV pelo cliente. O provisionamento inicial é administrativo. As contas de teste não possuem exceções por e-mail, claims especiais ou bypass nas sessões da aplicação. Somente o seed administrativo usa o acesso administrativo do emulador para provisionar os dados.

## Roteiro manual

1. Entre como Técnico Apontamento. Confirme Jardim das Tulipas I, crie/renomeie um mapa e altere marcação/observação. Confirme sincronização e histórico. O seletor não oferece a Obra Teste B; a Central de Kits não está disponível.
2. Entre como Técnico Estoque. Confirme que pode criar mapas, apontar e usar a Central de Kits. Crie um Kit no espaço compartilhado.
3. Entre como Engenheiro. Confirme que vê os mapas dos dois Técnicos, inclusive as atualizações e o Kit criado no passo anterior. Não pode editá-los ou excluí-los. Crie seu próprio mapa/Kit e confirme gestão de nome e unidades; marcações, contexto, importação e limpeza permanecem bloqueados em todos os mapas.
4. Entre como Coordenador. Consulte a obra, resumo e histórico; confirme gestão de Kits e ausência de edição de marcações, contexto ou mapas manuais. Tentativas diretas de escrita são cobertas pelos testes de Rules.
5. Entre como Gestor. Confirme a leitura de Jardim das Tulipas I e Obra Teste B e a ausência de escrita.
6. Entre como DEV. Confira ambas as obras, operações e gerenciamento de acessos permitidos. Não deve ser possível alterar o próprio perfil nem outro DEV.
7. Entre como Pendente. Confirme a tela Conta pendente sem acesso a obras.
8. Rode novamente o seed e confirme que os apontamentos e os IDs permaneceram. As atribuições de teste são restauradas propositalmente.

## Migração administrativa explícita de perfis existentes

`scripts/provisionar-hierarquia.mjs` valida um plano completo de relações e apenas migra os perfis indicados. Exemplo de arquivo privado `plano-hierarquia.json` (substitua os UIDs pelos IDs reais):

```json
{
  "version": 1,
  "espacoId": "UID_DONO_EXISTENTE",
  "usuarios": [
    { "userId": "UID_DONO_EXISTENTE", "nivel": "dev", "superiorId": null, "obraIds": ["obra-principal"] },
    { "userId": "UID_GESTOR", "nivel": "gestor", "superiorId": "UID_DONO_EXISTENTE", "obraIds": ["obra-principal"] }
  ]
}
```

Crie as contas no Authentication e seus perfis originais administrativamente antes desta migração; o script não cria senhas nem contas Auth. Para destino real, forneça `GOOGLE_OAUTH_ACCESS_TOKEN` temporário e um projeto explícito:

```sh
npm run provisionar:hierarquia -- --arquivo plano-hierarquia.json --projeto ID_REAL
```

O comando acima apenas lê/valida e mostra os perfis que mudariam. Após revisar o plano, acrescente `--aplicar` para gravar. Para emulador, use `--projeto demo-coloredplans --emulador` com `FIRESTORE_EMULATOR_HOST` local explícito.

São atualizados somente `schemaVersion`, `nivel`, `espacoId`, `superiorId` e `obraIds`, com máscara de campos e precondição de versão em lote atômico. Demais campos, timestamps, setor e dados operacionais são preservados. Uma reexecução sem mudanças não grava nada. Superiores e o proprietário dos caminhos devem constar do mesmo plano; o proprietário pode ter qualquer nível coerente com a árvore, sem promoção automática por ser dono dos caminhos antigos. A migração aborta se uma obra atribuída não existe ou ainda não concluiu a migração operacional para schema 1, se um perfil pertence a outro espaço ou se um usuário legado que passaria a compartilhar dados já possui obras/Kits/legendas próprios. Esses casos precisam de análise específica para não ocultar dados; o script não os move nem os apaga.

Valide com `npm run check`. Os testes de seed verificam proteção antes de rede, colisões e preservação; as Rules verificam tentativas diretas de acesso/escrita; a suíte de interface usa login real no Auth Emulator para cada nível.

## Mapa adicional — Lírios do Vale II

As mesmas sete contas provisionadas recebem acesso explícito à obra local
`lirios-do-vale-ii`, além de Jardim das Tulipas I (`obra-principal`).
A conta pendente permanece somente no Authentication. `obra-teste-b` continua
sem atribuição a Técnicos, Engenheiros e Coordenador, preservando o teste negativo.

O seed cria um único template `lirios-v1`, a planta `implantacao-lirios` e o
mapa `mapa-planejamento`, todos no espaço compartilhado `teste-dev`.
São 100 moradias em 8 blocos e 8 equipamentos/áreas comuns selecionáveis,
com IDs próprios para marcação, contexto, Kits e exportação. Não há cópia dos
dados reais da empresa. Uma reexecução preserva mapas, template e trabalho manual.
Geometria e interpretações da imagem: [LIRIOS_DO_VALE_II.md](LIRIOS_DO_VALE_II.md).
