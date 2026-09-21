import { ErroOperacional } from "./erros.ts";
import { OBRA_LEGADA_ID } from "../config/dados.ts";
import { validarDefinicao, idsDaPlanta } from "./geometria.ts";
import type { ContextoExportacao } from "../types/planta";
import type {
  ArquivoMarcacoes,
  Marcacoes,
  MapaServico,
  StatusConfig,
  StatusId,
  Unidade,
} from "../types/planta";

const ABA_ATIVA_STORAGE_PREFIX = "lm-colored-plans:aba-ativa:v3";

export function criarCsvMapas(mapas: MapaServico[], unidades: Unidade[], legendas: StatusConfig[]) {
  const nomes = new Map(legendas.map((legenda) => [legenda.id, legenda.nome]));
  const campo = (valor: string) => {
    // Evita que nomes fornecidos pelo usuário sejam executados como fórmulas.
    const seguro = /^[\s]*[=+@-]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const linhas = [["Mapa", "Bloco", "Número da unidade", "Status"]];
  for (const mapa of mapas) {
    for (const unidade of unidades) {
      const status = mapa.marcacoes[unidade.id];
      linhas.push([mapa.nome, unidade.bloco, unidade.numero,
        status ? nomes.get(status) ?? status : "Sem marcação"]);
    }
  }
  return "\uFEFF" + linhas.map((linha) => linha.map(campo).join(";")).join("\r\n") + "\r\n";
}

export function baixarCsvMapas(mapas: MapaServico[], unidades: Unidade[], legendas: StatusConfig[]) {
  const blob = new Blob([criarCsvMapas(mapas, unidades, legendas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `todos-os-mapas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function carregarAbaAtiva(usuarioId: string, obraId: string): string | null {
  try {
    return localStorage.getItem(`${ABA_ATIVA_STORAGE_PREFIX}:${usuarioId}:${obraId}`)
      ?? (obraId === OBRA_LEGADA_ID ? localStorage.getItem(`${ABA_ATIVA_STORAGE_PREFIX}:${usuarioId}`) : null);
  } catch {
    // Preferência opcional: sem localStorage, os mapas continuam no Firestore.
    return null;
  }
}

export function salvarAbaAtiva(usuarioId: string, obraId: string, mapaId: string) {
  try {
    localStorage.setItem(`${ABA_ATIVA_STORAGE_PREFIX}:${usuarioId}:${obraId}`, mapaId);
  } catch {
    // Navegação segue em memória quando o navegador bloqueia preferências locais.
    // A preferência local é opcional; os mapas continuam no Firestore.
  }
}

export function criarArquivoExportacao(
  unidades: Unidade[],
  marcacoes: Marcacoes,
  nomeMapa?: string,
  contexto?: ContextoExportacao,
): ArquivoMarcacoes {
  return {
    version: contexto ? 2 : 1,
    ...(contexto ? { contexto } : {}),
    updatedAt: new Date().toISOString(),
    ...(nomeMapa ? { mapa: { nome: nomeMapa } } : {}),
    unidades: unidades.map((unidade) => ({
      ...(contexto ? { id: unidade.id } : {}),
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
  contexto?: ContextoExportacao,
) {
  const arquivo = criarArquivoExportacao(unidades, marcacoes, nomeMapa, contexto);
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
  contexto?: ContextoExportacao,
): Marcacoes {
  if (!conteudo || typeof conteudo !== "object") {
    throw new ErroOperacional("validacao", "O arquivo não contém um objeto JSON válido.");
  }

  const version = (conteudo as { version?: unknown }).version;
  // Arquivos antigos sem versão continuam compatíveis com o formato atual.
  if (version !== undefined && version !== 1 && version !== 2) {
    throw new ErroOperacional("validacao", "Versão do arquivo não suportada. Importe um arquivo JSON de versão 1 ou 2.");
  }

  if (version === 2) {
    const arquivo = conteudo as { contexto?: Partial<ContextoExportacao> };
    const origem = arquivo.contexto;
    if (!contexto || origem?.obra?.id !== contexto.obra.id || origem?.planta?.id !== contexto.planta.id
      || origem.mapaId !== contexto.mapaId || origem.planta.templateId !== contexto.planta.templateId
      || origem.kit?.id !== contexto.kit?.id) throw new ErroOperacional("validacao", "O arquivo pertence a outra obra, planta, mapa ou Kit.");
    const ids = idsDaPlanta(validarDefinicao(origem.definicao));
    if (ids.length !== unidades.length || ids.some(id => !unidades.some(u => u.id === id))) throw new ErroOperacional("validacao", "A geometria do arquivo não corresponde à planta atual.");
  }

  const candidatas = (conteudo as { unidades?: unknown }).unidades;
  if (!Array.isArray(candidatas)) {
    throw new ErroOperacional("validacao", 'O campo "unidades" deve ser uma lista.');
  }

  const idsValidos = new Set(unidades.map((unidade) => unidade.id));
  const idsDeStatus = new Set(legendas.map((legenda) => legenda.id));
  const encontrados = new Set<string>();
  const marcacoes: Marcacoes = {};

  for (const item of candidatas) {
    if (!item || typeof item !== "object") {
      throw new ErroOperacional("validacao", "Existe uma unidade com formato inválido.");
    }

    const { bloco, numero, status } = item as Record<string, unknown>;
    if (typeof bloco !== "string" || typeof numero !== "string") {
      throw new ErroOperacional("validacao", "Toda unidade precisa de bloco e número em texto.");
    }

    const id = version === 2 ? (item as Record<string, unknown>).id : unidades.find(u => u.bloco === bloco && u.numero === numero)?.id;
    if (typeof id !== "string") throw new ErroOperacional("validacao", "Identidade da unidade inválida no arquivo.");
    if (!idsValidos.has(id)) {
      throw new ErroOperacional("validacao", `A unidade ${bloco}/${numero} não existe nesta planta.`);
    }
    if (encontrados.has(id)) {
      throw new ErroOperacional("validacao", `A unidade ${bloco}/${numero} aparece mais de uma vez.`);
    }
    if (status !== null && !idsDeStatus.has(status as StatusId)) {
      throw new ErroOperacional("validacao", `Status inválido na unidade ${bloco}/${numero}.`);
    }

    encontrados.add(id);
    if (status !== null) marcacoes[id] = status as StatusId;
  }

  if (candidatas.length === 0) {
    throw new ErroOperacional("validacao", "O arquivo não contém unidades.");
  }

  return marcacoes;
}
