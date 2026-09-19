import { ErroOperacional } from "../services/erros.ts";
import type { Obra } from "../types/planta";

export const CURRENT_SCHEMA_VERSION = 1 as const;
export type SchemaVersion = 0 | typeof CURRENT_SCHEMA_VERSION;

export const COLECOES = {
  usuarios: "usuarios", obras: "obras", mapas: "mapas", kits: "kits", legendas: "legendas",
} as const;

// Identidade histórica dos dados que ainda não informam obraId. Não acompanha
// uma futura mudança da obra selecionada na inicialização.
export const OBRA_LEGADA_ID = "obra-principal";

// Escolha transitória da inicialização; serviços e hooks recebem a obra explícita.
export const OBRA_PADRAO_ID = OBRA_LEGADA_ID;
export const OBRA_PADRAO: Obra = {
  id: OBRA_PADRAO_ID,
  nome: "Obra principal",
};

export function lerSchemaVersion(valor: unknown): SchemaVersion {
  if (valor === undefined || valor === 0) return 0;
  if (valor === CURRENT_SCHEMA_VERSION) return valor;
  throw new ErroOperacional("validacao", "Versão dos dados não suportada. Atualize a aplicação ou contate o responsável.");
}

export function validarId(valor: string) {
  if (!valor.trim() || valor.includes("/")) throw new ErroOperacional("validacao", "Identificador inválido.");
  return valor;
}

export function lerObraIdDoKit(valor: unknown): string {
  if (valor === undefined) return OBRA_LEGADA_ID;
  if (typeof valor !== "string") throw new ErroOperacional("validacao", "Obra inválida no Kit. Solicite revisão administrativa.");
  return validarId(valor);
}
