import { pathToFileURL } from 'node:url';
import { OBRA_PADRAO } from '../src/config/dados.ts';
import { STATUSES } from '../src/config/statuses.ts';
import { encodeFields, requestJson, localEmulatorHost } from './lib/firebase-rest.mjs';

export const SEED_PROJECT_ID = 'demo-coloredplans';
export const SEED_PASSWORD = 'ColoredPlans@Teste2026'; // SOMENTE emuladores; nunca importado pelo aplicativo.
export const SEED_SPACE_ID = 'teste-dev';
export const SEED_OBRA_ID = OBRA_PADRAO.id;
export const TEST_ACCOUNTS = [
  { uid: 'teste-dev', email: 'dev.teste@coloredplans.local', nivel: 'dev', tipoConta: 'estoque', superiorId: null },
  { uid: 'teste-gestor', email: 'gestor.teste@coloredplans.local', nivel: 'gestor', tipoConta: 'apontamento', superiorId: 'teste-dev' },
  { uid: 'teste-coordenador', email: 'coordenador.teste@coloredplans.local', nivel: 'coordenador', tipoConta: 'apontamento', superiorId: 'teste-gestor' },
  { uid: 'teste-engenheiro', email: 'engenheiro.teste@coloredplans.local', nivel: 'engenheiro', tipoConta: 'apontamento', superiorId: 'teste-coordenador' },
  { uid: 'teste-tecnico', email: 'tecnico.teste@coloredplans.local', nivel: 'tecnico', tipoConta: 'apontamento', superiorId: 'teste-engenheiro' },
  { uid: 'teste-tecnico-estoque', email: 'tecnico.estoque.teste@coloredplans.local', nivel: 'tecnico', tipoConta: 'estoque', superiorId: 'teste-engenheiro' },
  { uid: 'teste-engenheiro-estoque', email: 'engenheiro.estoque.teste@coloredplans.local', nivel: 'engenheiro', tipoConta: 'estoque', superiorId: 'teste-coordenador' },
  { uid: 'teste-pendente', email: 'pendente.teste@coloredplans.local' },
];

/** Executada antes de qualquer chamada de rede. Não existe opção de ignorar esta proteção. */
export function validateSeedEnvironment(env) {
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
    if (env[key] && env[key] !== SEED_PROJECT_ID) throw new Error(`Seed restrito a ${SEED_PROJECT_ID}; ${key} é incompatível.`);
  }
  if (env.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error('FIREBASE_CONFIG deve ser JSON explícito do projeto demo.'); }
    if (config.projectId && config.projectId !== SEED_PROJECT_ID) throw new Error('FIREBASE_CONFIG aponta para outro projeto.');
  }
  return {
    projectId: SEED_PROJECT_ID,
    authHost: localEmulatorHost(env.FIREBASE_AUTH_EMULATOR_HOST, 'FIREBASE_AUTH_EMULATOR_HOST'),
    firestoreHost: localEmulatorHost(env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST'),
  };
}

export function createSeedDocuments(now = new Date()) {
  const documents = TEST_ACCOUNTS.filter(account => account.nivel).map(account => ({
    path: `usuarios/${account.uid}`, profile: true,
    data: { schemaVersion: 2, userId: account.uid, email: account.email, tipoConta: account.tipoConta,
      nivel: account.nivel, espacoId: SEED_SPACE_ID, superiorId: account.superiorId,
      obraIds: [SEED_OBRA_ID], criadoEm: now },
  }));
  for (const obra of [OBRA_PADRAO, { id: 'obra-teste-b', nome: 'Obra Teste B — isolamento' }]) {
    const path = `usuarios/${SEED_SPACE_ID}/obras/${obra.id}`;
    documents.push({ path, data: { schemaVersion: 1, userId: SEED_SPACE_ID, nome: obra.nome, status: 'ativa', plantaLegada: true, criadoEm: now } });
    documents.push({ path: `${path}/plantas/planta-principal`, data: { schemaVersion: 1, nome: 'Planta principal', templateId: 'original-v1' } });
    documents.push({ path: `${path}/mapas/mapa-teste`, data: { schemaVersion: 1, userId: SEED_SPACE_ID, obraId: obra.id,
      plantaId: 'planta-principal', nome: 'Pintura de teste', tipo: 'manual', kitUnidadeIds: [],
      marcacoes: { 'bloco-01-001': 'pendente' }, criadoPor: 'teste-tecnico', criadoEm: now, atualizadoEm: now, atualizadoPor: SEED_SPACE_ID } });
    documents.push({ path: `${path}/mapas/mapa-teste-estoque`, data: { schemaVersion: 1, userId: SEED_SPACE_ID, obraId: obra.id,
      plantaId: 'planta-principal', nome: 'Estoque de teste', tipo: 'manual', kitUnidadeIds: [],
      marcacoes: {}, criadoPor: 'teste-tecnico-estoque', criadoEm: now, atualizadoEm: now, atualizadoPor: 'teste-tecnico-estoque' } });
  }
  for (const { id, ...legenda } of STATUSES) {
    documents.push({ path: `usuarios/${SEED_SPACE_ID}/legendas/${id}`,
      data: { ...legenda, schemaVersion: 1, userId: SEED_SPACE_ID, criadoEm: now, atualizadoEm: now } });
  }
  return documents;
}

