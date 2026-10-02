import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { migrarPerfilV2, NIVEIS } from '../src/services/hierarquia.ts';
import { decodeFields, encodeFields, requestJson, localEmulatorHost } from './lib/firebase-rest.mjs';

const idValido = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export function validateHierarchyPlan(config) {
  if (!config || config.version !== 1 || !idValido(config.espacoId) || !Array.isArray(config.usuarios)
    || config.usuarios.length < 1 || config.usuarios.length > 400) throw new Error('Configuração inválida: version 1, espacoId e usuarios são obrigatórios (até 400).');
  const users = new Map();
  for (const user of config.usuarios) {
    if (!user || !idValido(user.userId) || users.has(user.userId) || !NIVEIS.includes(user.nivel)
      || !Array.isArray(user.obraIds) || user.obraIds.length > 30 || !user.obraIds.every(idValido)
      || new Set(user.obraIds).size !== user.obraIds.length
      || (user.nivel === 'dev' ? user.superiorId !== null : !idValido(user.superiorId))) throw new Error('Usuário duplicado ou hierarquia inválida no plano.');
    users.set(user.userId, user);
  }
  for (const user of users.values()) {
    if (user.nivel === 'dev') continue;
    const superior = users.get(user.superiorId);
    if (!superior || NIVEIS.indexOf(superior.nivel) !== NIVEIS.indexOf(user.nivel) + 1) throw new Error('Inclua todos os superiores no mesmo plano, respeitando os níveis adjacentes.');
  }
  if (!users.has(config.espacoId)) throw new Error('Inclua o UID proprietário dos caminhos existentes no plano, sem mudar sua identidade técnica.');
  return config;
}

export async function provisionHierarchy({ config, projectId, token, emulatorHost, apply = false, fetchImpl = fetch }) {
  validateHierarchyPlan(config);
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId ?? '')) throw new Error('Informe um ID de projeto explícito.');
  if (emulatorHost && projectId !== 'demo-coloredplans') throw new Error('O emulador administrativo usa somente demo-coloredplans.');
  const origin = emulatorHost ? `http://${localEmulatorHost(emulatorHost, 'FIRESTORE_EMULATOR_HOST')}` : 'https://firestore.googleapis.com';
  if (!emulatorHost && !token) throw new Error('Informe GOOGLE_OAUTH_ACCESS_TOKEN temporário para ler/alterar perfis no projeto explícito.');
  const authentication = emulatorHost ? 'owner' : token;
  const prefix = `projects/${projectId}/databases/(default)/documents`, root = `${origin}/v1/${prefix}`;
  const request = (url, options = {}) => requestJson(fetchImpl, url, { token: authentication, ...options });
  const writes = [];
  const obraIds = new Set(config.usuarios.flatMap(user => user.obraIds));
  for (const obraId of obraIds) {
    const obra = await request(`${root}/usuarios/${config.espacoId}/obras/${obraId}`, { allowMissing: true });
    if (!obra || obra.fields?.userId?.stringValue !== config.espacoId || obra.fields?.schemaVersion?.integerValue !== '1') throw new Error(`Obra ${obraId} precisa existir no espaço com proprietário compatível e migração operacional para schema 1 concluída.`);
  }
  for (const user of config.usuarios) {
    const path = `usuarios/${user.userId}`, original = await request(`${root}/${path}`, { allowMissing: true });
    if (!original) throw new Error(`Perfil ${user.userId} não provisionado. Crie a conta Auth e seu perfil administrativamente antes da migração.`);
    const profile = decodeFields(original.fields);
    if (typeof profile.email !== 'string' || !profile.email.includes('@')) throw new Error(`Perfil ${user.userId} sem email válido.`);
    if (profile.schemaVersion === 2 && profile.espacoId !== config.espacoId) throw new Error('Mover um perfil de outro espaço exige revisão específica; este script não move dados.');
    if (user.userId !== config.espacoId && profile.schemaVersion !== 2) {
      for (const collection of ['obras', 'kits', 'legendas']) {
        const owned = await request(`${root}/${path}/${collection}?pageSize=1`);
        if (owned.documents?.length) throw new Error(`O usuário ${user.userId} possui dados próprios em ${collection}. Migração interrompida para não ocultar dados existentes.`);
      }
    }
    const hierarchy = { nivel: user.nivel, espacoId: config.espacoId, superiorId: user.superiorId, obraIds: user.obraIds };
    const migrated = migrarPerfilV2(user.userId, profile, hierarchy);
    const fields = encodeFields({ schemaVersion: migrated.schemaVersion, ...hierarchy });
    if (Object.entries(fields).every(([key, value]) => JSON.stringify(original.fields[key]) === JSON.stringify(value))) continue;
    writes.push({ update: { name: `${prefix}/${path}`, fields },
      updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: original.updateTime } });
  }
  if (apply && writes.length) await request(`${root}:commit`, { method: 'POST', body: { writes } });
  return { aplicado: apply, alteracoes: writes.map(write => write.update.name.slice(prefix.length + 1)), espacoId: config.espacoId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), flags = new Set(['--arquivo', '--projeto', '--aplicar', '--emulador']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!flags.has(flag)) throw new Error(`Argumento desconhecido: ${flag}`);
    if (['--arquivo', '--projeto'].includes(flag) && (!args[++index] || args[index].startsWith('--'))) throw new Error(`Informe o valor de ${flag}.`);
  }
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (!option('--arquivo') || !option('--projeto')) throw new Error('Use --arquivo plano.json --projeto ID [--emulador] [--aplicar]. Sem --aplicar, somente valida e mostra o plano.');
  if (args.includes('--emulador') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Defina FIRESTORE_EMULATOR_HOST explicitamente.');
  const result = await provisionHierarchy({ config: JSON.parse(await readFile(option('--arquivo'), 'utf8')), projectId: option('--projeto'),
    token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN, emulatorHost: args.includes('--emulador') ? process.env.FIRESTORE_EMULATOR_HOST : undefined,
    apply: args.includes('--aplicar') });
  console.log(`${result.aplicado ? 'Migração aplicada' : 'DRY RUN: nenhuma gravação'}. Espaço: ${result.espacoId}. Perfis: ${result.alteracoes.length}.`);
  console.log(result.alteracoes.join('\n'));
}
