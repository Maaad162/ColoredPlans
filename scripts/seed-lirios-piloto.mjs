import { pathToFileURL } from 'node:url';
import { LIRIOS_OBRA_ID, LIRIOS_PLANTA_ID, LIRIOS_TEMPLATE_ID, LIRIOS_DEFINICAO } from '../src/data/liriosDoValeII.ts';
import { validarDefinicao, idsDaPlanta } from '../src/services/geometria.ts';
import { STATUSES } from '../src/config/statuses.ts';
import { encodeFields, requestJson, localEmulatorHost } from './lib/firebase-rest.mjs';
export const SEED_PROJECT_ID = 'demo-coloredplans';
export const SEED_PASSWORD = 'ColoredPlans@Piloto2026'; // SOMENTE emulador; nunca importado pelo frontend.
export const SEED_OBRA_ID = LIRIOS_OBRA_ID;
export const SEED_MAPA_ID = 'mapa-planejamento';
export const TEST_ACCOUNTS = [
  {uid:'piloto-lirios-estoque',email:'piloto.lirios@coloredplans.local',tipoConta:'estoque'},
  {uid:'piloto-lirios-apontamento',email:'apontamento.lirios@coloredplans.local',tipoConta:'apontamento'},
];
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
  const definition = validarDefinicao(LIRIOS_DEFINICAO);
  const documents = [];
  for (const account of TEST_ACCOUNTS) {
    const userId = account.uid, base = 'usuarios/' + userId + '/obras/' + LIRIOS_OBRA_ID;
    documents.push({path:'usuarios/' + userId, profile:true, data:{schemaVersion:1,userId,email:account.email,tipoConta:account.tipoConta,criadoEm:now}});
    documents.push({path:base,data:{schemaVersion:1,userId,nome:'Lírios do Vale II',status:'ativa',plantaLegada:false,criadoEm:now}});
    documents.push({path:base+'/templates/'+LIRIOS_TEMPLATE_ID,data:{schemaVersion:1,definicao:definition,unidadeIds:idsDaPlanta(definition)}});
    documents.push({path:base+'/plantas/'+LIRIOS_PLANTA_ID,data:{schemaVersion:1,nome:'Implantação — Lírios do Vale II',templateId:LIRIOS_TEMPLATE_ID}});
    documents.push({path:base+'/mapas/'+SEED_MAPA_ID,data:{schemaVersion:1,userId,obraId:LIRIOS_OBRA_ID,plantaId:LIRIOS_PLANTA_ID,nome:'Planejamento físico',tipo:'manual',kitUnidadeIds:[],marcacoes:{},criadoEm:now,atualizadoEm:now}});
    for (const {id,...legend} of STATUSES) documents.push({path:'usuarios/'+userId+'/legendas/'+id,data:{...legend,schemaVersion:1,userId,criadoEm:now,atualizadoEm:now}});
  }
  return documents;
}
export async function seedLiriosPilot({ env = process.env, fetchImpl = fetch } = {}) {
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
      || existing.fields?.schemaVersion?.integerValue !== '1' || existing.fields?.nivel || existing.fields?.espacoId)) throw new Error(`Perfil existente incompatível: ${document.path}.`);
    if (existing && !document.profile && existing.fields?.userId && existing.fields.userId.stringValue !== document.path.split('/')[1]) throw new Error(`Dados existentes pertencem a outro espaço: ${document.path}.`);
    existingDocuments.set(document.path, existing);
  }
  for (const account of TEST_ACCOUNTS) {
    const update = existingAccounts.get(account.uid);
    await requestJson(fetchImpl, `${authRoot}/accounts${update ? ':update' : ''}`, { method: 'POST', body: {
      localId: account.uid, email: account.email, password: SEED_PASSWORD, emailVerified: true,
      displayName: 'Piloto local Lírios', disabled: false,
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
  return { contas: TEST_ACCOUNTS, obraId: SEED_OBRA_ID, documentosGravados: writes.length };
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) throw new Error('Seed local sem argumentos; não aceita destino real ou reset.');
  const result = await seedLiriosPilot();
  console.log('Piloto LOCAL pronto: ' + result.contas.length + ' contas; documentos gravados: ' + result.documentosGravados);
}
