import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projeto = "lmcoloredplans";
const usuario1 = "usuario-1";
const usuario2 = "usuario-2";
const caminhoMapas = (uid) =>
  `usuarios/${uid}/obras/obra-principal/mapas`;

const ambiente = await initializeTestEnvironment({ projectId: projeto });

try {
  await ambiente.clearFirestore();

  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(
      doc(contexto.firestore(), caminhoMapas(usuario1), "pintura"),
      {
        userId: usuario1,
        nome: "Pintura",
        marcacoes: { "bloco-01-001": "concluido" },
      },
    );
    await setDoc(
      doc(contexto.firestore(), caminhoMapas(usuario2), "pintura"),
      {
        userId: usuario2,
        nome: "Pintura",
        marcacoes: { "bloco-01-001": "pendente" },
      },
    );
    await setDoc(
      doc(contexto.firestore(), "obras/obra-principal/mapas/legado"),
      { criadoPor: usuario1, nome: "Mapa legado", marcacoes: {} },
    );
  });

  const banco1 = ambiente.authenticatedContext(usuario1).firestore();
  const banco2 = ambiente.authenticatedContext(usuario2).firestore();
  const mapa1PeloUsuario1 = doc(
    banco1,
    caminhoMapas(usuario1),
    "pintura",
  );
  const mapa1PeloUsuario2 = doc(
    banco2,
    caminhoMapas(usuario1),
    "pintura",
  );
  const mapa2PeloUsuario2 = doc(
    banco2,
    caminhoMapas(usuario2),
    "pintura",
  );

  await assertSucceeds(getDoc(mapa1PeloUsuario1));
  await assertSucceeds(getDoc(mapa2PeloUsuario2));
  await assertFails(getDoc(mapa1PeloUsuario2));

  await assertSucceeds(
    updateDoc(mapa1PeloUsuario1, {
      "marcacoes.bloco-01-002": "andamento",
    }),
  );
  await assertFails(
    updateDoc(mapa1PeloUsuario2, {
      "marcacoes.bloco-01-001": "pendente",
    }),
  );
  await assertFails(deleteDoc(mapa1PeloUsuario2));

  await assertSucceeds(
    getDocs(
      query(
        collection(banco1, caminhoMapas(usuario1)),
        where("userId", "==", usuario1),
      ),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collection(banco2, caminhoMapas(usuario1)),
        where("userId", "==", usuario1),
      ),
    ),
  );

  await assertSucceeds(
    setDoc(doc(banco2, caminhoMapas(usuario2), "eletrica"), {
      userId: usuario2,
      nome: "Elétrica",
      marcacoes: {},
    }),
  );
  await assertFails(
    setDoc(doc(banco2, caminhoMapas(usuario1), "invasao"), {
      userId: usuario2,
      nome: "Mapa indevido",
      marcacoes: {},
    }),
  );
  await assertFails(
    updateDoc(mapa1PeloUsuario1, { userId: usuario2 }),
  );

  const legado1 = doc(
    banco1,
    "obras/obra-principal/mapas/legado",
  );
  const legado2 = doc(
    banco2,
    "obras/obra-principal/mapas/legado",
  );
  await assertSucceeds(getDoc(legado1));
  await assertFails(getDoc(legado2));
  await assertSucceeds(deleteDoc(legado1));

  const [pintura1, pintura2] = await Promise.all([
    getDoc(mapa1PeloUsuario1),
    getDoc(mapa2PeloUsuario2),
  ]);
  if (
    pintura1.data()?.marcacoes?.["bloco-01-001"] !== "concluido" ||
    pintura2.data()?.marcacoes?.["bloco-01-001"] !== "pendente"
  ) {
    throw new Error("As marcações de usuários diferentes interferiram entre si.");
  }

  console.log("OK: isolamento de leitura, escrita, exclusão e migração confirmado.");
} finally {
  await ambiente.cleanup();
}
