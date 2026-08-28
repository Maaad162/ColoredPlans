import type {
  ArquivoMarcacoes,
  Marcacoes,
  StatusConfig,
  StatusId,
  Unidade,
} from "../types/planta";

const ABA_ATIVA_STORAGE_PREFIX = "lm-colored-plans:aba-ativa:v3";

export function carregarAbaAtiva(usuarioId: string): string | null {
  try {
    return localStorage.getItem(`${ABA_ATIVA_STORAGE_PREFIX}:${usuarioId}`);
  } catch {
    return null;
  }
}

export function salvarAbaAtiva(usuarioId: string, mapaId: string) {
  try {
    localStorage.setItem(`${ABA_ATIVA_STORAGE_PREFIX}:${usuarioId}`, mapaId);
  } catch {
    // A preferência local é opcional; os mapas continuam no Firestore.
  }
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
  legendas: StatusConfig[],
): Marcacoes {
  if (!conteudo || typeof conteudo !== "object") {
    throw new Error("O arquivo não contém um objeto JSON válido.");
  }

  const candidatas = (conteudo as { unidades?: unknown }).unidades;
  if (!Array.isArray(candidatas)) {
    throw new Error('O campo "unidades" deve ser uma lista.');
  }

  const idsValidos = new Set(unidades.map((unidade) => unidade.id));
  const idsDeStatus = new Set(legendas.map((legenda) => legenda.id));
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
