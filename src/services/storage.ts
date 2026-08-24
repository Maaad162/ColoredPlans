import { STATUSES } from "../config/statuses";
import type {
  ArquivoMarcacoes,
  EstadoMapas,
  Marcacoes,
  StatusId,
  Unidade,
} from "../types/planta";

const LEGACY_STORAGE_KEY = "lm-colored-plans:marcacoes:v1";
const MAPAS_STORAGE_KEY = "lm-colored-plans:mapas:v2";

const idsDeStatus = new Set(STATUSES.map((status) => status.id));

function normalizarMarcacoes(valor: unknown): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};

  return Object.fromEntries(
    Object.entries(valor).filter(
      ([, status]) => status === null || idsDeStatus.has(status as StatusId),
    ),
  ) as Marcacoes;
}

function carregarMarcacoesLegadas(): Marcacoes {
  try {
    const salvo = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!salvo) return {};
    return normalizarMarcacoes(JSON.parse(salvo));
  } catch {
    return {};
  }
}

function criarEstadoInicial(): EstadoMapas {
  return {
    version: 2,
    abaAtivaId: "mapa-principal",
    abas: [
      {
        id: "mapa-principal",
        nome: "Mapa principal",
        marcacoes: carregarMarcacoesLegadas(),
        criadoEm: new Date().toISOString(),
      },
    ],
  };
}

export function carregarEstadoMapas(): EstadoMapas {
  try {
    const salvo = localStorage.getItem(MAPAS_STORAGE_KEY);
    if (!salvo) return criarEstadoInicial();

    const parsed: unknown = JSON.parse(salvo);
    if (!parsed || typeof parsed !== "object") return criarEstadoInicial();

    const candidato = parsed as Partial<EstadoMapas>;
    if (candidato.version !== 2 || !Array.isArray(candidato.abas)) {
      return criarEstadoInicial();
    }

    const ids = new Set<string>();
    const abas = candidato.abas.flatMap((aba) => {
      if (
        !aba ||
        typeof aba.id !== "string" ||
        typeof aba.nome !== "string" ||
        !aba.nome.trim() ||
        ids.has(aba.id)
      ) {
        return [];
      }
      ids.add(aba.id);
      return [
        {
          id: aba.id,
          nome: aba.nome.trim().slice(0, 48),
          marcacoes: normalizarMarcacoes(aba.marcacoes),
          criadoEm:
            typeof aba.criadoEm === "string"
              ? aba.criadoEm
              : new Date().toISOString(),
        },
      ];
    });

    if (abas.length === 0) return criarEstadoInicial();
    const abaAtivaId = abas.some((aba) => aba.id === candidato.abaAtivaId)
      ? candidato.abaAtivaId!
      : abas[0].id;

    return { version: 2, abaAtivaId, abas };
  } catch {
    return criarEstadoInicial();
  }
}

export function salvarEstadoMapas(estado: EstadoMapas) {
  localStorage.setItem(MAPAS_STORAGE_KEY, JSON.stringify(estado));
}

export function criarArquivoExportacao(
  unidades: Unidade[],
  marcacoes: Marcacoes,
  nomeMapa?: string,
): ArquivoMarcacoes {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...(nomeMapa ? { mapa: { nome: nomeMapa } } : {}),
    unidades: unidades.map((unidade) => ({
      bloco: unidade.bloco,
      numero: unidade.numero,
      status: marcacoes[unidade.id] ?? null,
    })),
  };
}

export function baixarMarcacoes(
  unidades: Unidade[],
  marcacoes: Marcacoes,
  nomeMapa?: string,
) {
  const arquivo = criarArquivoExportacao(unidades, marcacoes, nomeMapa);
  const blob = new Blob([JSON.stringify(arquivo, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const nomeSeguro = nomeMapa
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  link.download = `marcacoes${nomeSeguro ? `-${nomeSeguro}` : ""}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function validarArquivoImportacao(
  conteudo: unknown,
  unidades: Unidade[],
): Marcacoes {
  if (!conteudo || typeof conteudo !== "object") {
    throw new Error("O arquivo não contém um objeto JSON válido.");
  }

  const candidatas = (conteudo as { unidades?: unknown }).unidades;
  if (!Array.isArray(candidatas)) {
    throw new Error('O campo "unidades" deve ser uma lista.');
  }

  const idsValidos = new Set(unidades.map((unidade) => unidade.id));
  const encontrados = new Set<string>();
  const marcacoes: Marcacoes = {};

  for (const item of candidatas) {
    if (!item || typeof item !== "object") {
      throw new Error("Existe uma unidade com formato inválido.");
    }

    const { bloco, numero, status } = item as Record<string, unknown>;
    if (typeof bloco !== "string" || typeof numero !== "string") {
      throw new Error("Toda unidade precisa de bloco e número em texto.");
    }

    const id = `bloco-${bloco}-${numero}`;
    if (!idsValidos.has(id)) {
      throw new Error(`A unidade ${bloco}/${numero} não existe nesta planta.`);
    }
    if (encontrados.has(id)) {
      throw new Error(`A unidade ${bloco}/${numero} aparece mais de uma vez.`);
    }
    if (status !== null && !idsDeStatus.has(status as StatusId)) {
      throw new Error(`Status inválido na unidade ${bloco}/${numero}.`);
    }

    encontrados.add(id);
    if (status !== null) marcacoes[id] = status as StatusId;
  }

  if (candidatas.length === 0) {
    throw new Error("O arquivo não contém unidades.");
  }

  return marcacoes;
}
