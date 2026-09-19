import assert from "node:assert/strict";
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, deleteField, doc, getDocFromServer, getDocs, query,
  runTransaction, setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { CURRENT_SCHEMA_VERSION, OBRA_PADRAO_ID } from "../src/config/dados.ts";

const perfilDados = (uid, tipoConta) => ({
  userId: uid, tipoConta, email: `${uid}@teste.invalid`,
  schemaVersion: CURRENT_SCHEMA_VERSION, criadoEm: Timestamp.fromMillis(1000),
});
const obraPath = (uid) => `usuarios/${uid}/obras/${OBRA_PADRAO_ID}`;
const mapaPath = (uid) => `${obraPath(uid)}/mapas/manual`;
const mapaDados = (uid) => ({
  userId: uid, obraId: OBRA_PADRAO_ID, schemaVersion: CURRENT_SCHEMA_VERSION,
  nome: "Pintura", tipo: "manual", kitUnidadeIds: [], marcacoes: {},
});

function criarParKit(banco, uid, promover = false) {
  const lote = writeBatch(banco);
  const escopo = { userId: uid, obraId: OBRA_PADRAO_ID, schemaVersion: CURRENT_SCHEMA_VERSION };
  if (promover) lote.update(doc(banco, `usuarios/${uid}`), { tipoConta: "estoque" });
  lote.set(doc(banco, `usuarios/${uid}/kits/kit`), {
    ...escopo, nome: "Kit", mapaId: "mapa-kit", unidadeIds: [],
    materiais: [{ id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 1 }],
  });
  lote.set(doc(banco, `${obraPath(uid)}/mapas/mapa-kit`), {
    ...escopo, nome: "Kit", tipo: "kit", kitId: "kit", kitUnidadeIds: [], marcacoes: {},
  });
  return lote.commit();
}

