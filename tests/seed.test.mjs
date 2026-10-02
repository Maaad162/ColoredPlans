import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PROJECT_ID, SEED_SPACE_ID, SEED_OBRA_ID, TEST_ACCOUNTS, createSeedDocuments, seedTestUsers, validateSeedEnvironment } from '../scripts/seed-test-users.mjs';
import { provisionHierarchy, validateHierarchyPlan } from '../scripts/provisionar-hierarquia.mjs';
import { encodeFields, decodeFields } from '../scripts/lib/firebase-rest.mjs';
import { NIVEIS, lerHierarquia, migrarPerfilV2, permissoes, podeAlterarMapa } from '../src/services/hierarquia.ts';

const environment = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099', GCLOUD_PROJECT: SEED_PROJECT_ID };

test('matriz distingue criação de mapas, apontamento, autoria e gestão de Kits nos dois setores', () => {
  for (const nivel of NIVEIS) for (const setor of ['apontamento', 'estoque']) {
    const hierarquia = { nivel, espacoId: 'espaco', superiorId: null, obraIds: [] };
    const acesso = permissoes(hierarquia, setor);
    assert.equal(acesso.apontar, ['tecnico', 'dev'].includes(nivel));
    assert.equal(acesso.gerenciar, ['tecnico', 'engenheiro', 'dev'].includes(nivel));
    assert.equal(acesso.kits, ['engenheiro', 'coordenador'].includes(nivel) || (['tecnico', 'dev'].includes(nivel) && setor === 'estoque'));
    assert.equal(podeAlterarMapa(hierarquia, 'eu', { criadoPor: 'outro' }), nivel !== 'engenheiro');
    assert.equal(podeAlterarMapa(hierarquia, 'eu', {}), nivel !== 'engenheiro');
    assert.equal(podeAlterarMapa(hierarquia, 'eu', { criadoPor: 'eu' }), true);
  }
});

