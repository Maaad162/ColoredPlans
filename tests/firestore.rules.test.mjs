import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
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
const usuario3 = "usuario-3";
const caminhoMapas = (uid) =>
  `usuarios/${uid}/obras/obra-principal/mapas`;

const ambiente = await initializeTestEnvironment({ projectId: projeto });

try {
  await ambiente.clearFirestore();

  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(doc(contexto.firestore(), `usuarios/${usuario1}`), {
      userId: usuario1,
      email: "estoque@teste.com",
      tipoConta: "estoque",
    });
    await setDoc(doc(contexto.firestore(), `usuarios/${usuario2}`), {
      userId: usuario2,
      email: "apontamento@teste.com",
      tipoConta: "apontamento",
    });
    await setDoc(doc(contexto.firestore(), `usuarios/${usuario3}`), {
      userId: usuario3,
      email: "outro-estoque@teste.com",
      tipoConta: "estoque",
    });
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
    await setDoc(
      doc(contexto.firestore(), `usuarios/${usuario1}/legendas/concluido`),
      { userId: usuario1, nome: "Concluído", cor: "#23875d" },
    );
    await setDoc(
      doc(contexto.firestore(), `usuarios/${usuario1}/kits/hidraulico`),
      {
        userId: usuario1,
        nome: "Kit Hidráulico",
        materiais: [
          {
            id: "material-a",
            codigoSienge: "10001",
            descricao: "Material A",
            detalhe: "Material do teste",
            quantidadePorKit: 5,
          },
        ],
        unidadeIds: [
          "bloco-01-001", "bloco-01-002", "bloco-01-003", "bloco-01-004",
          "bloco-01-005", "bloco-01-006", "bloco-01-007", "bloco-01-008",
          "bloco-01-101", "bloco-01-102",
        ],
      },
    );
  });

  const banco1 = ambiente.authenticatedContext(usuario1).firestore();
  const banco2 = ambiente.authenticatedContext(usuario2).firestore();
  const banco3 = ambiente.authenticatedContext(usuario3).firestore();
  const banco4 = ambiente.authenticatedContext("usuario-4").firestore();
  const banco5 = ambiente.authenticatedContext("usuario-5").firestore();
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

  const perfil1 = doc(banco1, `usuarios/${usuario1}`);
  await assertSucceeds(getDoc(perfil1));
  await assertFails(getDoc(doc(banco2, `usuarios/${usuario1}`)));
  await assertFails(updateDoc(perfil1, { tipoConta: "apontamento" }));
  await assertSucceeds(
    setDoc(doc(banco4, "usuarios/usuario-4"), {
      userId: "usuario-4",
      email: "novo@teste.com",
      tipoConta: "apontamento",
    }),
  );
  await assertFails(
    setDoc(doc(banco5, "usuarios/usuario-5"), {
      userId: "usuario-5",
      email: "invalido@teste.com",
      tipoConta: "administrador",
    }),
  );
  await assertSucceeds(
    setDoc(doc(banco2, `usuarios/${usuario2}/legendas/aguardando`), {
      userId: usuario2,
      nome: "Aguardando correção",
      cor: "#8059b6",
    }),
  );
  await assertSucceeds(
    updateDoc(mapa2PeloUsuario2, {
      "marcacoes.bloco-01-002": "aguardando",
    }),
  );
  const mapaApontamento = await getDoc(mapa2PeloUsuario2);
  if (mapaApontamento.data()?.marcacoes?.["bloco-01-002"] !== "aguardando") {
    throw new Error("A legenda personalizada do Apontamento não permaneceu salva.");
  }
  await assertFails(
    setDoc(doc(banco2, `usuarios/${usuario1}/legendas/invasao`), {
      userId: usuario2,
      nome: "Indevida",
      cor: "#000000",
    }),
  );
  await assertSucceeds(
    updateDoc(mapa1PeloUsuario1, {
      "marcacoes.bloco-01-003": "concluido",
    }),
  );

  const kit1PeloUsuario1 = doc(
    banco1,
    `usuarios/${usuario1}/kits/hidraulico`,
  );
  await assertSucceeds(getDoc(kit1PeloUsuario1));
  await assertFails(
    getDoc(doc(banco3, `usuarios/${usuario1}/kits/hidraulico`)),
  );
  await assertFails(
    updateDoc(doc(banco3, `usuarios/${usuario1}/kits/hidraulico`), {
      nome: "Alteração indevida",
    }),
  );
  await assertFails(
    setDoc(doc(banco2, `usuarios/${usuario2}/kits/negado`), {
      userId: usuario2,
      nome: "Kit não permitido",
      materiais: [{ quantidadePorKit: 1 }],
      unidadeIds: [],
    }),
  );
  await assertSucceeds(
    setDoc(doc(banco3, `usuarios/${usuario3}/kits/proprio`), {
      userId: usuario3,
      nome: "Kit próprio",
      materiais: [
        {
          id: "material-1",
          codigoSienge: "20001",
          descricao: "Material",
          detalhe: "Detalhe",
          quantidadePorKit: 1,
        },
      ],
      unidadeIds: [],
    }),
  );

  await assertSucceeds(
    updateDoc(kit1PeloUsuario1, {
      unidadeIds: arrayUnion("bloco-01-001", "bloco-01-001"),
    }),
  );
  const kitAposDuplicidade = await getDoc(kit1PeloUsuario1);
  const unidadesDoKit = kitAposDuplicidade.data()?.unidadeIds ?? [];
  if (unidadesDoKit.length !== new Set(unidadesDoKit).size) {
    throw new Error("O mesmo Kit foi contabilizado duas vezes na mesma unidade.");
  }
  const material = kitAposDuplicidade.data()?.materiais?.[0];
  const utilizado = material.quantidadePorKit * unidadesDoKit.length;
  if (utilizado !== 50) {
    throw new Error(`Consumo incorreto: esperado 50, recebido ${utilizado}.`);
  }

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

  console.log(
    "OK: perfis, legendas, mapas, Kits, consumo, duplicidade e isolamento confirmados.",
  );
} finally {
  await ambiente.cleanup();
}
