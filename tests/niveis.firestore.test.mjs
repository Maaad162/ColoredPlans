import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, documentId, getDocFromServer, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { gravarComHistorico } from '../src/services/historico.ts';
import { salvarContexto } from '../src/services/contextos.ts';
import { garantirMapaInicial } from '../src/services/inicializarMapa.ts';

const espaco = 'nivel-espaco-a', outroEspaco = 'nivel-espaco-b';
const obra = 'obra-principal', outraObra = 'obra-isolada';
const niveis = ['tecnico', 'engenheiro', 'coordenador', 'gestor', 'dev'];
const unidade = 'bloco-01-001';
const uid = (nivel, estoque = false) => `nivel-${nivel}${estoque ? '-estoque' : ''}`;
const perfil = (nivel, estoque = false) => ({
  schemaVersion: 2, userId: uid(nivel, estoque), email: `${uid(nivel, estoque)}@teste.invalid`,
  tipoConta: estoque ? 'estoque' : 'apontamento', nivel, espacoId: espaco,
  superiorId: nivel === 'dev' ? null : uid(niveis[niveis.indexOf(nivel) + 1]),
  obraIds: ['gestor', 'dev'].includes(nivel) ? [] : [obra],
});
const obraPath = (obraId = obra, espacoId = espaco) => `usuarios/${espacoId}/obras/${obraId}`;
const modelo = (id, obraId = obra, espacoId = espaco) => ({
  id, schemaVersion: 1, userId: espacoId, obraId, nome: `Mapa ${id}`,
  tipo: 'manual', kitUnidadeIds: [], marcacoes: {},
});
const mapaRef = (db, mapa) => doc(db, `${obraPath(mapa.obraId, mapa.userId)}/mapas/${mapa.id}`);
const acao = (db, usuario, mapa, comando) => gravarComHistorico(db, espaco, mapa.obraId, { mapa, ...comando }, undefined, usuario);

function criarKit(db, usuario, id, obraId = obra, patch = {}) {
  const lote = writeBatch(db);
  const comum = { schemaVersion: 1, userId: espaco, obraId, nome: `Kit ${id}`, atualizadoEm: serverTimestamp(), atualizadoPor: usuario };
  lote.set(doc(db, `usuarios/${espaco}/kits/${id}`), {
    ...comum, mapaId: id, unidadeIds: [], materiais: [{ id: 'm', descricao: 'Registro', quantidadePorKit: 1 }],
  });
  lote.set(doc(db, `${obraPath(obraId)}/mapas/${id}`), {
    ...comum, tipo: 'kit', kitId: id, kitUnidadeIds: [], marcacoes: {}, criadoPor: usuario, ...patch,
  });
  return lote.commit();
}

