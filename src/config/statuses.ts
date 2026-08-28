import type { LegendaUsuario, StatusConfig, StatusId } from "../types/planta";

export const STATUS_SEM_MARCACAO = {
  id: "sem-marcacao" as const,
  nome: "Não definido",
  cor: "#ffffff",
  corTexto: "#17211d",
  simbolo: "○",
};

export const STATUSES: StatusConfig[] = [
  {
    id: "concluido",
    nome: "Concluído",
    cor: "#23875d",
    corTexto: "#ffffff",
    simbolo: "✓",
  },
  {
    id: "andamento",
    nome: "Em andamento",
    cor: "#e7b928",
    corTexto: "#201b0b",
    simbolo: "↗",
  },
  {
    id: "pendente",
    nome: "Pendente",
    cor: "#d9574f",
    corTexto: "#ffffff",
    simbolo: "!",
  },
  {
    id: "vistoria",
    nome: "Vistoria",
    cor: "#3979c6",
    corTexto: "#ffffff",
    simbolo: "◆",
  },
  {
    id: "outro",
    nome: "Outro",
    cor: "#8059b6",
    corTexto: "#ffffff",
    simbolo: "•",
  },
];

export function corTextoParaFundo(cor: string) {
  const hex = cor.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((inicio) =>
    Number.parseInt(hex.slice(inicio, inicio + 2), 16),
  );
  const luminancia = (r * 299 + g * 587 + b * 114) / 1000;
  return luminancia > 155 ? "#17211d" : "#ffffff";
}

export function simboloDaLegenda(nome: string) {
  return nome.trim().charAt(0).toLocaleUpperCase() || "•";
}

export function getStatus(
  statusId: StatusId | null | undefined,
  legendas: StatusConfig[] = STATUSES,
) {
  if (!statusId) return STATUS_SEM_MARCACAO;
  return (
    legendas.find((legenda) => legenda.id === statusId) ?? {
      id: statusId,
      nome: "Legenda indisponível",
      cor: "#8b9690",
      corTexto: "#ffffff",
      simbolo: "?",
    }
  );
}

export function legendaPadraoParaUsuario(
  status: StatusConfig,
  usuarioId: string,
): LegendaUsuario {
  return {
    ...status,
    userId: usuarioId,
    criadoEm: new Date().toISOString(),
  };
}
