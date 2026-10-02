import { ErroOperacional } from "./erros.ts";

export const NIVEIS = ["tecnico", "engenheiro", "coordenador", "gestor", "dev"] as const;
export type NivelHierarquico = typeof NIVEIS[number];
export const NOMES_NIVEIS: Record<NivelHierarquico, string> = {
  tecnico: "Técnico", engenheiro: "Engenheiro", coordenador: "Coordenador", gestor: "Gestor", dev: "DEV",
};

/** O espaço aponta para o UID estrutural existente; nunca para o nome da obra. */
export interface HierarquiaUsuario {
  nivel: NivelHierarquico;
  espacoId: string;
  superiorId: string | null;
  obraIds: string[];
}

export function nivelValido(valor: unknown): valor is NivelHierarquico {
  return typeof valor === "string" && NIVEIS.some(nivel => nivel === valor);
}

function idValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(valor);
}

export function lerHierarquia(data: Record<string, unknown>, uid: string): HierarquiaUsuario {
  if (!nivelValido(data.nivel) || !idValido(data.espacoId)
    || !(data.superiorId === null || idValido(data.superiorId))
    || (data.nivel === "dev" ? data.superiorId !== null : !idValido(data.superiorId) || data.superiorId === uid)
    || !Array.isArray(data.obraIds) || data.obraIds.length > 30
    || !data.obraIds.every(idValido) || new Set(data.obraIds).size !== data.obraIds.length) {
    throw new ErroOperacional("validacao", "Hierarquia inválida. Solicite revisão administrativa.");
  }
  return { nivel: data.nivel, espacoId: data.espacoId, superiorId: data.superiorId, obraIds: data.obraIds };
}

export function permissoes(hierarquia?: HierarquiaUsuario, tipoConta = "apontamento") {
  const nivel = hierarquia?.nivel;
  const gerenciar = !nivel || nivel === "tecnico" || nivel === "engenheiro" || nivel === "dev";
  const kits = nivel === "engenheiro" || nivel === "coordenador"
    || ((!nivel || nivel === "tecnico" || nivel === "dev") && tipoConta === "estoque");
  return { apontar: !nivel || nivel === "tecnico" || nivel === "dev",
    gerenciar, kits, administrar: nivel === "dev" };
}

/** Autoria já persistida; mapas antigos sem autor não são apropriados pelo Engenheiro. */
export function podeAlterarMapa(hierarquia: HierarquiaUsuario | undefined, usuarioId: string, mapa?: { criadoPor?: string }) {
  return !!mapa && (hierarquia?.nivel !== "engenheiro" || mapa.criadoPor === usuarioId);
}

/** Migração explícita só do perfil, preservando todos os campos e os caminhos de dados. */
export function migrarPerfilV2(uid: string, anterior: Record<string, unknown>, hierarquia: HierarquiaUsuario) {
  if (anterior.userId !== uid || ![undefined, 0, 1, 2].includes(anterior.schemaVersion as number | undefined)
    || !["apontamento", "estoque"].includes(String(anterior.tipoConta))) {
    throw new ErroOperacional("validacao", "Perfil de origem incompatível com a migração.");
  }
  return { ...anterior, schemaVersion: 2, ...lerHierarquia({ ...hierarquia }, uid) };
}
