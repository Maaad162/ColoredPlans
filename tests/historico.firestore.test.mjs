import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { gravarComHistorico, historicoCollection } from '../src/services/historico.ts';

test('histórico operacional: serviços reais, atomicidade e permissões', async t => {
  const ambiente = await initializeTestEnvironment({ projectId: 'demo-coloredplans' });
  const obraId = 'obra-historico';
  const modelo = (uid, id = 'pintura') => ({ id, userId: uid, obraId, schemaVersion: 1, nome: 'Pintura',
    tipo: 'manual', kitUnidadeIds: [], marcacoes: {}, criadoEm: '2026-01-01' });
  const referencia = (db, uid, id = 'pintura') => doc(db, `usuarios/${uid}/obras/${obraId}/mapas/${id}`);
  const eventos = (db, uid) => getDocs(query(historicoCollection(db, uid, obraId), where('userId', '==', uid), where('obraId', '==', obraId)));
  try {
    await ambiente.clearFirestore();
    await ambiente.withSecurityRulesDisabled(async c => {
      for (const role of ['apontamento', 'estoque']) {
        await setDoc(doc(c.firestore(), `usuarios/${role}`), { userId: role, tipoConta: role, schemaVersion: 1 });
        await setDoc(doc(c.firestore(), `usuarios/${role}/obras/${obraId}`), { userId: role, nome: "Obra hist?rica", schemaVersion: 1 });
      }
    });
    for (const uid of ['apontamento', 'estoque']) await t.test(`${uid}: ciclo do mapa e uma ação agrupada geram eventos consistentes`, async () => {
      const db = ambiente.authenticatedContext(uid).firestore();
      let mapa = modelo(uid);
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'criar', mapa }));
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa, unidadeId: 'bloco-01-001', status: 'feito' }));
      mapa = { ...mapa, ...(await getDoc(referencia(db, uid))).data() };
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'marcacoes', mapa,
        marcacoes: { 'bloco-01-001': 'revisao', 'bloco-02-001': 'feito' } }));
      mapa = { ...mapa, ...(await getDoc(referencia(db, uid))).data() };
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'renomear', mapa, nome: 'Pintura final' }));
      mapa = { ...mapa, ...(await getDoc(referencia(db, uid))).data() };
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa, unidadeId: 'bloco-01-001', status: 'revisao' }));
      assert.equal((await eventos(db, uid)).size, 4, 'ação sem mudança não gera evento');
      await assertSucceeds(gravarComHistorico(db, uid, obraId, { acao: 'excluir', mapa }));
      assert.equal((await getDoc(referencia(db, uid))).exists(), false);
      const historico = await eventos(db, uid);
      assert.equal(historico.size, 5);
      const grupo = historico.docs.find(d => d.data().acao === 'marcacoes').data();
      assert.deepEqual(grupo.unidadeIds.sort(), ['bloco-01-001', 'bloco-02-001']);
      assert.equal(grupo.antes['bloco-01-001'], 'feito');
      assert.equal(grupo.depois['bloco-01-001'], 'revisao');
      for (const d of historico.docs) {
        assert.equal(d.data().userId, uid); assert.ok(d.data().criadoEm.toDate());
        await assertFails(updateDoc(d.ref, { mapaNome: 'falso' }));
        await assertFails(deleteDoc(d.ref));
      }
    });
    const uid = 'apontamento', db = ambiente.authenticatedContext(uid).firestore();
    await t.test('unidades distintas coexistem; estado anterior divergente rejeita todo o lote', async () => {
      const mapa = modelo(uid, 'concorrente');
      await gravarComHistorico(db, uid, obraId, { acao: 'criar', mapa });
      await gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa, unidadeId: 'bloco-01-001', status: 'feito' });
      await gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa, unidadeId: 'bloco-02-001', status: 'feito' });
      const quantidade = (await eventos(db, uid)).size;
      await assertFails(gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa, unidadeId: 'bloco-01-001', status: 'revisao' }));
      const atual = (await getDoc(referencia(db, uid, mapa.id))).data();
      assert.deepEqual(atual.marcacoes, { 'bloco-01-001': 'feito', 'bloco-02-001': 'feito' });
      assert.equal((await eventos(db, uid)).size, quantidade);
      await gravarComHistorico(db, uid, obraId, { acao: 'unidade', mapa: { ...mapa, ...atual }, unidadeId: 'bloco-01-001', status: 'revisao' });
      assert.equal((await eventos(db, uid)).size, quantidade + 1);
    });
    await t.test('evento isolado, autoria, obra, timestamp e conteúdo falsos são recusados', async () => {
      const ref = referencia(db, uid, 'concorrente');
      const atual = (await getDoc(ref)).data();
      const base = { schemaVersion: 1, userId: uid, obraId, mapaId: ref.id, mapaNome: atual.nome, acao: 'unidade',
        unidadeIds: ['bloco-01-001'], antes: { 'bloco-01-001': 'revisao' }, depois: { 'bloco-01-001': 'novo' },
        nomeAnterior: atual.nome, nomeAtual: atual.nome, criadoEm: serverTimestamp() };
      await assertFails(setDoc(doc(historicoCollection(db, uid, obraId)), base));
      for (const patch of [{ userId: 'estoque' }, { obraId: 'outra' }, { schemaVersion: 999 }, { criadoEm: new Date(0) },
        { antes: { 'bloco-01-001': 'inventado' } }, { depois: { 'bloco-01-001': 'diferente' } }, { campoInesperado: true },
        { unidadeIds: ['bloco-02-001'] }]) {
        const evento = doc(historicoCollection(db, uid, obraId));
        const lote = writeBatch(db);
        lote.update(ref, { 'marcacoes.bloco-01-001': 'novo', ultimoEventoId: evento.id });
        lote.set(evento, { ...base, ...patch });
        await assertFails(lote.commit());
        assert.equal((await getDoc(ref)).data().marcacoes['bloco-01-001'], 'revisao');
      }
    });
    await t.test('leituras isoladas por conta e obra; sem perfil e anônimo não acessam histórico', async () => {
      const evento = (await eventos(db, uid)).docs[0];
      for (const intruso of [ambiente.authenticatedContext('estoque').firestore(), ambiente.authenticatedContext('sem-perfil').firestore(), ambiente.unauthenticatedContext().firestore()]) {
        await assertFails(getDoc(doc(intruso, evento.ref.path)));
        await assertFails(setDoc(doc(intruso, evento.ref.path), evento.data()));
      }
      const consultaOutra = query(historicoCollection(db, uid, 'obra-vazia'), where('userId', '==', uid), where('obraId', '==', 'obra-vazia'));
      await assertFails(getDocs(consultaOutra));
      await ambiente.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `usuarios/${uid}/obras/obra-vazia`), { userId: uid, nome: 'Obra vazia', schemaVersion: 1 }));
      assert.equal((await assertSucceeds(getDocs(consultaOutra))).size, 0);
    });
    await t.test('criação com ID existente não sobrescreve marcações', async () => {
      const mapa = modelo(uid, 'concorrente');
      const antes = (await getDoc(referencia(db, uid, mapa.id))).data();
      await assertFails(gravarComHistorico(db, uid, obraId, { acao: 'criar', mapa }));
      assert.deepEqual((await getDoc(referencia(db, uid, mapa.id))).data(), antes);
    });
  } finally { await ambiente.cleanup(); }
});
