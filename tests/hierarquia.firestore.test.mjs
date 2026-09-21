import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { gravarComHistorico } from '../src/services/historico.ts';
import { salvarContexto } from '../src/services/contextos.ts';

test('hierarquia: obras autorizadas, plantas independentes e templates administrativos', async t => {
  const ambiente = await initializeTestEnvironment({ projectId: 'demo-coloredplans' });
  const uid = 'multi', base = `usuarios/${uid}/obras`, ids = ['apt-042', 'apt-043'];
  const modelo = (obraId, plantaId) => ({ id: `pintura-${plantaId}`, userId: uid, obraId, plantaId, schemaVersion: 1,
    nome: 'Pintura', tipo: 'manual', kitUnidadeIds: [], marcacoes: {}, criadoEm: '2026-01-01' });
  const refMapa = (db, mapa) => doc(db, `${base}/${mapa.obraId}/mapas/${mapa.id}`);
  try {
    await ambiente.clearFirestore();
    await ambiente.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore(), `usuarios/${uid}`), { userId: uid, tipoConta: 'estoque', schemaVersion: 1 });
      await setDoc(doc(c.firestore(), 'usuarios/intruso'), { userId: 'intruso', tipoConta: 'estoque', schemaVersion: 1 });
      for (const obra of ['a', 'b']) {
        await setDoc(doc(c.firestore(), `${base}/${obra}`), { userId: uid, nome: obra, schemaVersion: 1, plantaLegada: false });
        await setDoc(doc(c.firestore(), `${base}/${obra}/templates/tipo`), { schemaVersion: 1, unidadeIds: ids });
        for (const planta of ['torre-a', 'torre-b']) await setDoc(doc(c.firestore(), `${base}/${obra}/plantas/${planta}`), { schemaVersion: 1, nome: planta, templateId: 'tipo' });
      }
      await setDoc(doc(c.firestore(), `${base}/proibida`), { userId: 'intruso', nome: 'Proibida', schemaVersion: 1 });
    });
    const db = ambiente.authenticatedContext(uid).firestore();
    await t.test('templates e obras só podem ser provisionados administrativamente', async () => {
      await assertSucceeds(getDoc(doc(db, `${base}/a/templates/tipo`)));
      await assertFails(setDoc(doc(db, `${base}/inventada`), { schemaVersion: 1, userId: uid, nome: 'Inventada' }));
      await assertFails(updateDoc(doc(db, `${base}/a`), { status: 'arquivada' }));
      await assertFails(setDoc(doc(db, `${base}/obra-principal`), { schemaVersion: 1, userId: uid, nome: 'Principal' }));
      await assertFails(deleteDoc(doc(db, `${base}/a`)));
      await assertFails(setDoc(doc(db, `${base}/a/plantas/inventada`), { nome: 'Inventada', templateId: 'tipo' }));
      await assertFails(updateDoc(doc(db, `${base}/a/templates/tipo`), { unidadeIds: ['forjada'] }));
      await assertFails(setDoc(doc(db, `${base}/a/membros/${uid}`), { role: 'admin' }));
      await assertFails(getDocs(collection(db, `${base}/proibida/plantas`)));
      await assertFails(getDoc(doc(db, `${base}/proibida/templates/tipo`)));
      await assertFails(gravarComHistorico(db, uid, 'proibida', { acao: 'criar', mapa: modelo('proibida', 'torre-a') }, ids));
    });
    await t.test('mesma unidade e template mantêm estados independentes em obras e plantas', async () => {
      for (const obra of ['a', 'b']) for (const planta of ['torre-a', 'torre-b']) {
        const mapa = modelo(obra, planta);
        await gravarComHistorico(db, uid, obra, { acao: 'criar', mapa }, ids);
      }
      const mapa = modelo('a', 'torre-a');
      await assertSucceeds(gravarComHistorico(db, uid, 'a', { acao: 'unidade', mapa, unidadeId: 'apt-042', status: 'feito' }, ids));
      assert.equal((await getDoc(refMapa(db, mapa))).data().marcacoes['apt-042'], 'feito');
      assert.deepEqual((await getDoc(refMapa(db, modelo('a', 'torre-b')))).data().marcacoes, {});
      assert.deepEqual((await getDoc(refMapa(db, modelo('b', 'torre-a')))).data().marcacoes, {});
      await assertFails(updateDoc(refMapa(db, mapa), { plantaId: 'torre-b' }));
      await assertFails(updateDoc(refMapa(db, mapa), { 'marcacoes.forjada': 'feito' }));
      await assertFails(gravarComHistorico(db, uid, 'a', { acao: 'criar', mapa: modelo('a', 'inexistente') }, ids));
      const intruso = ambiente.authenticatedContext('intruso').firestore();
      await assertFails(getDoc(doc(intruso, refMapa(db, mapa).path)));
      await assertFails(getDocs(collection(intruso, `${base}/a/historico`)));
    });
    await t.test('equipe precisa existir na obra e sua alteração gera evento', async () => {
      const mapa = modelo('b', 'torre-a');
      await assertFails(gravarComHistorico(db, uid, 'b', { acao: 'equipe', mapa, equipeId: 'hid' }, ids));
      await ambiente.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), base + '/b/equipes/hid'), { schemaVersion: 1, nome: 'Hidráulica' }));
      await assertSucceeds(gravarComHistorico(db, uid, 'b', { acao: 'equipe', mapa, equipeId: 'hid' }, ids));
      const atualizado = (await getDoc(refMapa(db, mapa))).data();
      assert.equal(atualizado.equipeId, 'hid');
      const evento = await getDoc(doc(db, base + '/b/historico/' + atualizado.ultimoEventoId));
      assert.equal(evento.data().acao, 'equipe'); assert.equal(evento.data().depois.equipeId, 'hid');
    });
    await t.test('contexto e evento conservam planta e rejeitam escritas sem vínculo real', async () => {
      const mapa = modelo('a', 'torre-a');
      await assertSucceeds(salvarContexto(db, uid, 'a', mapa, 'apt-042', { observacao: '', responsavel: '' }, { observacao: 'Falta registro', responsavel: 'Equipe H' }, ids));
      const contexto = await getDoc(doc(db, `${base}/a/mapas/${mapa.id}/contextos/apt-042`));
      const evento = await getDoc(doc(db, `${base}/a/historico/${contexto.data().ultimoEventoId}`));
      assert.equal(evento.data().plantaId, 'torre-a');
      await assertFails(updateDoc(contexto.ref, { observacao: 'sem novo evento', atualizadoEm: serverTimestamp() }));
      assert.equal((await getDoc(doc(db, `${base}/a/mapas/pintura-torre-b/contextos/apt-042`))).exists(), false);
      await assertFails(salvarContexto(db, uid, 'a', { ...mapa, id: 'ausente' }, 'apt-042', { observacao: '', responsavel: '' }, { observacao: 'Falso', responsavel: '' }, ids));
    });
    await t.test('kit e mapa precisam pertencer à mesma planta', async () => {
      const kitRef = doc(db, `usuarios/${uid}/kits/kit-a`), mapaRef = doc(db, `${base}/a/mapas/kit-a`);
      const kit = { schemaVersion: 1, userId: uid, obraId: 'a', plantaId: 'torre-a', nome: 'Kit', mapaId: 'kit-a', unidadeIds: ids, materiais: [{ id: 'm', descricao: 'Registro', quantidadePorKit: 1 }] };
      const mapa = { ...modelo('a', 'torre-a'), nome: 'Kit', tipo: 'kit', kitId: 'kit-a', kitUnidadeIds: ids };
      let lote = writeBatch(db); lote.set(kitRef, kit); lote.set(mapaRef, { ...mapa, plantaId: 'torre-b' }); await assertFails(lote.commit());
      lote = writeBatch(db); lote.set(kitRef, kit); lote.set(mapaRef, mapa); await assertSucceeds(lote.commit());
      await assertFails(updateDoc(kitRef, { plantaId: 'torre-b' }));
      await ambiente.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `usuarios/${uid}/kits/proibido`), { ...kit, obraId: 'proibida' }));
      await assertFails(getDoc(doc(db, `usuarios/${uid}/kits/proibido`)));
    });
  } finally { await ambiente.cleanup(); }
});
