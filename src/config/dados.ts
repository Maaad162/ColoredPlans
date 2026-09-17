export const CURRENT_SCHEMA_VERSION = 1 as const;
export type SchemaVersion = 0 | typeof CURRENT_SCHEMA_VERSION;

export const OBRA_PADRAO_ID = "obra-principal";
export const OBRA_PADRAO = {
  id: OBRA_PADRAO_ID,
  nome: "Obra principal",
};

export function lerSchemaVersion(valor: unknown): SchemaVersion {
  if (valor === undefined || valor === 0) return 0;
  if (valor === CURRENT_SCHEMA_VERSION) return valor;
  throw new Error("Versão dos dados não suportada. Atualize a aplicação ou contate o responsável.");
}

export function validarId(valor: string) {
  if (!valor.trim() || valor.includes("/")) throw new Error("Identificador inválido.");
  return valor;
}
