import { BLOCOS } from "../data/planta.ts";
import { ErroOperacional } from "./erros.ts";
import type { Bloco, PlantaDefinition, PlantaObra, Unidade } from "../types/planta.ts";

// Apenas compatibilidade: documentos anteriores à hierarquia não tinham plantaId.
export const PLANTA_LEGADA_ID = "planta-principal";
export const TEMPLATE_LEGADO_ID = "original-v1";
export const PLANTA_LEGADA: PlantaObra = { id: PLANTA_LEGADA_ID, nome: "Planta do empreendimento", templateId: TEMPLATE_LEGADO_ID };
export const DEFINICAO_LEGADA: PlantaDefinition = { schemaVersion: 1, nome: "Empreendimento original", width: 1120, height: 690, decoracao: "original", blocos: BLOCOS };
export const unidadesDaPlanta = (definicao: PlantaDefinition) => definicao.blocos.flatMap(bloco => bloco.unidades);
export const idsDaPlanta = (definicao: PlantaDefinition) => unidadesDaPlanta(definicao).map(unidade => unidade.id);
export function plantaDoDocumento(valor: unknown): string {
  if (valor === undefined) return PLANTA_LEGADA_ID;
  if (typeof valor !== "string" || ["__proto__", "constructor", "prototype"].includes(valor) || !/^[a-zA-Z0-9_-]{1,128}$/.test(valor)) throw new ErroOperacional("validacao", "Identificador de planta inválido.");
  return valor;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErroOperacional("validacao", "Definição de planta inválida.");
  return valor as Record<string, unknown>;
}
function texto(valor: unknown, limite = 100): string {
  if (typeof valor !== "string" || !valor.trim() || valor.length > limite) throw new ErroOperacional("validacao", "Texto inválido na definição da planta.");
  return valor;
}
function numero(valor: unknown, positivo = false): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 20000 || (positivo && !valor)) throw new ErroOperacional("validacao", "Geometria inválida na planta.");
  return valor;
}
export function validarDefinicao(valor: unknown): PlantaDefinition {
  const data = objeto(valor);
  if (data.schemaVersion !== 1 || !Array.isArray(data.blocos) || !data.blocos.length || data.blocos.length > 100
    || (data.decoracao !== undefined && data.decoracao !== "original")) throw new ErroOperacional("validacao", "Schema da definição não suportado.");
  const width = numero(data.width, true), height = numero(data.height, true);
  const ids = new Set<string>(), blocosIds = new Set<string>(), enderecos = new Set<string>();
  const retangulo = (item: Record<string, unknown>) => {
    const rect = { x: numero(item.x), y: numero(item.y), width: numero(item.width, true), height: numero(item.height, true) };
    if (rect.x + rect.width > width || rect.y + rect.height > height) throw new ErroOperacional("validacao", "Geometria fora dos limites da planta.");
    return rect;
  };
  const blocos: Bloco[] = data.blocos.map((valor: unknown) => {
    const bloco = objeto(valor), id = plantaDoDocumento(texto(bloco.id));
    if (blocosIds.has(id) || !Array.isArray(bloco.unidades) || !bloco.unidades.length) throw new ErroOperacional("validacao", "Bloco repetido ou sem unidades.");
    blocosIds.add(id);
    const unidades: Unidade[] = bloco.unidades.map((valor: unknown) => {
      const unidade = objeto(valor), unidadeId = plantaDoDocumento(texto(unidade.id, 128));
      const numeroUnidade = texto(unidade.numero, 40), endereco = `${id}/${numeroUnidade}`;
      if (unidade.bloco !== id || ids.has(unidadeId) || enderecos.has(endereco)) throw new ErroOperacional("validacao", "Unidades repetidas ou bloco inconsistente.");
      ids.add(unidadeId); enderecos.add(endereco);
      return { id: unidadeId, bloco: id, numero: numeroUnidade, ...(unidade.label === undefined ? {} : { label: texto(unidade.label) }), ...retangulo(unidade) };
    });
    return { id, nome: texto(bloco.nome), ...retangulo(bloco), unidades };
  });
  if (ids.size > 1000) throw new ErroOperacional("validacao", "Divida a planta em setores de até 1000 unidades.");
  return { schemaVersion: 1, nome: texto(data.nome), width, height, blocos, ...(data.decoracao === "original" ? { decoracao: "original" } : {}) };
}
