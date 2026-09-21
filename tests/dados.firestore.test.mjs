import assert from "node:assert/strict";
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDocFromServer, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { CURRENT_SCHEMA_VERSION } from "../src/config/dados.ts";
import { garantirMapaInicial } from "../src/services/inicializarMapa.ts";
import { migrarObra } from "../src/services/migracoes.ts";

test("fundação: preservação dos dados e inicialização concorrente", async (t) => {
  const ambiente = await initializeTestEnvironment({ projectId: "demo-coloredplans" });
  const uid = "dados-estoque";
  const obraId = "obra-teste";
  const base = `usuarios/${uid}/obras/${obraId}`;
  try {
    await ambiente.clearFirestore();
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      await setDoc(doc(contexto.firestore(), `usuarios/${uid}`), {
        userId: uid, tipoConta: "estoque", schemaVersion: CURRENT_SCHEMA_VERSION,
      });
      for (const id of [obraId, "outra-obra", "obra-material"]) await setDoc(doc(contexto.firestore(), `usuarios/${uid}/obras/${id}`), { userId: uid, nome: id, schemaVersion: 0 });
    });
    const db = ambiente.authenticatedContext(uid).firestore();

    await t.test("duas instâncias criam um mapa e chamadas posteriores preservam todas as alterações", async () => {
      const outroDb = ambiente.authenticatedContext(uid).firestore();
      assert.notEqual(db, outroDb);
      await Promise.all([garantirMapaInicial(db, uid, obraId), garantirMapaInicial(outroDb, uid, obraId)]);
      const referencia = doc(db, `${base}/mapas/mapa-principal`);
      await updateDoc(referencia, { nome: "Nome editado", "marcacoes.bloco-01-001": "executado", extra: "preservar" });
      const antes = (await getDocFromServer(referencia)).data();
      await Promise.all([garantirMapaInicial(db, uid, obraId), garantirMapaInicial(outroDb, uid, obraId)]);
      assert.deepEqual((await getDocFromServer(referencia)).data(), antes);
      await garantirMapaInicial(db, uid, "outra-obra");
      assert.deepEqual((await getDocFromServer(doc(db, `usuarios/${uid}/obras/outra-obra/mapas/mapa-principal`))).data().marcacoes, {});
      assert.deepEqual((await getDocFromServer(referencia)).data(), antes);
      const intruso = ambiente.authenticatedContext("outro-usuario").firestore();
      await assertFails(garantirMapaInicial(intruso, uid, obraId));
    });

    await t.test("versões desconhecidas impedem downgrade e exclusão de mapa, legenda e Kit", async () => {
      for (const schemaVersion of [999, null, "1", -1]) {
        const sufixo = String(schemaVersion);
        const mapa = doc(db, `${base}/mapas/futuro-${sufixo}`);
        const legenda = doc(db, `usuarios/${uid}/legendas/futura-${sufixo}`);
        const kit = doc(db, `usuarios/${uid}/kits/futuro-${sufixo}`);
        await ambiente.withSecurityRulesDisabled(async (contexto) => {
          const admin = contexto.firestore();
          await setDoc(doc(admin, mapa.path), {
            schemaVersion, userId: uid, obraId, nome: "Futuro", marcacoes: {},
          });
          await setDoc(doc(admin, legenda.path), { schemaVersion, userId: uid, nome: "Futura", cor: "#123456" });
          await setDoc(doc(admin, kit.path), {
            schemaVersion, userId: uid, obraId, nome: "Futuro", mapaId: "ausente", materiais: [], unidadeIds: [],
          });
        });
        for (const referencia of [mapa, legenda, kit]) {
          const antes = (await getDocFromServer(referencia)).data();
          await assertFails(updateDoc(referencia, { schemaVersion: CURRENT_SCHEMA_VERSION }));
          await assertFails(deleteDoc(referencia));
          assert.deepEqual((await getDocFromServer(referencia)).data(), antes);
        }
      }
    });

    await t.test("mapas e legendas de versões conhecidas continuam excluíveis", async () => {
      for (const schema of [{}, { schemaVersion: 0 }, { schemaVersion: CURRENT_SCHEMA_VERSION }]) {
        const mapa = doc(db, `${base}/mapas/excluir`);
        const legenda = doc(db, `usuarios/${uid}/legendas/excluir`);
        await ambiente.withSecurityRulesDisabled(async (contexto) => {
          await setDoc(doc(contexto.firestore(), mapa.path), { ...schema, userId: uid, obraId, nome: "Mapa", marcacoes: {} });
          await setDoc(doc(contexto.firestore(), legenda.path), { ...schema, userId: uid, nome: "Legenda", cor: "#123456" });
        });
        await assertSucceeds(deleteDoc(mapa));
        await assertSucceeds(deleteDoc(legenda));
      }
    });

    await t.test("exclusão atômica também preserva o par se um lado tiver versão futura", async () => {
      const mapa = doc(db, `${base}/mapas/par`);
      const kit = doc(db, `usuarios/${uid}/kits/par`);
      for (const [versaoMapa, versaoKit] of [[999, 1], [1, 999], [1, 1]]) {
        await ambiente.withSecurityRulesDisabled(async (contexto) => {
          const admin = contexto.firestore();
          await setDoc(doc(admin, mapa.path), {
            schemaVersion: versaoMapa, userId: uid, obraId, nome: "Par", tipo: "kit", kitId: kit.id, kitUnidadeIds: [], marcacoes: {},
          });
          await setDoc(doc(admin, kit.path), {
            schemaVersion: versaoKit, userId: uid, obraId, nome: "Par", mapaId: mapa.id, unidadeIds: [],
            materiais: [{ id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 1 }],
          });
        });
        const lote = writeBatch(db);
        lote.delete(mapa);
        lote.delete(kit);
        if (versaoMapa === 1 && versaoKit === 1) {
          await assertSucceeds(lote.commit());
          assert.equal((await getDocFromServer(mapa)).exists(), false);
          await ambiente.withSecurityRulesDisabled(async (contexto) => {
            assert.equal((await getDocFromServer(doc(contexto.firestore(), kit.path))).exists(), false);
          });
        } else {
          await assertFails(lote.commit());
          assert.equal((await getDocFromServer(mapa)).data().schemaVersion, versaoMapa);
          assert.equal((await getDocFromServer(kit)).data().schemaVersion, versaoKit);
        }
      }
    });

    await t.test("erro de entrada preserva legado e marcador; correção permite retomar a migração", async () => {
      const obra = { id: "obra-material", nome: "Obra do material" };
      const referenciaObra = doc(db, `usuarios/${uid}/obras/${obra.id}`);
      const kit = doc(db, `usuarios/${uid}/kits/material-duplicado`);
      const mapa = doc(db, `${referenciaObra.path}/mapas/material`);
      const material = { id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 1 };
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        await setDoc(doc(contexto.firestore(), kit.path), {
          userId: uid, obraId: obra.id, nome: "Material", materiais: [material, material], unidadeIds: [],
        });
        await setDoc(doc(contexto.firestore(), mapa.path), {
          userId: uid, nome: "Material", marcacoes: { "bloco-01-001": "feito" }, extra: "preservar",
        });
      });
      const antesKit = (await getDocFromServer(kit)).data();
      const antesMapa = (await getDocFromServer(mapa)).data();
      await assert.rejects(migrarObra(db, uid, { ...obra, nome: " " }, true), /Nome inválido/);
      await assert.rejects(migrarObra(db, uid, obra, true), /Materiais inválidos/);
      assert.deepEqual((await getDocFromServer(kit)).data(), antesKit);
      assert.deepEqual((await getDocFromServer(mapa)).data(), antesMapa);
      assert.equal((await getDocFromServer(referenciaObra)).data().schemaVersion, 0);
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        await updateDoc(doc(contexto.firestore(), kit.path), { materiais: [material, { ...material, id: "b" }] });
      });
      await migrarObra(db, uid, obra, true);
      assert.equal((await getDocFromServer(referenciaObra)).data().schemaVersion, CURRENT_SCHEMA_VERSION);
      assert.equal((await getDocFromServer(kit)).data().materiais.length, 2);
      assert.deepEqual((await getDocFromServer(mapa)).data().marcacoes, antesMapa.marcacoes);
      assert.equal((await getDocFromServer(mapa)).data().extra, "preservar");
    });
  } finally {
    await ambiente.cleanup();
  }
});
