import type { StatusConfig, StatusId } from "../types/planta";
import type { CategoriaExecucao } from "../types/planta";

export function categoriaLegada(id: string, nome: string): CategoriaExecucao {
  const valor = `${id} ${nome}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (valor.includes("conclu") || valor.includes("feito") || valor.includes("finaliz")) return "concluido";
  if (valor.includes("andamento") || valor.includes("vistoria")) return "andamento";
  if (valor.includes("bloque") || valor.includes("pendent")) return "bloqueado";
  if (valor.includes("nao iniciado") || valor.includes("aguardando")) return "nao-iniciado";
  return "outro";
}

export const STATUS_SEM_MARCACAO = {
  id: "sem-marcacao" as const,
  nome: "Não definido",
  cor: "#ffffff",
  corTexto: "#17211d",
  simbolo: "○",
  categoria: "nao-iniciado" as const,
};

export const STATUSES: StatusConfig[] = [
  {
    id: "concluido",
    nome: "Concluído",
    cor: "#23875d",
    corTexto: "#ffffff",
    simbolo: "✓",
    categoria: "concluido",
  },
  {
    id: "andamento",
    nome: "Em andamento",
    cor: "#e7b928",
    corTexto: "#201b0b",
    simbolo: "↗",
    categoria: "andamento",
  },
  {
    id: "pendente",
    nome: "Pendente",
    cor: "#d9574f",
    corTexto: "#ffffff",
    simbolo: "!",
    categoria: "bloqueado",
  },
  {
    id: "vistoria",
    nome: "Vistoria",
    cor: "#3979c6",
    corTexto: "#ffffff",
    simbolo: "◆",
    categoria: "andamento",
  },
  {
    id: "outro",
    nome: "Outro",
    cor: "#8059b6",
    corTexto: "#ffffff",
    simbolo: "•",
    categoria: "outro",
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
      categoria: "outro" as const,
    }
  );
}
