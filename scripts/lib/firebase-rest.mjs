/** Conversão REST compartilhada somente pelos scripts administrativos. */
export function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error('Valor não serializável no plano administrativo.');
}

export function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

export function decodeValue(value) {
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error('Campo Firestore não suportado pelo script.');
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

export async function requestJson(fetchImpl, url, { token = 'owner', method = 'GET', body, allowMissing = false } = {}) {
  const response = await fetchImpl(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Operação administrativa recusada (HTTP ${response.status}). Verifique o ambiente, a credencial e os conflitos de dados.`);
  return response.json();
}

export function localEmulatorHost(value, name) {
  const match = typeof value === 'string' && /^(localhost|127\.0\.0\.1|\[::1\]):([0-9]{1,5})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    throw new Error(`${name} deve apontar explicitamente para um emulador local (localhost:porta ou 127.0.0.1:porta).`);
  }
  return value;
}
