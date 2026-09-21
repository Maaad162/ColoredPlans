import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { salvarContexto } from '../src/services/contextos.ts';

test('contexto operacional é atômico, isolado e protegido pelas regras', async t => {
  const ambiente = await initializeTestEnvironment({ projectId: 'demo-coloredplans' });
  const obraId = 'obra-contexto';
  const mapa = uid => ({ id: 'hidraulica', userId: uid, obraId, schemaVersion: 1, nome: 'Hidráulica', tipo: 'manual', kitUnidadeIds: [], marcacoes: {}, criadoEm: '2026-01-01' });
  try {
    await ambiente.clearFirestore();
    await ambiente.withSecurityRulesDisabled(async c => {
      for (const role of ['apontamento', 'estoque', 'outro']) {
        await setDoc(doc(c.firestore(), `usuarios/${role}`), { userId: role, tipoConta: role === 'outro' ? 'apontamento' : role, schemaVersion: 1 });
        await setDoc(doc(c.firestore(), `usuarios/${role}/obras/${obraId}`), { userId: role, nome: "Obra contexto", schemaVersion: 1 });
        await setDoc(doc(c.firestore(), `usuarios/${role}/obras/${obraId}/mapas/hidraulica`), mapa(role));
      }
    });
    for (const uid of ['apontamento', 'estoque']) await t.test(`${uid} grava observação e responsável com evento imutável`, async () => {
      const db = ambiente.authenticatedContext(uid).firestore();
      await assertSucceeds(salvarContexto(db, uid, obraId, mapa(uid), 'bloco-01-001', { observacao: '', responsavel: '' },
        { observacao: 'Aguardando registro.', responsavel: 'Equipe hidráulica' }));
      const contexto = await getDoc(doc(db, `usuarios/${uid}/obras/${obraId}/mapas/hidraulica/contextos/bloco-01-001`));
      assert.equal(contexto.data().observacao, 'Aguardando registro.');
      const evento = await getDoc(doc(db, `usuarios/${uid}/obras/${obraId}/historico/${contexto.data().ultimoEventoId}`));
      assert.equal(evento.data().acao, 'contexto'); assert.ok(evento.data().criadoEm.toDate());
      await assertFails(updateDoc(evento.ref, { observacao: 'forjada' }));
    });
    const db = ambiente.authenticatedContext('apontamento').firestore();
    await t.test('write isolado, sem evento e conteúdo excessivo são negados', async () => {
      await assertFails(setDoc(doc(db, `usuarios/apontamento/obras/${obraId}/mapas/hidraulica/contextos/bloco-02-001`), {
        schemaVersion: 1, userId: 'apontamento', obraId, mapaId: 'hidraulica', unidadeId: 'bloco-02-001', observacao: 'sem evento',
        responsavel: '', atualizadoEm: new Date(), atualizadoPor: 'apontamento', ultimoEventoId: 'inexistente',
      }));
      assert.throws(() => salvarContexto(db, 'apontamento', obraId, mapa('apontamento'), 'bloco-02-001', { observacao: '', responsavel: '' },
        { observacao: 'x'.repeat(241), responsavel: '' }));
      await assertFails(getDoc(doc(db, `usuarios/outro/obras/${obraId}/mapas/hidraulica/contextos/bloco-01-001`)));
    });
  } finally { await ambiente.cleanup(); }
});
