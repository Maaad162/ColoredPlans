import { readFile } from 'node:fs/promises';
import { prepararProvisionamento } from '../src/services/provisionamento.ts';

const args = process.argv.slice(2);
const opcao = nome => args[args.indexOf(nome) + 1];
if (!args.includes('--arquivo') || !args.includes('--uid')) throw new Error('Use --arquivo config.json --uid UID [--projeto ID --aplicar] [--adicionar]. Sem --aplicar, apenas valida.');
const uid = opcao('--uid');
const plano = prepararProvisionamento(JSON.parse(await readFile(opcao('--arquivo'), 'utf8')), uid);
const registros = args.includes('--adicionar') ? plano.slice(1) : plano;
console.log('Plano validado: criação exclusiva dos documentos abaixo. Colisões abortam o lote inteiro.');
console.log(registros.map(r => r.caminho).join('\n'));
if (args.includes('--aplicar')) {
  const projeto = opcao('--projeto'), token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!args.includes('--projeto') || !/^[a-z][a-z0-9-]{4,62}$/.test(projeto) || !token) throw new Error('Informe --projeto e GOOGLE_OAUTH_ACCESS_TOKEN com credencial administrativa temporária.');
  const raiz = `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (args.includes('--adicionar')) {
    const existente = await fetch(`${raiz}/${plano[0].caminho}`, { headers });
    if (!existente.ok) throw new Error('A obra de destino precisa existir e estar acessível à credencial administrativa.');
    const data = await existente.json();
    if (data.fields?.userId?.stringValue !== uid || data.fields?.schemaVersion?.integerValue !== '1') throw new Error('Obra sem proprietário/schema compatível. Revise antes de provisionar.');
  }
  const campo = valor => {
    if (valor === null) return { nullValue: null };
    if (typeof valor === 'string') return { stringValue: valor };
    if (typeof valor === 'boolean') return { booleanValue: valor };
    if (typeof valor === 'number') return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
    if (Array.isArray(valor)) return { arrayValue: { values: valor.map(campo) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, campo(v)])) } };
  };
  const writes = registros.map(r => ({ update: { name: `projects/${projeto}/databases/(default)/documents/${r.caminho}`, fields: campo(r.dados).mapValue.fields }, currentDocument: { exists: false } }));
  const resposta = await fetch(`${raiz}:commit`, { method: 'POST', headers, body: JSON.stringify({ writes }) });
  if (!resposta.ok) throw new Error(`Provisionamento rejeitado (HTTP ${resposta.status}). Nenhum documento do lote foi sobrescrito; confira permissões e colisões.`);
  console.log(`Provisionamento concluído: ${registros.length} documentos criados atomicamente.`);
}
