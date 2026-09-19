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
  writeBatch,
} from "firebase/firestore";

import { CURRENT_SCHEMA_VERSION, OBRA_LEGADA_ID } from "../src/config/dados.ts";

const escopo = { schemaVersion: CURRENT_SCHEMA_VERSION, obraId: OBRA_LEGADA_ID };
const projeto = "demo-coloredplans";
const usuario1 = "usuario-1";
const usuario2 = "usuario-2";
const usuario3 = "usuario-3";
const caminhoMapas = (uid) =>
  `usuarios/${uid}/obras/${OBRA_LEGADA_ID}/mapas`;
const caminhoKits = (uid) => `usuarios/${uid}/kits`;

const material = {
  id: "material-a",
  codigoSienge: "10001",
  descricao: "Material A",
  detalhe: "",
  quantidadePorKit: 5,
};
const unidadesIniciais = [
  "bloco-01-001",
  "bloco-01-002",
  "bloco-01-003",
  "bloco-01-004",
  "bloco-01-005",
  "bloco-01-006",
  "bloco-01-007",
  "bloco-01-008",
  "bloco-01-101",
  "bloco-01-102",
];

const ambiente = await initializeTestEnvironment({ projectId: projeto });

try {
  await ambiente.clearFirestore();

  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const banco = contexto.firestore();
    await Promise.all([
      setDoc(doc(banco, `usuarios/${usuario1}`), {
        ...escopo, userId: usuario1,
        email: "estoque@teste.com",
        tipoConta: "estoque",
      }),
      setDoc(doc(banco, `usuarios/${usuario2}`), {
        ...escopo, userId: usuario2,
        email: "apontamento@teste.com",
        tipoConta: "apontamento",
      }),
      setDoc(doc(banco, `usuarios/${usuario3}`), {
        ...escopo, userId: usuario3,
        email: "outro-estoque@teste.com",
        tipoConta: "estoque",
      }),
      setDoc(doc(banco, caminhoMapas(usuario1), "pintura"), {
        ...escopo, userId: usuario1,
        nome: "Pintura",
        marcacoes: { "bloco-01-001": "concluido" },
      }),
      setDoc(doc(banco, caminhoMapas(usuario2), "pintura"), {
        ...escopo, userId: usuario2,
        nome: "Pintura",
        marcacoes: { "bloco-01-001": "pendente" },
      }),
      setDoc(doc(banco, `obras/${OBRA_LEGADA_ID}/mapas/legado`), {
        criadoPor: usuario1,
        nome: "Mapa legado",
        marcacoes: {},
      }),
      setDoc(doc(banco, `usuarios/${usuario1}/legendas/concluido`), {
        ...escopo, userId: usuario1,
        nome: "Concluído",
        cor: "#23875d",
      }),
      // Documentos antigos: Kit sem mapaId e mapa manual de mesmo nome.
      setDoc(doc(banco, caminhoKits(usuario1), "hidraulico"), {
        ...escopo, userId: usuario1,
        schemaVersion: 0, nome: "Kit Hidráulico",
        materiais: [material],
        unidadeIds: unidadesIniciais,
      }),
      setDoc(doc(banco, caminhoMapas(usuario1), "hidraulico-antigo"), {
        ...escopo, userId: usuario1,
        nome: "Kit Hidráulico",
        marcacoes: { "bloco-01-001": "andamento" },
      }),
    ]);
  });

  const banco1 = ambiente.authenticatedContext(usuario1).firestore();
  const banco2 = ambiente.authenticatedContext(usuario2).firestore();
  const banco3 = ambiente.authenticatedContext(usuario3).firestore();
  const banco4 = ambiente.authenticatedContext("usuario-4").firestore();
  const banco5 = ambiente.authenticatedContext("usuario-5").firestore();

  const mapa1 = doc(banco1, caminhoMapas(usuario1), "pintura");
  const mapa1ComoUsuario2 = doc(banco2, caminhoMapas(usuario1), "pintura");
  const mapa2 = doc(banco2, caminhoMapas(usuario2), "pintura");

  await assertSucceeds(getDoc(mapa1));
  await assertSucceeds(updateDoc(mapa1, { nome: "Pintura renomeada" }));
  const renomeado = await getDoc(mapa1);
  if (renomeado.data().nome !== "Pintura renomeada"
    || renomeado.data().marcacoes["bloco-01-001"] !== "concluido") {
    throw new Error("Renomear o mapa manual deve preservar suas marcações.");
  }
  await assertFails(updateDoc(mapa1, { nome: "" }));
  await assertFails(updateDoc(mapa1, { nome: "   " }));
  await assertFails(updateDoc(mapa1, { nome: "\t\n" }));
  await assertSucceeds(getDoc(mapa2));
  await assertFails(getDoc(mapa1ComoUsuario2));
  await assertSucceeds(updateDoc(mapa1, {
    "marcacoes.bloco-01-002": "andamento",
  }));
  await assertFails(updateDoc(mapa1ComoUsuario2, {
    "marcacoes.bloco-01-001": "pendente",
  }));
  await assertFails(deleteDoc(mapa1ComoUsuario2));

  await assertSucceeds(getDocs(query(
    collection(banco1, caminhoMapas(usuario1)),
    where("userId", "==", usuario1),
  )));
  await assertFails(getDocs(query(
    collection(banco2, caminhoMapas(usuario1)),
    where("userId", "==", usuario1),
  )));

  await assertSucceeds(setDoc(doc(banco2, caminhoMapas(usuario2), "eletrica"), {
    ...escopo, userId: usuario2,
    tipo: "manual",
    kitUnidadeIds: [],
    nome: "Elétrica",
    marcacoes: {},
  }));
  await assertFails(setDoc(doc(banco2, caminhoMapas(usuario1), "invasao"), {
    ...escopo, userId: usuario2,
    tipo: "manual",
    kitUnidadeIds: [],
    nome: "Mapa indevido",
    marcacoes: {},
  }));
  await assertFails(updateDoc(mapa1, { userId: usuario2 }));

  const perfil1 = doc(banco1, `usuarios/${usuario1}`);
  await assertSucceeds(getDoc(perfil1));
  await assertFails(getDoc(doc(banco2, `usuarios/${usuario1}`)));
  await assertFails(updateDoc(perfil1, { tipoConta: "apontamento" }));
  await assertFails(setDoc(doc(banco4, "usuarios/usuario-4"), {
    userId: "usuario-4",
    email: "novo@teste.com",
    tipoConta: "apontamento",
  }));
  await assertFails(setDoc(doc(banco5, "usuarios/usuario-5"), {
    userId: "usuario-5",
    email: "invalido@teste.com",
    tipoConta: "administrador",
  }));

  await assertSucceeds(setDoc(
    doc(banco2, `usuarios/${usuario2}/legendas/aguardando`),
    { ...escopo, userId: usuario2, nome: "Aguardando correção", cor: "#8059b6" },
  ));
  await assertSucceeds(updateDoc(mapa2, {
    "marcacoes.bloco-01-002": "aguardando",
  }));
  await assertFails(setDoc(doc(banco2, `usuarios/${usuario2}/legendas/vazia`), {
    ...escopo, userId: usuario2, nome: "   ", cor: "#8059b6",
  }));
  await assertFails(setDoc(doc(banco2, `usuarios/${usuario2}/obras/vazia`), {
    ...escopo, userId: usuario2, nome: "   ",
  }));

  // Migração compatível: associa os dois documentos antigos sem apagar marcações.
  const kitLegado = doc(banco1, caminhoKits(usuario1), "hidraulico");
  const mapaLegadoKit = doc(
    banco1,
    caminhoMapas(usuario1),
    "hidraulico-antigo",
  );
  const loteMigracao = writeBatch(banco1);
  loteMigracao.update(kitLegado, { ...escopo, mapaId: "hidraulico-antigo" });
  loteMigracao.update(mapaLegadoKit, {
    ...escopo,
    tipo: "kit",
    kitId: "hidraulico",
    kitUnidadeIds: unidadesIniciais,
  });
  await assertSucceeds(loteMigracao.commit());
  const mapaMigrado = await getDoc(mapaLegadoKit);
  if (mapaMigrado.data()?.marcacoes?.["bloco-01-001"] !== "andamento") {
    throw new Error("A migração apagou marcações do mapa antigo.");
  }

  // Não é possível alterar apenas um lado do vínculo.
  await assertFails(updateDoc(mapaLegadoKit, { nome: "Renomeado diretamente" }));
  await assertFails(updateDoc(kitLegado, { nome: "Hidráulico renomeado" }));
  await assertFails(updateDoc(kitLegado, {
    unidadeIds: [...unidadesIniciais, "bloco-02-001"],
  }));

  const unidadesAtualizadas = [...unidadesIniciais, "bloco-02-001"];
  const loteUnidades = writeBatch(banco1);
  loteUnidades.update(kitLegado, { unidadeIds: unidadesAtualizadas });
  loteUnidades.update(mapaLegadoKit, {
    kitUnidadeIds: unidadesAtualizadas,
  });
  await assertSucceeds(loteUnidades.commit());

  const loteRenomear = writeBatch(banco1);
  loteRenomear.update(kitLegado, { nome: "Hidráulico renomeado" });
  loteRenomear.update(mapaLegadoKit, { nome: "Hidráulico renomeado" });
  await assertSucceeds(loteRenomear.commit());

  const loteNomeVazio = writeBatch(banco1);
  loteNomeVazio.update(kitLegado, { nome: "   " });
  loteNomeVazio.update(mapaLegadoKit, { nome: "   " });
  await assertFails(loteNomeVazio.commit());

  // Criação atômica do exemplo Isométrico.
  const kitIsometrico = doc(banco1, caminhoKits(usuario1), "isometrico");
  const mapaIsometrico = doc(
    banco1,
    caminhoMapas(usuario1),
    "mapa-kit-isometrico",
  );
  const loteCriacao = writeBatch(banco1);
  loteCriacao.set(kitIsometrico, {
    ...escopo, userId: usuario1,
    mapaId: "mapa-kit-isometrico",
    nome: "Isométrico",
    materiais: [material],
    unidadeIds: [],
  });
  loteCriacao.set(mapaIsometrico, {
    ...escopo, userId: usuario1,
    nome: "Isométrico",
    tipo: "kit",
    kitId: "isometrico",
    kitUnidadeIds: [],
    marcacoes: {},
  });
  await assertSucceeds(loteCriacao.commit());
  await assertSucceeds(getDoc(mapaIsometrico));

  // Kit sem mapa e mapa apontando para Kit inexistente são rejeitados.
  await assertFails(setDoc(doc(banco1, caminhoKits(usuario1), "sem-mapa"), {
    ...escopo, userId: usuario1,
    mapaId: "mapa-inexistente",
    nome: "Sem mapa",
    materiais: [material],
    unidadeIds: [],
  }));
  await assertFails(setDoc(
    doc(banco1, caminhoMapas(usuario1), "mapa-sem-kit"),
    {
      ...escopo, userId: usuario1,
      nome: "Mapa sem Kit",
      tipo: "kit",
      kitId: "kit-inexistente",
      kitUnidadeIds: [],
      marcacoes: {},
    },
  ));
  await assertFails(setDoc(doc(banco2, caminhoKits(usuario2), "negado"), {
    ...escopo, userId: usuario2,
    mapaId: "qualquer",
    nome: "Kit não permitido",
    materiais: [material],
    unidadeIds: [],
  }));

  // Outro usuário de estoque pode criar seu próprio par, mas não acessar o alheio.
  const kit3 = doc(banco3, caminhoKits(usuario3), "proprio");
  const mapa3 = doc(banco3, caminhoMapas(usuario3), "mapa-kit-proprio");
  const lote3 = writeBatch(banco3);
  lote3.set(kit3, {
    ...escopo, userId: usuario3,
    mapaId: "mapa-kit-proprio",
    nome: "Kit próprio",
    materiais: [material],
    unidadeIds: [],
  });
  lote3.set(mapa3, {
    ...escopo, userId: usuario3,
    nome: "Kit próprio",
    tipo: "kit",
    kitId: "proprio",
    kitUnidadeIds: [],
    marcacoes: {},
  });
  await assertSucceeds(lote3.commit());
  await assertFails(getDoc(doc(
    banco3,
    caminhoKits(usuario1),
    "hidraulico",
  )));

  // Um mapa exclusivo não pode ser excluído sozinho; o par pode.
  await assertFails(deleteDoc(mapaIsometrico));
  const loteExclusao = writeBatch(banco1);
  loteExclusao.delete(kitIsometrico);
  loteExclusao.delete(mapaIsometrico);
  await assertSucceeds(loteExclusao.commit());

  const legadoGlobal1 = doc(banco1, `obras/${OBRA_LEGADA_ID}/mapas/legado`);
  const legadoGlobal2 = doc(banco2, `obras/${OBRA_LEGADA_ID}/mapas/legado`);
  await assertSucceeds(getDoc(legadoGlobal1));
  await assertFails(getDoc(legadoGlobal2));
  await assertFails(deleteDoc(legadoGlobal1));

  const [pintura1, pintura2] = await Promise.all([
    getDoc(mapa1),
    getDoc(mapa2),
  ]);
  if (
    pintura1.data()?.marcacoes?.["bloco-01-001"] !== "concluido"
    || pintura2.data()?.marcacoes?.["bloco-01-001"] !== "pendente"
  ) {
    throw new Error("As marcações de usuários diferentes interferiram entre si.");
  }

  const kitAtualizado = await getDoc(kitLegado);
  const mapaAtualizado = await getDoc(mapaLegadoKit);
  if (
    kitAtualizado.data()?.mapaId !== mapaLegadoKit.id
    || mapaAtualizado.data()?.kitId !== kitLegado.id
    || kitAtualizado.data()?.nome !== mapaAtualizado.data()?.nome
    || kitAtualizado.data()?.unidadeIds?.length
      !== mapaAtualizado.data()?.kitUnidadeIds?.length
  ) {
    throw new Error("Kit e mapa terminaram inconsistentes.");
  }


  // Nenhum cliente provisiona, promove, substitui ou apaga perfis.
  for (const [banco, uid] of [[banco1, usuario1], [banco2, usuario2]]) {
    const perfil = doc(banco, `usuarios/${uid}`);
    await assertFails(updateDoc(perfil, { tipoConta: uid === usuario1 ? "admin" : "estoque" }));
    await assertFails(updateDoc(perfil, { email: "alterado@teste.com" }));
    await assertFails(setDoc(perfil, { ...escopo, userId: uid, tipoConta: "estoque" }));
    await assertFails(deleteDoc(perfil));
  }
  await assertFails(setDoc(doc(banco4, "usuarios/usuario-4"), { ...escopo, userId: "usuario-4", tipoConta: "estoque" }));
  await assertFails(setDoc(doc(banco4, caminhoMapas("usuario-4"), "sem-perfil"), {
    ...escopo, userId: "usuario-4", nome: "Invasão", marcacoes: {},
  }));
  await assertFails(setDoc(doc(banco4, "usuarios/usuario-4/legendas/a"), {
    ...escopo, userId: "usuario-4", nome: "Invasão", cor: "#ffffff",
  }));
  await assertFails(getDoc(doc(banco2, caminhoKits(usuario2), "negado")));
  await assertFails(getDoc(doc(ambiente.unauthenticatedContext().firestore(), caminhoMapas(usuario1), "pintura")));

  // Mesmo ID de mapa em obras distintas não compartilha marcações nem vínculos.
  const obraB = "obra-b";
  const mapaB = doc(banco1, `usuarios/${usuario1}/obras/${obraB}/mapas/pintura`);
  await assertSucceeds(setDoc(mapaB, { ...escopo, obraId: obraB, userId: usuario1, nome: "Obra B", marcacoes: {} }));
  await assertSucceeds(updateDoc(mapaB, { "marcacoes.bloco-01-001": "obra-b-status" }));
  if ((await getDoc(mapa1)).data().marcacoes["bloco-01-001"] !== "concluido") throw new Error("Vazamento entre obras.");
  await assertFails(updateDoc(mapaB, { obraId: OBRA_LEGADA_ID }));
  await assertFails(getDoc(doc(banco2, mapaB.path)));
  await assertFails(setDoc(doc(banco1, `usuarios/${usuario1}/obras/${obraB}/mapas/falso-kit`), {
    ...escopo, obraId: obraB, userId: usuario1, nome: "Hidráulico renomeado",
    tipo: "kit", kitId: "hidraulico", kitUnidadeIds: unidadesAtualizadas, marcacoes: {},
  }));
  await assertFails(updateDoc(kitLegado, { obraId: obraB }));

  const kitB = doc(banco1, caminhoKits(usuario1), "kit-b");
  const mapaKitB = doc(banco1, `usuarios/${usuario1}/obras/${obraB}/mapas/mapa-kit-b`);
  const loteB = writeBatch(banco1);
  loteB.set(kitB, { ...escopo, obraId: obraB, userId: usuario1, nome: "Kit B", mapaId: "mapa-kit-b", materiais: [material], unidadeIds: [] });
  loteB.set(mapaKitB, { ...escopo, obraId: obraB, userId: usuario1, nome: "Kit B", tipo: "kit", kitId: "kit-b", kitUnidadeIds: [], marcacoes: {} });
  await assertSucceeds(loteB.commit());
  await assertFails(deleteDoc(mapaKitB));
  await assertFails(updateDoc(mapaB, { schemaVersion: 0 }));
  await assertFails(updateDoc(mapaB, { schemaVersion: 999 }));
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(doc(contexto.firestore(), caminhoMapas(usuario1), "futuro"), {
      ...escopo, schemaVersion: 999, userId: usuario1, nome: "Futuro", marcacoes: {},
    });
  });
  await assertFails(updateDoc(doc(banco1, caminhoMapas(usuario1), "futuro"), { schemaVersion: CURRENT_SCHEMA_VERSION }));

  console.log(
    "OK: vínculo Kit/mapa, migração, atomicidade, exclusão e isolamento confirmados.",
  );
} finally {
  await ambiente.cleanup();
}
