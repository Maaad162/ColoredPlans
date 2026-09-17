import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { migrarObra } from "../src/services/migracoes.ts";
import { CURRENT_SCHEMA_VERSION, OBRA_PADRAO } from "../src/config/dados.ts";

const ambiente = await initializeTestEnvironment({ projectId: "lmcoloredplans" });
const uid = "migracao";
const base = `usuarios/${uid}/obras/${OBRA_PADRAO.id}`;
const antigo = `obras/${OBRA_PADRAO.id}/mapas/legado`;
const material = { id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 3 };
try {
  await ambiente.clearFirestore();
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await setDoc(doc(db, `usuarios/${uid}`), { userId: uid, tipoConta: "estoque" });
    await setDoc(doc(db, antigo), { criadoPor: uid, nome: "Legado", marcacoes: { "bloco-01-001": "custom" }, extra: "preservar" });
    await setDoc(doc(db, `${base}/mapas/kit-antigo`), { userId: uid, nome: "Kit A", marcacoes: { "bloco-02-001": "custom" } });
    await setDoc(doc(db, `usuarios/${uid}/kits/kit-a`), { userId: uid, nome: "Kit A", materiais: [material], unidadeIds: ["bloco-01-001"] });
    await setDoc(doc(db, `obras/${OBRA_PADRAO.id}/mapas/global-kit`), { criadoPor: uid, nome: "Kit global", marcacoes: { "bloco-03-001": "custom" } });
    await setDoc(doc(db, `usuarios/${uid}/kits/kit-global`), { userId: uid, nome: "Kit global", materiais: [material], unidadeIds: ["bloco-03-001"] });
  });
  const db = ambiente.authenticatedContext(uid).firestore();
  await Promise.all([migrarObra(db, uid, OBRA_PADRAO, true), migrarObra(db, uid, OBRA_PADRAO, true)]);
  const copiado = await getDoc(doc(db, `${base}/mapas/legado`));
  assert.equal(copiado.data().extra, "preservar");
  assert.equal(copiado.data().marcacoes["bloco-01-001"], "custom");
  assert.ok((await getDoc(doc(db, antigo))).exists());
  const kit = await getDoc(doc(db, `usuarios/${uid}/kits/kit-a`));
  const mapa = await getDoc(doc(db, `${base}/mapas/kit-antigo`));
  assert.equal(kit.data().mapaId, mapa.id);
  assert.equal(mapa.data().marcacoes["bloco-02-001"], "custom");
  const mapaGlobal = await getDoc(doc(db, `${base}/mapas/global-kit`));
  assert.equal(mapaGlobal.data().kitId, "kit-global");
  assert.equal(mapaGlobal.data().marcacoes["bloco-03-001"], "custom");
  assert.ok((await getDoc(doc(db, `obras/${OBRA_PADRAO.id}/mapas/global-kit`))).exists());
  assert.equal((await getDoc(doc(db, base))).data().schemaVersion, CURRENT_SCHEMA_VERSION);
  await updateDoc(doc(db, `${base}/mapas/legado`), { nome: "Editado após migração" });
  await migrarObra(db, uid, OBRA_PADRAO, true);
  assert.equal((await getDoc(doc(db, `${base}/mapas/legado`))).data().nome, "Editado após migração");
  const obraB = { id: "obra-b", nome: "Obra B" };
  await migrarObra(db, uid, obraB, true);
  assert.equal((await getDoc(doc(db, `usuarios/${uid}/obras/${obraB.id}`))).data().schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal((await getDoc(doc(db, `usuarios/${uid}/kits/kit-a`))).data().obraId, OBRA_PADRAO.id);
  // Um conflito deve impedir o plano inteiro e preservar ambas as fontes.
  const obraConflito = { id: "obra-conflito", nome: "Conflito" };
  const caminhoConflito = `usuarios/${uid}/obras/${obraConflito.id}`;
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const admin = contexto.firestore();
    await setDoc(doc(admin, `${caminhoConflito}/mapas/repetido`), { userId: uid, nome: "Atual", marcacoes: { "bloco-01-001": "atual" } });
    await setDoc(doc(admin, `obras/${obraConflito.id}/mapas/repetido`), { criadoPor: uid, nome: "Antigo", marcacoes: { "bloco-01-001": "antigo" } });
  });
  await assert.rejects(migrarObra(db, uid, obraConflito, true), /Conflito/);
  assert.equal((await getDoc(doc(db, `${caminhoConflito}/mapas/repetido`))).data().marcacoes["bloco-01-001"], "atual");
  assert.equal((await getDoc(doc(db, `obras/${obraConflito.id}/mapas/repetido`))).data().marcacoes["bloco-01-001"], "antigo");
  assert.equal((await getDoc(doc(db, caminhoConflito))).exists(), false);
  console.log("OK: migração real, fontes preservadas, idempotência, execução simultânea e isolamento de obra.");
} finally {
  await ambiente.cleanup();
}