export async function seedTestUsers({ env = process.env, fetchImpl = fetch } = {}) {
  const { projectId, authHost, firestoreHost } = validateSeedEnvironment(env);
  const authRoot = `http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const documentPrefix = `projects/${projectId}/databases/(default)/documents`;
  const firestoreRoot = `http://${firestoreHost}/v1/${documentPrefix}`;
  const documents = createSeedDocuments();
  const existingAccounts = new Map();
  // Preflight de colisões: um email ou UID que não coincide com o seed nunca é apropriado.
  for (const account of TEST_ACCOUNTS) {
    const lookup = await requestJson(fetchImpl, `${authRoot}/accounts:lookup`, {
      method: 'POST', body: { localId: [account.uid], email: [account.email] },
    });
    const users = lookup.users ?? [];
    if (users.some(user => user.localId !== account.uid || user.email !== account.email)) throw new Error(`Colisão de identidade em ${account.email}; nenhum usuário será substituído.`);
    existingAccounts.set(account.uid, users.length > 0);
  }
  const existingDocuments = new Map();
  for (const document of documents) {
    const existing = await requestJson(fetchImpl, `${firestoreRoot}/${document.path}`, { allowMissing: true });
    if (existing && document.profile && (existing.fields?.userId?.stringValue !== document.data.userId
      || existing.fields?.email?.stringValue !== document.data.email
      || existing.fields?.espacoId?.stringValue !== SEED_SPACE_ID)) throw new Error(`Perfil existente incompatível: ${document.path}.`);
    if (existing && !document.profile && existing.fields?.userId && existing.fields.userId.stringValue !== SEED_SPACE_ID) throw new Error(`Dados existentes pertencem a outro espaço: ${document.path}.`);
    existingDocuments.set(document.path, existing);
  }
  const pending = await requestJson(fetchImpl, `${firestoreRoot}/usuarios/teste-pendente`, { allowMissing: true });
  if (pending) throw new Error('A conta pendente já possui perfil. Revise esse documento manualmente; o seed não apaga perfis.');

  for (const account of TEST_ACCOUNTS) {
    const update = existingAccounts.get(account.uid);
    await requestJson(fetchImpl, `${authRoot}/accounts${update ? ':update' : ''}`, { method: 'POST', body: {
      localId: account.uid, email: account.email, password: SEED_PASSWORD, emailVerified: true,
      displayName: `${account.nivel ?? 'Pendente'} Teste`, disabled: false,
    } });
  }
  const writes = [];
  for (const document of documents) {
    const existing = existingDocuments.get(document.path);
    if (existing && !document.profile) continue; // Preserva mapas, marcações, legendas, nomes e todo o trabalho manual.
    const data = { ...document.data };
    if (existing) delete data.criadoEm;
    const fields = encodeFields(data);
    if (existing && Object.entries(fields).every(([key, value]) => JSON.stringify(existing.fields[key]) === JSON.stringify(value))) continue;
    writes.push({ update: { name: `${documentPrefix}/${document.path}`, fields },
      ...(existing ? { updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: existing.updateTime } }
        : { currentDocument: { exists: false } }) });
  }
  if (writes.length) await requestJson(fetchImpl, `${firestoreRoot}:commit`, { method: 'POST', body: { writes } });
  return { contas: TEST_ACCOUNTS, espacoId: SEED_SPACE_ID, obraId: SEED_OBRA_ID, documentosGravados: writes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) throw new Error('O seed não aceita parâmetros nem reset. Configure somente os dois emuladores locais.');
  const result = await seedTestUsers();
  console.log(`Seed concluído em ${SEED_PROJECT_ID}: ${result.contas.length} contas Authentication, ${result.documentosGravados} documentos gravados.`);
  console.log(`Obra: ${OBRA_PADRAO.nome} (${result.obraId}). Espaço compartilhado: ${result.espacoId}. Credenciais: docs/TEST_USERS.md.`);
}