test('níveis: autorização real, colaboração e isolamento do espaço compartilhado', async t => {
  const ambiente = await initializeTestEnvironment({ projectId: 'demo-coloredplans' });
  const dbDe = (nivel, estoque = false) => ambiente.authenticatedContext(uid(nivel, estoque)).firestore();
  const admin = tarefa => ambiente.withSecurityRulesDisabled(c => tarefa(c.firestore()));
  try {
    await ambiente.clearFirestore();
    await admin(async db => {
      for (const nivel of niveis) for (const estoque of [false, true]) {
        const dados = perfil(nivel, estoque);
        await setDoc(doc(db, `usuarios/${dados.userId}`), dados);
        await setDoc(mapaRef(db, modelo(`permissoes-${dados.userId}`)), { ...modelo(`permissoes-${dados.userId}`), criadoPor: dados.userId });
      }
      await setDoc(doc(db, 'usuarios/dev-outro-espaco'), { ...perfil('dev'), userId: 'dev-outro-espaco', espacoId: outroEspaco });
      for (const espacoId of [espaco, outroEspaco]) for (const obraId of [obra, outraObra]) {
        await setDoc(doc(db, obraPath(obraId, espacoId)), { schemaVersion: 1, userId: espacoId, nome: obraId === obra ? 'Jardim das Tulipas I' : 'Obra isolada de teste' });
        await setDoc(mapaRef(db, modelo('comum', obraId, espacoId)), modelo('comum', obraId, espacoId));
        await setDoc(doc(db, `${obraPath(obraId, espacoId)}/plantas/planta-principal`), { schemaVersion: 1, nome: 'Planta', templateId: 'original-v1' });
        await setDoc(doc(db, `${obraPath(obraId, espacoId)}/equipes/equipe`), { schemaVersion: 1, nome: 'Equipe' });
      }
    });

    await t.test('obras atribuídas são explícitas; gestor e DEV consultam todas somente no próprio espaço', async () => {
      for (const nivel of niveis) {
        const db = dbDe(nivel), global = ['gestor', 'dev'].includes(nivel);
        await assertSucceeds(getDocFromServer(doc(db, obraPath())));
        await assertSucceeds(getDocFromServer(mapaRef(db, modelo('comum'))));
        await assertSucceeds(getDocs(query(collection(db, `${obraPath()}/mapas`), where('userId', '==', espaco))));
        await assertSucceeds(getDocs(collection(db, `${obraPath()}/plantas`)));
        await (global ? assertSucceeds : assertFails)(getDocFromServer(doc(db, obraPath(outraObra))));
        await (global ? assertSucceeds : assertFails)(getDocs(query(collection(db, `usuarios/${espaco}/obras`), where('userId', '==', espaco))));
        await assertSucceeds(getDocs(query(collection(db, `usuarios/${espaco}/obras`), where('userId', '==', espaco), where(documentId(), 'in', [obra]))));
        await assertFails(getDocFromServer(doc(db, obraPath(obra, outroEspaco))));
        await assertFails(getDocFromServer(mapaRef(db, modelo('comum', obra, outroEspaco))));
        await assertFails(getDocs(collection(db, `${obraPath(obra, outroEspaco)}/plantas`)));
        await assertFails(setDoc(doc(db, obraPath('inventada')), { schemaVersion: 1, userId: espaco, nome: 'Inventada' }));
        await assertFails(updateDoc(doc(db, obraPath()), { nome: 'Alteração administrativa indevida' }));
        await assertFails(setDoc(doc(db, `${obraPath()}/membros/${uid(nivel)}`), { nivel: 'dev' }));
      }
    });

    for (const nivel of niveis) await t.test(`${nivel}: escritas diretas e do serviço respeitam a matriz de permissões`, async () => {
      const db = dbDe(nivel), usuario = uid(nivel), podeApontar = ['tecnico', 'dev'].includes(nivel);
      const podeGerenciar = ['tecnico', 'engenheiro', 'dev'].includes(nivel);
      let mapa = modelo(`permissoes-${usuario}`);
      await (podeApontar ? assertSucceeds : assertFails)(acao(db, usuario, mapa, { acao: 'unidade', unidadeId: unidade, status: 'feito' }));
      mapa = { ...mapa, ...(await getDocFromServer(mapaRef(db, mapa))).data() };
      await assertFails(updateDoc(mapaRef(db, mapa), { [`marcacoes.${unidade}`]: 'sem-historico', atualizadoEm: serverTimestamp(), atualizadoPor: usuario }));
      await (podeApontar ? assertSucceeds : assertFails)(salvarContexto(db, espaco, obra, mapa, unidade,
        { observacao: '', responsavel: '' }, { observacao: `Apontado por ${nivel}`, responsavel: 'Equipe' }, undefined, usuario));
      await (podeGerenciar ? assertSucceeds : assertFails)(acao(db, usuario, mapa, { acao: 'renomear', nome: 'Nome atualizado' }));
      mapa = { ...mapa, ...(await getDocFromServer(mapaRef(db, mapa))).data() };
      await (podeGerenciar ? assertSucceeds : assertFails)(acao(db, usuario, mapa, { acao: 'equipe', equipeId: 'equipe' }));
      await (podeGerenciar ? assertSucceeds : assertFails)(acao(db, usuario, modelo(`criado-${usuario}`), { acao: 'criar' }));
      await assertFails(setDoc(mapaRef(db, modelo(`sem-historico-${usuario}`)), {
        ...modelo(`sem-historico-${usuario}`), criadoPor: usuario, atualizadoPor: usuario, atualizadoEm: serverTimestamp(),
      }));
      mapa = { ...mapa, ...(await getDocFromServer(mapaRef(db, mapa))).data() };
      await (podeGerenciar ? assertSucceeds : assertFails)(acao(db, usuario, mapa, { acao: 'excluir' }));
      const consultaHistorico = query(collection(db, `${obraPath()}/historico`), where('userId', '==', espaco), where('obraId', '==', obra));
      await assertSucceeds(getDocs(consultaHistorico));
      if (!podeGerenciar) await assertFails(deleteDoc(mapaRef(db, modelo('comum'))));
      await (nivel === 'dev' ? assertSucceeds : assertFails)(acao(db, usuario, modelo('comum', outraObra), { acao: 'unidade', unidadeId: unidade, status: 'teste-de-escopo' }));
    });

    await t.test('Engenheiro consulta os dois setores e não altera mapas de Técnicos nem assume autoria', async () => {
      for (const estoque of [false, true]) {
        const tecnico = dbDe('tecnico', estoque), autor = uid('tecnico', estoque);
        const mapa = modelo(`mapa-supervisionado-${autor}`);
        await assertSucceeds(acao(tecnico, autor, mapa, { acao: 'criar' }));
        await assertSucceeds(acao(tecnico, autor, mapa, { acao: 'unidade', unidadeId: unidade, status: 'feito' }));
        const salvo = (await getDocFromServer(mapaRef(tecnico, mapa))).data();
        const atual = { ...mapa, ...salvo };
        for (const setor of [false, true]) {
          const db = dbDe('engenheiro', setor), engenheiro = uid('engenheiro', setor);
          await assertSucceeds(getDocFromServer(mapaRef(db, mapa)));
          for (const comando of [{ acao: 'renomear', nome: 'Alterado' }, { acao: 'excluir' },
            { acao: 'equipe', equipeId: 'equipe' }, { acao: 'unidade', unidadeId: unidade, status: 'indevido' },
            { acao: 'marcacoes', marcacoes: {} }]) await assertFails(acao(db, engenheiro, atual, comando));
          await assertFails(updateDoc(mapaRef(db, mapa), { criadoPor: engenheiro }));
          await assertFails(salvarContexto(db, espaco, obra, atual, unidade, { observacao: '', responsavel: '' },
            { observacao: 'Indevida', responsavel: '' }, undefined, engenheiro));
          await assertFails(acao(db, engenheiro, modelo('comum'), { acao: 'renomear', nome: 'Sem autoria' }));
          await assertFails(deleteDoc(mapaRef(db, modelo('comum'))));
        }
        assert.deepEqual((await getDocFromServer(mapaRef(tecnico, mapa))).data(), salvo);
      }
    });

    await t.test('autoria real e histórico atômico: não aceita autor falso, evento isolado ou replay', async () => {
      const db = dbDe('tecnico'), usuario = uid('tecnico'), mapa = modelo('comum');
      await assertFails(acao(db, uid('engenheiro'), mapa, { acao: 'unidade', unidadeId: unidade, status: 'falso' }));
      await assertSucceeds(acao(db, usuario, mapa, { acao: 'unidade', unidadeId: unidade, status: 'tecnico' }));
      const salvo = (await getDocFromServer(mapaRef(db, mapa))).data();
      const eventoRef = doc(db, `${obraPath()}/historico/${salvo.ultimoEventoId}`);
      const evento = (await getDocFromServer(eventoRef)).data();
      assert.equal(salvo.userId, espaco); assert.equal(salvo.atualizadoPor, usuario); assert.equal(evento.autorId, usuario);
      await assertFails(setDoc(doc(db, `${obraPath()}/historico/isolado`), { ...evento, criadoEm: serverTimestamp() }));
      await assertFails(updateDoc(mapaRef(db, mapa), { [`marcacoes.${unidade}`]: 'replay', atualizadoEm: serverTimestamp() }));
      await assertFails(updateDoc(eventoRef, { autorId: uid('dev') }));
      await assertFails(deleteDoc(eventoRef));
      const contextoRef = doc(db, `${obraPath()}/mapas/comum/contextos/${unidade}`);
      await assertFails(setDoc(contextoRef, { schemaVersion: 1, userId: espaco, obraId: obra, mapaId: mapa.id, unidadeId: unidade,
        observacao: 'sem evento', responsavel: '', atualizadoEm: serverTimestamp(), atualizadoPor: usuario, ultimoEventoId: salvo.ultimoEventoId }));
    });

    await t.test('setor de estoque é independente do nível; Kits mantêm vínculo e autoria', async () => {
      for (const nivel of niveis) for (const estoque of [false, true]) {
        const db = dbDe(nivel, estoque), usuario = uid(nivel, estoque), podeGerenciar = ['engenheiro', 'coordenador'].includes(nivel) || (estoque && ['tecnico', 'dev'].includes(nivel));
        await (podeGerenciar ? assertSucceeds : assertFails)(criarKit(db, usuario, `kit-${usuario}`));
      }
      const db = dbDe('engenheiro', true), usuario = uid('engenheiro', true), id = `kit-${usuario}`;
      const kitRef = doc(db, `usuarios/${espaco}/kits/${id}`), mapa = { ...modelo(id), ...(await getDocFromServer(doc(db, `${obraPath()}/mapas/${id}`))).data() };
      await assertFails(criarKit(db, usuario, 'kit-sem-escopo', outraObra));
      await assertFails(criarKit(db, usuario, 'kit-autor-falso', obra, { criadoPor: uid('dev') }));
      await assertFails(updateDoc(kitRef, { nome: 'Sem atualizar mapa', atualizadoEm: serverTimestamp(), atualizadoPor: usuario }));
      await assertFails(updateDoc(mapaRef(db, mapa), { kitUnidadeIds: [unidade], atualizadoEm: serverTimestamp(), atualizadoPor: usuario }));
      await assertFails(deleteDoc(kitRef));
      await assertFails(deleteDoc(mapaRef(db, mapa)));
      let lote = writeBatch(db);
      lote.update(kitRef, { unidadeIds: [unidade], atualizadoEm: serverTimestamp(), atualizadoPor: usuario });
      lote.update(mapaRef(db, mapa), { kitUnidadeIds: [unidade], atualizadoEm: serverTimestamp(), atualizadoPor: usuario });
      await assertSucceeds(lote.commit());
      const tecnico = dbDe('tecnico');
      await assertSucceeds(getDocFromServer(doc(tecnico, kitRef.path)));
      await assertSucceeds(acao(tecnico, uid('tecnico'), mapa, { acao: 'unidade', unidadeId: unidade, status: 'feito' }));
      for (const nivel of niveis) {
        const consulta = query(collection(dbDe(nivel, true), `usuarios/${espaco}/kits`), where('userId', '==', espaco), where('obraId', '==', obra));
        await assertSucceeds(getDocs(consulta));
      }
      lote = writeBatch(db); lote.delete(kitRef); lote.delete(mapaRef(db, mapa)); await assertSucceeds(lote.commit());
    });

    await t.test('Kit de Técnico é somente leitura para Engenheiros, inclusive materiais e exclusão em lote', async () => {
      const id = `kit-${uid('tecnico', true)}`;
      for (const estoque of [false, true]) {
        const db = dbDe('engenheiro', estoque), usuario = uid('engenheiro', estoque);
        const kit = doc(db, `usuarios/${espaco}/kits/${id}`), mapa = doc(db, `${obraPath()}/mapas/${id}`);
        await assertSucceeds(getDocFromServer(kit));
        await assertSucceeds(getDocFromServer(mapa));
        await assertFails(updateDoc(kit, { materiais: [{ id: 'outro', descricao: 'Indevido' }], atualizadoEm: serverTimestamp(), atualizadoPor: usuario }));
        for (const [kitPatch, mapaPatch] of [
          [{ nome: 'Renomeado' }, { nome: 'Renomeado' }],
          [{ unidadeIds: [unidade] }, { kitUnidadeIds: [unidade] }],
        ]) {
          const lote = writeBatch(db), meta = { atualizadoEm: serverTimestamp(), atualizadoPor: usuario };
          lote.update(kit, { ...kitPatch, ...meta }); lote.update(mapa, { ...mapaPatch, ...meta });
          await assertFails(lote.commit());
        }
        const lote = writeBatch(db); lote.delete(kit); lote.delete(mapa); await assertFails(lote.commit());
      }
      // Mesmo um vínculo órfão não permite recriar um Kit sobre o mapa de outro autor.
      const db = dbDe('engenheiro'), kit = doc(db, `usuarios/${espaco}/kits/${id}`);
      const original = (await getDocFromServer(kit)).data();
      await admin(banco => deleteDoc(doc(banco, kit.path)));
      await assertFails(setDoc(kit, { ...original, atualizadoEm: serverTimestamp(), atualizadoPor: uid('engenheiro') }));
      await admin(banco => setDoc(doc(banco, kit.path), original));
    });

    await t.test('Técnico Estoque, Engenheiro e Coordenador gerenciam Kits; isso não concede apontamento', async () => {
      for (const [nivel, estoque] of [['tecnico', true], ['engenheiro', false], ['coordenador', false], ['coordenador', true], ['dev', true]]) {
        const db = dbDe(nivel, estoque), usuario = uid(nivel, estoque), id = `ciclo-kit-${usuario}`;
        await assertSucceeds(criarKit(db, usuario, id));
        const kit = doc(db, `usuarios/${espaco}/kits/${id}`), mapa = doc(db, `${obraPath()}/mapas/${id}`);
        const meta = { atualizadoEm: serverTimestamp(), atualizadoPor: usuario };
        let lote = writeBatch(db);
        lote.update(kit, { ...meta, nome: 'Kit revisado', unidadeIds: [unidade] });
        lote.update(mapa, { ...meta, nome: 'Kit revisado', kitUnidadeIds: [unidade] });
        await assertSucceeds(lote.commit());
        await assertSucceeds(updateDoc(kit, { ...meta, materiais: [{ id: 'm', descricao: 'Revisado', quantidadePorKit: 2 }] }));
        if (['engenheiro', 'coordenador'].includes(nivel)) {
          const atual = { ...modelo(id), ...(await getDocFromServer(mapa)).data() };
          await assertFails(acao(db, usuario, atual, { acao: 'unidade', unidadeId: unidade, status: 'indevido' }));
          lote = writeBatch(db);
          lote.update(kit, meta); lote.update(mapa, { ...meta, marcacoes: { [unidade]: 'indevido' } });
          await assertFails(lote.commit());
          await assertFails(criarKit(db, usuario, `pre-marcado-${usuario}`, obra, { marcacoes: { [unidade]: 'indevido' } }));
        }
        lote = writeBatch(db); lote.delete(kit); lote.delete(mapa); await assertSucceeds(lote.commit());
      }
    });

    await t.test('DEV administra somente acessos/setor/superior de perfis existentes do mesmo espaço', async () => {
      const db = dbDe('dev'), tecnicoRef = doc(db, `usuarios/${uid('tecnico')}`);
      await assertSucceeds(getDocs(query(collection(db, 'usuarios'), where('espacoId', '==', espaco))));
      await assertFails(getDocs(collection(db, 'usuarios')));
      await assertFails(getDocFromServer(doc(db, 'usuarios/dev-outro-espaco')));
      await assertSucceeds(updateDoc(tecnicoRef, { obraIds: [obra, outraObra] }));
      await assertSucceeds(getDocFromServer(doc(dbDe('tecnico'), obraPath(outraObra))));
      await assertSucceeds(updateDoc(tecnicoRef, { tipoConta: 'estoque', superiorId: uid('engenheiro', true) }));
      for (const alteracao of [
        { nivel: 'engenheiro' }, { nivel: 'dev' }, { nivel: 'administrador' }, { superiorId: uid('gestor') },
        { superiorId: uid('tecnico') }, { superiorId: 'dev-outro-espaco' }, { superiorId: null },
        { obraIds: [obra, obra] }, { obraIds: ['com/barra'] }, { obraIds: [42] },
        { obraIds: Array.from({ length: 31 }, (_, i) => `obra-${i}`) }, { espacoId: outroEspaco },
        { schemaVersion: 1 }, { userId: 'outro' }, { email: 'trocado@teste.invalid' }, { tipoConta: 'admin' },
      ]) await assertFails(updateDoc(tecnicoRef, alteracao));
      await assertFails(updateDoc(doc(db, `usuarios/${uid('dev')}`), { tipoConta: 'estoque' }));
      await assertFails(updateDoc(doc(db, `usuarios/${uid('dev', true)}`), { tipoConta: 'apontamento' }));
      await assertFails(setDoc(doc(db, 'usuarios/novo-provisionamento'), { ...perfil('tecnico'), userId: 'novo-provisionamento' }));
      await assertFails(deleteDoc(tecnicoRef));
      for (const nivel of niveis.filter(n => n !== 'dev')) {
        const banco = dbDe(nivel);
        await assertFails(updateDoc(doc(banco, `usuarios/${uid(nivel)}`), { nivel: 'dev' }));
        await assertFails(updateDoc(doc(banco, `usuarios/${uid(nivel)}`), { obraIds: [obra, outraObra] }));
        await assertFails(updateDoc(doc(banco, `usuarios/${uid('engenheiro', true)}`), { obraIds: [] }));
        await assertFails(getDocs(query(collection(banco, 'usuarios'), where('espacoId', '==', espaco))));
      }
      await assertSucceeds(updateDoc(tecnicoRef, { obraIds: [], tipoConta: 'apontamento', superiorId: uid('engenheiro') }));
      await assertFails(getDocFromServer(doc(dbDe('tecnico'), obraPath())));
      await assertFails(getDocs(query(collection(dbDe('tecnico'), `${obraPath()}/mapas`), where('userId', '==', espaco))));
      await assertFails(acao(dbDe('tecnico'), uid('tecnico'), modelo('comum'), { acao: 'unidade', unidadeId: unidade, status: 'revogado' }));
      await assertSucceeds(updateDoc(tecnicoRef, { obraIds: [obra] }));
    });

    await t.test('legendas compartilhadas só são administradas pelo DEV; nem DEV provisiona catálogos', async () => {
      for (const nivel of niveis) {
        const db = dbDe(nivel), ref = doc(db, `usuarios/${espaco}/legendas/estado-${nivel}`);
        await (nivel === 'dev' ? assertSucceeds : assertFails)(setDoc(ref, { schemaVersion: 1, userId: espaco, nome: 'Concluído', cor: '#23875d', categoria: 'concluido' }));
        await assertSucceeds(getDocs(query(collection(db, `usuarios/${espaco}/legendas`), where('userId', '==', espaco))));
        await assertFails(setDoc(doc(db, `${obraPath()}/plantas/forjada`), { nome: 'Forjada', templateId: 'original-v1' }));
        await assertFails(updateDoc(doc(db, `${obraPath()}/equipes/equipe`), { nome: 'Indevida' }));
      }
      for (const nivel of niveis) {
        const ref = doc(dbDe(nivel), `usuarios/${espaco}/legendas/estado-dev`);
        await (nivel === 'dev' ? assertSucceeds : assertFails)(updateDoc(ref, { nome: 'Revisado' }));
        if (nivel !== 'dev') await assertFails(deleteDoc(ref));
      }
      await assertSucceeds(deleteDoc(doc(dbDe('dev'), `usuarios/${espaco}/legendas/estado-dev`)));
    });

    await t.test('perfil pendente, nível inválido, claims ou outro espaço não concedem acesso', async () => {
      const invalidos = [{ nivel: 'DEV' }, { nivel: 'admin' }, { nivel: null }, { schemaVersion: 3 },
        { userId: 'falso' }, { tipoConta: 'admin' }, { obraIds: null }, { superiorId: null }];
      for (const [i, patch] of invalidos.entries()) {
        const usuario = `nivel-invalido-${i}`, db = ambiente.authenticatedContext(usuario, { nivel: 'dev', admin: true }).firestore();
        await admin(banco => setDoc(doc(banco, `usuarios/${usuario}`), { ...perfil('tecnico'), userId: usuario, ...patch }));
        await assertSucceeds(getDocFromServer(doc(db, `usuarios/${usuario}`)));
        await assertFails(getDocFromServer(doc(db, obraPath())));
        await assertFails(acao(db, usuario, modelo('comum'), { acao: 'unidade', unidadeId: unidade, status: 'falso' }));
      }
      for (const db of [ambiente.authenticatedContext('pendente').firestore(), ambiente.unauthenticatedContext().firestore(), ambiente.authenticatedContext('dev-outro-espaco').firestore()]) {
        await assertFails(getDocFromServer(doc(db, obraPath())));
        await assertFails(getDocs(query(collection(db, `${obraPath()}/historico`), where('userId', '==', espaco), where('obraId', '==', obra))));
        await assertFails(setDoc(doc(db, `usuarios/${uid('tecnico')}`), { ...perfil('tecnico'), nivel: 'dev' }));
      }
    });

    await t.test('inicialização compartilhada concorrente cria um único mapa e evento', async () => {
      await Promise.all([
        garantirMapaInicial(dbDe('engenheiro'), espaco, obra, 'planta-principal', uid('engenheiro')),
        garantirMapaInicial(dbDe('dev'), espaco, obra, 'planta-principal', uid('dev')),
      ]);
      const db = dbDe('dev');
      const mapa = (await getDocFromServer(doc(db, `${obraPath()}/mapas/mapa-principal`))).data();
      assert([uid('engenheiro'), uid('dev')].includes(mapa.criadoPor));
      const eventos = await getDocs(query(collection(db, `${obraPath()}/historico`), where('userId', '==', espaco), where('obraId', '==', obra), where('mapaId', '==', 'mapa-principal')));
      assert.equal(eventos.size, 1);
      assert.equal(eventos.docs[0].id, mapa.ultimoEventoId);
      assert.equal(eventos.docs[0].data().autorId, mapa.criadoPor);
    });

    await t.test('perfis legados preservam dados e direitos anteriores sem herdar acesso compartilhado', async () => {
      const usuario = 'nivel-legado', db = ambiente.authenticatedContext(usuario).firestore();
      await admin(banco => setDoc(doc(banco, `usuarios/${usuario}`), { schemaVersion: 1, userId: usuario, tipoConta: 'apontamento' }));
      const mapa = modelo('legado', obra, usuario);
      await assertSucceeds(setDoc(mapaRef(db, mapa), mapa));
      await assertSucceeds(updateDoc(mapaRef(db, mapa), { nome: 'Legado preservado' }));
      await assertSucceeds(setDoc(doc(db, `usuarios/${usuario}/legendas/a`), { schemaVersion: 1, userId: usuario, nome: 'Legado', cor: '#ffffff' }));
      await assertFails(getDocFromServer(doc(db, obraPath())));
      await assertFails(updateDoc(doc(db, `usuarios/${usuario}`), { ...perfil('dev'), userId: usuario }));
      assert.equal((await getDocFromServer(mapaRef(db, mapa))).data().nome, 'Legado preservado');
    });
  } finally { await ambiente.cleanup(); }
});
