import type { StatusConfig, StatusId } from "../types/planta";

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

export const STATUS_BY_ID = Object.fromEntries(
  STATUSES.map((status) => [status.id, status]),
) as Record<StatusId, StatusConfig>;

export function getStatus(statusId: StatusId | null | undefined) {
  return statusId ? STATUS_BY_ID[statusId] : STATUS_SEM_MARCACAO;
}