test('seed bloqueia projeto real e hosts externos antes de acessar a rede', async () => {
  for (const env of [{}, { ...environment, GCLOUD_PROJECT: 'coloredplans-prod' },
    { ...environment, FIREBASE_AUTH_EMULATOR_HOST: 'example.com:9099' },
    { ...environment, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080@evil.test' },
    { ...environment, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080/path' },
    { ...environment, FIREBASE_CONFIG: '{"projectId":"coloredplans-prod"}' }]) {
    let calls = 0;
    await assert.rejects(seedTestUsers({ env, fetchImpl: async () => { calls++; throw new Error('Não deveria acessar a rede.'); } }));
    assert.equal(calls, 0);
  }
  assert.equal(validateSeedEnvironment(environment).projectId, 'demo-coloredplans');
});

test('seed usa hierarquia real, um espaço compartilhado e obra de isolamento', () => {
  assert.deepEqual([...new Set(TEST_ACCOUNTS.filter(a => a.nivel).map(a => a.nivel))].sort(), [...NIVEIS].sort());
  const documents = createSeedDocuments();
  const profiles = documents.filter(d => d.profile);
  assert.equal(profiles.length, 7);
  const tecnicos = profiles.filter(d => d.data.nivel === 'tecnico');
  assert.deepEqual(tecnicos.map(d => d.data.tipoConta).sort(), ['apontamento', 'estoque']);
  assert(tecnicos.every(d => d.data.superiorId === 'teste-engenheiro'));
  assert(profiles.every(d => d.data.espacoId === SEED_SPACE_ID && d.data.obraIds.includes(SEED_OBRA_ID)));
  assert.equal(documents.filter(d => /^usuarios\/[^/]+\/obras\/[^/]+$/.test(d.path)).length, 2);
  assert.equal(SEED_OBRA_ID, 'obra-principal');
  assert(!JSON.stringify(documents).includes('ColoredPlans@Teste2026'));
  assert(!documents.some(d => d.path === 'usuarios/teste-pendente'));
});

function fakeFirebase() {
  const accounts = new Map(), documents = new Map(), calls = [];
  let revision = 0;
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({ url, options, body });
    if (url.includes('/accounts:lookup')) return response({ users: [...accounts.values()].filter(user => body.localId.includes(user.localId) || body.email.includes(user.email)) });
    if (url.includes('/accounts')) {
      accounts.set(body.localId, { localId: body.localId, email: body.email });
      return response({ localId: body.localId });
    }
    if (url.endsWith('/documents:commit')) {
      for (const write of body.writes) {
        const path = write.update.name.split('/documents/')[1], existing = documents.get(path);
        assert(write.currentDocument.updateTime ? existing?.updateTime === write.currentDocument.updateTime : !existing);
        documents.set(path, { fields: { ...existing?.fields, ...write.update.fields }, updateTime: `revision-${++revision}` });
      }
      return response({});
    }
    const path = url.split('/documents/')[1];
    if (path.includes('?pageSize=1')) return response({ documents: [] });
    return documents.has(path) ? response(documents.get(path)) : response({}, 404);
  };
  return { fetchImpl, accounts, documents, calls };
}

test('reexecução preserva identidades e dados manuais, usando máscaras somente em perfis', async () => {
  const firebase = fakeFirebase();
  const options = { env: environment, fetchImpl: firebase.fetchImpl };
  await seedTestUsers(options);
  const mapPath = `usuarios/${SEED_SPACE_ID}/obras/${SEED_OBRA_ID}/mapas/mapa-teste`;
  const map = firebase.documents.get(mapPath);
  map.fields.marcacoes = encodeFields({ value: { 'bloco-01-001': 'concluido' } }).value;
  map.fields.personalizado = { stringValue: 'preservado' };
  const createdAt = firebase.documents.get('usuarios/teste-tecnico').fields.criadoEm;
  const repeated = await seedTestUsers(options);
  assert.equal(repeated.documentosGravados, 0);
  assert.equal(firebase.accounts.size, 8);
  assert.equal(decodeFields(firebase.documents.get(mapPath).fields).marcacoes['bloco-01-001'], 'concluido');
  assert.equal(firebase.documents.get(mapPath).fields.personalizado.stringValue, 'preservado');
  assert.deepEqual(firebase.documents.get('usuarios/teste-tecnico').fields.criadoEm, createdAt);
});

test('colisão de email/UID aborta seed sem gravar perfis ou substituir usuários', async () => {
  const firebase = fakeFirebase();
  firebase.accounts.set('normal', { localId: 'normal', email: TEST_ACCOUNTS[0].email });
  await assert.rejects(seedTestUsers({ env: environment, fetchImpl: firebase.fetchImpl }), /Colisão/);
  assert.equal(firebase.documents.size, 0);
  assert.equal(firebase.accounts.size, 1);
  assert(firebase.calls.every(call => call.url.endsWith('accounts:lookup')));
});

const plan = () => ({ version: 1, espacoId: 'dono', usuarios: [
  { userId: 'dono', nivel: 'dev', superiorId: null, obraIds: ['obra-principal'] },
  { userId: 'gestor', nivel: 'gestor', superiorId: 'dono', obraIds: ['obra-principal'] },
] });

test('plano de migração rejeita árvore incompleta, troca de proprietário e atribuições duplicadas', () => {
  assert.doesNotThrow(() => validateHierarchyPlan(plan()));
  const missing = plan(); missing.usuarios[1].superiorId = 'ausente';
  assert.throws(() => validateHierarchyPlan(missing));
  const owner = plan(); owner.espacoId = 'ausente';
  assert.throws(() => validateHierarchyPlan(owner));
  const duplicate = plan(); duplicate.usuarios[1].obraIds.push('obra-principal');
  assert.throws(() => validateHierarchyPlan(duplicate));
});

test('perfil v2 valida nível e superior sem confundir setor, preservando campos anteriores', () => {
  const hierarquia = { nivel: 'tecnico', espacoId: 'dono', superiorId: 'engenheiro', obraIds: ['obra-principal'] };
  const anterior = { schemaVersion: 1, userId: 'tecnico', tipoConta: 'estoque', extra: 'preservado' };
  const migrado = migrarPerfilV2('tecnico', anterior, hierarquia);
  assert.equal(migrado.schemaVersion, 2);
  assert.equal(migrado.extra, 'preservado');
  assert.equal(anterior.schemaVersion, 1);
  assert.deepEqual(migrarPerfilV2('tecnico', migrado, hierarquia), migrado);
  assert.equal(permissoes(hierarquia, 'estoque').kits, true);
  assert.equal(permissoes({ ...hierarquia, nivel: 'engenheiro' }, 'estoque').kits, true);
  for (const patch of [{ nivel: 'DEV' }, { superiorId: null }, { superiorId: 'tecnico' }, { obraIds: ['a', 'a'] }, { espacoId: '../outro' }]) {
    assert.throws(() => lerHierarquia({ ...hierarquia, ...patch }, 'tecnico'));
  }
  assert.throws(() => lerHierarquia({ ...hierarquia, nivel: 'dev' }, 'tecnico'));
});

test('migração dry run não grava; aplicação usa precondição e preserva perfil, setor e documentos antigos', async () => {
  const firebase = fakeFirebase();
  const put = (path, data) => firebase.documents.set(path, { fields: encodeFields(data), updateTime: 'anterior' });
  put('usuarios/dono', { schemaVersion: 1, userId: 'dono', email: 'dono@example.invalid', tipoConta: 'estoque', criadoEm: 'preservado', outroCampo: 'preservado' });
  put('usuarios/gestor', { schemaVersion: 1, userId: 'gestor', email: 'gestor@example.invalid', tipoConta: 'apontamento' });
  put('usuarios/dono/obras/obra-principal', { schemaVersion: 1, userId: 'dono', nome: 'Jardim das Tulipas I' });
  const options = { config: plan(), projectId: SEED_PROJECT_ID, emulatorHost: '127.0.0.1:8080', fetchImpl: firebase.fetchImpl };
  const preview = await provisionHierarchy(options);
  assert.equal(preview.alteracoes.length, 2);
  assert(!firebase.calls.some(call => call.url.endsWith(':commit')));
  await provisionHierarchy({ ...options, apply: true });
  const profile = decodeFields(firebase.documents.get('usuarios/dono').fields);
  assert.equal(profile.schemaVersion, 2);
  assert.equal(profile.tipoConta, 'estoque');
  assert.equal(profile.criadoEm, 'preservado');
  assert.equal(profile.outroCampo, 'preservado');
  const commit = firebase.calls.find(call => call.url.endsWith(':commit'));
  assert(commit.body.writes.every(write => write.currentDocument.updateTime === 'anterior' && write.updateMask.fieldPaths.length === 5));
  const repeated = await provisionHierarchy({ ...options, apply: true });
  assert.equal(repeated.alteracoes.length, 0);
});
