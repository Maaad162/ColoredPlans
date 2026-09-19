import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { Bytes, doc, GeoPoint, getDoc, getDocFromServer, runTransaction, setDoc, Timestamp, updateDoc, vector } from "firebase/firestore";
import { conferirDocumentoDaMigracao, migrarObra } from "../src/services/migracoes.ts";
import { CURRENT_SCHEMA_VERSION, OBRA_LEGADA_ID } from "../src/config/dados.ts";

const ambiente = await initializeTestEnvironment({ projectId: "lmcoloredplans" });
const obraLegada = { id: OBRA_LEGADA_ID, nome: "Obra original" };
const obraB = { id: "obra-b", nome: "Obra B" };
const uid = "migracao";
const base = `usuarios/${uid}/obras/${obraLegada.id}`;
const baseB = `usuarios/${uid}/obras/${obraB.id}`;
const antigo = `obras/${obraLegada.id}/mapas/legado`;
const material = { id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 3 };
try {
  await ambiente.clearFirestore();
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await setDoc(doc(db, `usuarios/${uid}`), { userId: uid, tipoConta: "estoque" });
    await setDoc(doc(db, antigo), { criadoPor: uid, nome: "Legado", marcacoes: { "bloco-01-001": "custom" }, extra: "preservar" });
    await setDoc(doc(db, `${base}/mapas/kit-antigo`), { userId: uid, nome: "Kit A", marcacoes: { "bloco-02-001": "custom" } });
    await setDoc(doc(db, `usuarios/${uid}/kits/kit-a`), { userId: uid, nome: "Kit A", materiais: [material], unidadeIds: ["bloco-01-001"] });
    await setDoc(doc(db, `obras/${obraLegada.id}/mapas/global-kit`), { criadoPor: uid, nome: "Kit global", marcacoes: { "bloco-03-001": "custom" } });
    await setDoc(doc(db, `usuarios/${uid}/kits/kit-global`), { userId: uid, nome: "Kit global", materiais: [material], unidadeIds: ["bloco-03-001"] });
    // Outra obra já existe, com IDs de mapas iguais e dados independentes.
    await setDoc(doc(db, baseB), { userId: uid, nome: "Nome cadastrado da obra B", schemaVersion: 0, observacao: "preservar" });
    await setDoc(doc(db, `${baseB}/mapas/kit-antigo`), { userId: uid, nome: "Kit B", marcacoes: { "bloco-02-001": "status-b" } });
    await setDoc(doc(db, `usuarios/${uid}/kits/kit-b`), {
      userId: uid, obraId: obraB.id, nome: "Kit B", mapaId: "kit-antigo",
      materiais: [material], unidadeIds: ["bloco-02-001"],
    });
    await setDoc(doc(db, `obras/${obraB.id}/mapas/legado`), {
      criadoPor: uid, nome: "Legado B", marcacoes: { "bloco-01-001": "status-b" },
    });
  });
  const db = ambiente.authenticatedContext(uid).firestore();
  await Promise.all([migrarObra(db, uid, obraLegada, true), migrarObra(db, uid, obraLegada, true)]);
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
  assert.ok((await getDoc(doc(db, `obras/${obraLegada.id}/mapas/global-kit`))).exists());
  assert.equal((await getDoc(doc(db, base))).data().schemaVersion, CURRENT_SCHEMA_VERSION);
  await updateDoc(doc(db, `${base}/mapas/legado`), { nome: "Editado após migração" });
  await migrarObra(db, uid, obraLegada, true);
  assert.equal((await getDoc(doc(db, `${base}/mapas/legado`))).data().nome, "Editado após migração");
  // Preparar a primeira obra não deve migrar ou marcar a segunda como concluída.
  assert.equal((await getDoc(doc(db, base))).data().nome, obraLegada.nome);
  assert.equal((await getDoc(doc(db, baseB))).data().schemaVersion, 0);
  assert.equal((await getDoc(doc(db, `${baseB}/mapas/kit-antigo`))).data().schemaVersion, undefined);
  assert.equal((await getDoc(doc(db, `usuarios/${uid}/kits/kit-b`))).data().schemaVersion, undefined);
  await migrarObra(db, uid, obraB, true);
  const obraMigradaB = (await getDoc(doc(db, baseB))).data();
  assert.equal(obraMigradaB.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(obraMigradaB.nome, "Nome cadastrado da obra B");
  assert.equal(obraMigradaB.observacao, "preservar");
  assert.equal((await getDoc(doc(db, `usuarios/${uid}/kits/kit-a`))).data().obraId, obraLegada.id);
  assert.deepEqual((await getDoc(doc(db, `${base}/mapas/kit-antigo`))).data(), mapa.data());
  assert.deepEqual((await getDoc(doc(db, `usuarios/${uid}/kits/kit-a`))).data(), kit.data());
  const mapaB = (await getDoc(doc(db, `${baseB}/mapas/kit-antigo`))).data();
  assert.equal(mapaB.obraId, obraB.id);
  assert.equal(mapaB.kitId, "kit-b");
  assert.equal(mapaB.marcacoes["bloco-02-001"], "status-b");
  assert.equal((await getDoc(doc(db, `${baseB}/mapas/legado`))).data().marcacoes["bloco-01-001"], "status-b");
  assert.equal((await getDoc(doc(db, `${base}/mapas/legado`))).data().marcacoes["bloco-01-001"], "custom");
  assert.ok((await getDoc(doc(db, `obras/${obraB.id}/mapas/legado`))).exists());
  assert.ok((await getDoc(doc(db, antigo))).exists());
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

  const referencia = doc(db, `${base}/mapas/comparacao`);
  await setDoc(referencia, { userId: uid, obraId: obraLegada.id, schemaVersion: 1,
    nome: "Comparação", marcacoes: { "bloco-01-001": "custom", "bloco-02-001": "custom" },
    criadoEm: new Timestamp(123, 456000), extra: { a: 1, b: 2, lista: ["a", "b"],
      referencia: doc(db, base), local: new GeoPoint(-23, -46), bytes: Bytes.fromUint8Array(new Uint8Array([1, 2])),
      vetor: vector([1, 2]),
    },
  });
  const original = await getDocFromServer(referencia);
  // Simula outra ordem na representação JS, preservando o snapshot e seus valores.
  const inverterChaves = (valor) => Array.isArray(valor) ? valor.map(inverterChaves)
    : valor && Object.getPrototypeOf(valor) === Object.prototype
      ? Object.fromEntries(Object.entries(valor).reverse().map(([chave, item]) => [chave, inverterChaves(item)]))
      : valor;
  const dados = original.data();
  original.data = () => inverterChaves(dados);
  await runTransaction(db, async (transacao) => {
    const atual = await transacao.get(referencia);
    assert.notEqual(JSON.stringify(atual.data()), JSON.stringify(original.data()));
    assert.deepEqual(atual.data(), original.data());
    assert.doesNotThrow(() => conferirDocumentoDaMigracao(atual, original));
  });
  await updateDoc(referencia, { "marcacoes.bloco-01-001": "alterado" });
  const alterado = await getDocFromServer(referencia);
  assert.throws(() => conferirDocumentoDaMigracao(alterado, original), /Dados alterados/);
  assert.throws(() => conferirDocumentoDaMigracao(alterado), /Dados alterados/);
  const ausente = await getDocFromServer(doc(db, `${base}/mapas/inexistente`));
  assert.doesNotThrow(() => conferirDocumentoDaMigracao(ausente));
  assert.throws(() => conferirDocumentoDaMigracao(ausente, original), /Dados alterados/);
  for (const alteracao of [
    { "extra.lista": ["b", "a"] },
    { criadoEm: new Timestamp(123, 457000) },
    { "extra.referencia": doc(db, `${base}/mapas/outro`) },
    { "extra.local": new GeoPoint(-24, -46) },
    { "extra.bytes": Bytes.fromUint8Array(new Uint8Array([2, 1])) },
    { "extra.vetor": vector([2, 1]) },
  ]) {
    const antes = await getDocFromServer(referencia);
    await updateDoc(referencia, alteracao);
    const depois = await getDocFromServer(referencia);
    assert.notDeepEqual(depois.data(), antes.data(), `A alteração deve persistir: ${Object.keys(alteracao)}`);
    assert.throws(() => conferirDocumentoDaMigracao(depois, antes), /Dados alterados/);
  }
  console.log("OK: migração real, fontes preservadas, idempotência, execução simultânea e isolamento de obra.");
} finally {
  await ambiente.cleanup();
}
