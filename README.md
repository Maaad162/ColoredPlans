# Mapa de unidades

Aplicação React + TypeScript para marcação visual das 100 unidades da planta do
empreendimento. A geometria é recriada em SVG e as marcações são salvas no
Firebase Firestore, com cache local no navegador.

É possível criar vários mapas de serviço sobre a mesma planta. Cada aba mantém
marcações independentes e a aba ativa também é restaurada ao reabrir a aplicação.
Abas excedentes podem ser apagadas com confirmação, e a opção `Sem marcação` da
pintura rápida funciona como uma borracha sobre as unidades.

## Desenvolvimento

```bash
npm install
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

## Hospedagem no Firebase

O arquivo `firebase.json` já está configurado para publicar a pasta `dist`,
redirecionar as rotas da SPA para `index.html` e incluir as regras do Firestore.
Depois de instalar e preencher o `.env.local`, execute na raiz do projeto:

```bash
firebase login
firebase use --add
npm run build
firebase deploy --only hosting,firestore:rules
```

Durante `firebase use --add`, selecione o mesmo projeto usado em
`VITE_FIREBASE_PROJECT_ID`. O endereço publicado será exibido ao final do
deploy, normalmente no formato `https://<project-id>.web.app`.

Após o primeiro deploy, adicione o domínio `*.web.app` usado pela aplicação em
`Authentication > Configurações > Domínios autorizados` no Console do Firebase.

## Estrutura de dados

- `src/data/planta.ts`: blocos, unidades e coordenadas SVG.
- `src/config/statuses.ts`: nomes, cores e símbolos dos status.
- `src/services/firestore.ts`: sincronização remota dos mapas.
- `src/services/storage.ts`: cache local, importação e exportação.
- `src/hooks/useAuth.ts`: sessão do usuário.
- `src/hooks/usePlanta.ts`: sincronização, abas, seleção, pintura e filtros.

Ao atualizar uma instalação anterior, as marcações existentes são migradas
automaticamente para a aba `Mapa principal`.

## Firebase

1. No Console do Firebase, abra `Authentication > Método de login` e habilite
   `E-mail/senha`.
2. Em `Authentication > Configurações > Domínios autorizados`, adicione
   `localhost` para executar o projeto localmente.
3. Em `Authentication > Usuários`, crie ao menos um usuário.
4. Em `Firestore Database > Regras`, publique o conteúdo de `firestore.rules`.
5. Copie `.env.example` para `.env.local` e preencha a configuração do app Web.

Os documentos são gravados em:

```text
obras/obra-principal/mapas/{mapaId}
```

Todos os usuários autenticados acessam a mesma obra. As regras podem ser
evoluídas posteriormente para restringir obras por usuário ou equipe.

Na primeira entrada, se o Firestore ainda estiver vazio, os mapas encontrados
no `localStorage` são migrados automaticamente. Depois disso, alterações são
sincronizadas em tempo real entre os computadores autenticados.