test("perfis: autorização remota independente da interface", async (t) => {
  const ambiente = await initializeTestEnvironment({ projectId: "lmcoloredplans" });
  const usuarios = ["perfil-apontamento", "perfil-estoque"];
  try {
    await ambiente.clearFirestore();
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore();
      for (const [index, uid] of usuarios.entries()) {
        await setDoc(doc(banco, `usuarios/${uid}`), perfilDados(uid, index ? "estoque" : "apontamento"));
        await setDoc(doc(banco, mapaPath(uid)), mapaDados(uid));
      }
    });

    for (const uid of usuarios) {
      await t.test(`${uid}: nenhuma forma de escrita altera o perfil`, async () => {
        const banco = ambiente.authenticatedContext(uid).firestore();
        const referencia = doc(banco, `usuarios/${uid}`);
        const antes = (await assertSucceeds(getDocFromServer(referencia))).data();
        for (const tipoConta of ["apontamento", "estoque", "admin", "administrador", "", null, { estoque: true }]) {
          await assertFails(updateDoc(referencia, { tipoConta }));
          await assertFails(setDoc(referencia, { tipoConta }, { merge: true }));
          await assertFails(setDoc(referencia, { ...antes, tipoConta }));
        }
        await assertFails(setDoc(referencia, { tipoConta: "estoque" }, { mergeFields: ["tipoConta"] }));
        await assertFails(updateDoc(referencia, { tipoConta: deleteField() }));
        await assertFails(updateDoc(referencia, { userId: "outro" }));
        await assertFails(updateDoc(referencia, { email: "alterado@teste.invalid" }));
        await assertFails(updateDoc(referencia, { schemaVersion: 0 }));
        await assertFails(updateDoc(referencia, { role: "admin", admin: true }));
        await assertFails(deleteDoc(referencia));
        assert.deepEqual((await getDocFromServer(referencia)).data(), antes);
        await assertSucceeds(updateDoc(doc(banco, mapaPath(uid)), { "marcacoes.bloco-01-001": "concluido" }));
      });
    }

    await t.test("sem perfil: não pode se provisionar nem acessar dados operacionais", async () => {
      const uid = "perfil-ausente";
      const banco = ambiente.authenticatedContext(uid).firestore();
      const referencia = doc(banco, `usuarios/${uid}`);
      assert.equal((await assertSucceeds(getDocFromServer(referencia))).exists(), false);
      for (const tipoConta of ["apontamento", "estoque"]) {
        await assertFails(setDoc(referencia, perfilDados(uid, tipoConta)));
        await assertFails(setDoc(referencia, perfilDados(uid, tipoConta), { merge: true }));
      }
      await assertFails(setDoc(doc(banco, mapaPath(uid)), mapaDados(uid)));
      await assertFails(getDocFromServer(doc(banco, obraPath(uid))));
      await assertFails(setDoc(doc(banco, obraPath(uid)), {
        userId: uid, nome: "Obra", schemaVersion: CURRENT_SCHEMA_VERSION,
      }));
      await assertFails(setDoc(doc(banco, `usuarios/${uid}/legendas/a`), {
        userId: uid, nome: "A", cor: "#23875d", schemaVersion: CURRENT_SCHEMA_VERSION,
      }));
      await assertFails(criarParKit(banco, uid));
      assert.equal((await getDocFromServer(referencia)).exists(), false);
    });

    await t.test("outro usuário e sessão anônima não leem nem alteram o perfil", async () => {
      for (const banco of [
        ambiente.authenticatedContext(usuarios[1]).firestore(),
        ambiente.unauthenticatedContext().firestore(),
      ]) {
        const referencia = doc(banco, `usuarios/${usuarios[0]}`);
        await assertFails(getDocFromServer(referencia));
        await assertFails(getDocs(collection(banco, "usuarios")));
        await assertFails(setDoc(referencia, perfilDados(usuarios[0], "estoque")));
        await assertFails(updateDoc(referencia, { tipoConta: "estoque" }));
        await assertFails(deleteDoc(referencia));
      }
    });

    await t.test("lote e transação não promovem o setor nem deixam gravações parciais", async () => {
      const uid = usuarios[0];
      const banco = ambiente.authenticatedContext(uid).firestore();
      const perfil = doc(banco, `usuarios/${uid}`);
      const mapa = doc(banco, mapaPath(uid));
      const antes = (await getDocFromServer(mapa)).data();
      const lote = writeBatch(banco);
      lote.update(perfil, { tipoConta: "estoque" });
      lote.update(mapa, { nome: "Não deve persistir" });
      await assertFails(lote.commit());
      await assertFails(runTransaction(banco, async (transacao) => {
        await transacao.get(perfil);
        transacao.set(perfil, { tipoConta: "estoque" }, { merge: true });
        transacao.update(mapa, { nome: "Não deve persistir" });
      }));
      await assertFails(criarParKit(banco, uid, true));
      assert.deepEqual((await getDocFromServer(mapa)).data(), antes);
      assert.equal((await getDocFromServer(perfil)).data().tipoConta, "apontamento");
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        const admin = contexto.firestore();
        assert.equal((await getDocFromServer(doc(admin, `usuarios/${uid}/kits/kit`))).exists(), false);
        assert.equal((await getDocFromServer(doc(admin, `${obraPath(uid)}/mapas/mapa-kit`))).exists(), false);
      });
    });

    await t.test("claims privilegiados e campos em documentos operacionais não concedem setor", async () => {
      const uid = usuarios[0];
      // Até claims emitidos no token são ignorados por esta política; não são credenciais IAM.
      const banco = ambiente.authenticatedContext(uid, { admin: true, role: "admin", tipoConta: "estoque" }).firestore();
      await assertFails(setDoc(doc(banco, `usuarios/${uid}`), { tipoConta: "estoque" }, { merge: true }));
      await assertSucceeds(updateDoc(doc(banco, mapaPath(uid)), { tipoConta: "estoque", role: "admin" }));
      await assertFails(criarParKit(banco, uid));
      await assertFails(getDocs(query(collection(banco, `usuarios/${uid}/kits`), where("userId", "==", uid))));
      assert.equal((await getDocFromServer(doc(banco, `usuarios/${uid}`))).data().tipoConta, "apontamento");
      const semPerfil = ambiente.authenticatedContext("claim-sem-perfil", { admin: true, tipoConta: "estoque" }).firestore();
      await assertFails(setDoc(doc(semPerfil, "usuarios/claim-sem-perfil"), perfilDados("claim-sem-perfil", "estoque")));
      await assertFails(setDoc(doc(semPerfil, mapaPath("claim-sem-perfil")), mapaDados("claim-sem-perfil")));
    });

    await t.test("perfil inválido não autoriza operação e não pode ser reparado pelo cliente", async () => {
      const casos = [
        { tipoConta: "administrador" }, { tipoConta: null }, { tipoConta: ["estoque"] },
        { tipoConta: undefined }, { userId: "outro-uid" }, { schemaVersion: 99 }, { schemaVersion: "1" },
      ];
      for (const [index, alteracao] of casos.entries()) {
        const uid = `perfil-invalido-${index}`;
        const dados = { ...perfilDados(uid, "estoque"), ...alteracao };
        if (dados.tipoConta === undefined) delete dados.tipoConta;
        await ambiente.withSecurityRulesDisabled(async (contexto) => {
          const admin = contexto.firestore();
          await setDoc(doc(admin, `usuarios/${uid}`), dados);
          await setDoc(doc(admin, mapaPath(uid)), mapaDados(uid));
        });
        const banco = ambiente.authenticatedContext(uid).firestore();
        await assertSucceeds(getDocFromServer(doc(banco, `usuarios/${uid}`)));
        await assertFails(getDocFromServer(doc(banco, mapaPath(uid))));
        await assertFails(updateDoc(doc(banco, mapaPath(uid)), { nome: "Alterado" }));
        await assertFails(getDocFromServer(doc(banco, obraPath(uid))));
        await assertFails(getDocs(query(collection(banco, `usuarios/${uid}/legendas`), where("userId", "==", uid))));
        await assertFails(criarParKit(banco, uid));
        await assertFails(setDoc(doc(banco, `usuarios/${uid}`), perfilDados(uid, "estoque")));
      }
    });

    await t.test("perfil legado sem versão continua autorizado e imutável", async () => {
      const uid = "perfil-legado";
      const dados = perfilDados(uid, "apontamento");
      delete dados.schemaVersion;
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        await setDoc(doc(contexto.firestore(), `usuarios/${uid}`), dados);
      });
      const banco = ambiente.authenticatedContext(uid).firestore();
      await assertSucceeds(setDoc(doc(banco, mapaPath(uid)), mapaDados(uid)));
      await assertFails(updateDoc(doc(banco, `usuarios/${uid}`), { schemaVersion: CURRENT_SCHEMA_VERSION }));
      await assertFails(updateDoc(doc(banco, `usuarios/${uid}`), { tipoConta: "estoque" }));
    });

    await t.test("permissões seguem a alteração administrativa do perfil na mesma sessão", async () => {
      const uid = usuarios[1];
      const banco = ambiente.authenticatedContext(uid).firestore();
      const referenciaKit = doc(banco, `usuarios/${uid}/kits/kit`);
      await assertSucceeds(criarParKit(banco, uid));
      await assertSucceeds(getDocFromServer(referenciaKit));
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        await updateDoc(doc(contexto.firestore(), `usuarios/${uid}`), { tipoConta: "apontamento" });
      });
      assert.equal((await getDocFromServer(doc(banco, `usuarios/${uid}`))).data().tipoConta, "apontamento");
      await assertFails(getDocFromServer(referenciaKit));
      await assertFails(updateDoc(referenciaKit, {
        materiais: [{ id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 2 }],
      }));
      await assertFails(updateDoc(doc(banco, `${obraPath(uid)}/mapas/mapa-kit`), { "marcacoes.bloco-01-001": "concluido" }));
      await assertSucceeds(updateDoc(doc(banco, mapaPath(uid)), { nome: "Continua manual" }));
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        await deleteDoc(doc(contexto.firestore(), `usuarios/${uid}`));
      });
      await assertFails(getDocFromServer(doc(banco, mapaPath(uid))));
      await assertFails(updateDoc(doc(banco, mapaPath(uid)), { nome: "Negado sem perfil" }));
    });
  } finally {
    await ambiente.cleanup();
  }
});
