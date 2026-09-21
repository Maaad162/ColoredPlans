import { ErroOperacional } from "./erros.ts";
import type { CategoriaExecucao, MaterialKit } from "../types/planta";
import { UNIDADE_BY_ID } from "../data/planta.ts";

export function validarLegenda(nome: string, cor: string) {
  if (!nome.trim() || nome.trim().length > 48 || !/^#[0-9a-f]{6}$/i.test(cor)) {
    throw new ErroOperacional("validacao", "Informe uma legenda de até 48 caracteres e uma cor válida.");
  }
}
export function validarUnidadesKit(valor: unknown, unidades: readonly string[] = Object.keys(UNIDADE_BY_ID)): string[] {
  if (!Array.isArray(valor) || valor.length > unidades.length || !valor.every((id: unknown) => typeof id === "string" && unidades.includes(id))
    || new Set(valor).size !== valor.length) throw new ErroOperacional("validacao", "As unidades do Kit são inválidas ou repetidas. Nenhuma unidade foi descartada.");
  return [...valor];
}
export function validarMateriais(valor: unknown): MaterialKit[] {
  if (!Array.isArray(valor) || !valor.length) throw new ErroOperacional("validacao", "Informe ao menos um material válido no Kit.");
  const ids = new Set<string>();
  return valor.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new ErroOperacional("validacao", "Existe um material inválido no Kit.");
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || !data.id.trim() || ids.has(data.id)
      || typeof data.codigoSienge !== "string" || data.codigoSienge.trim().length > 32
      || typeof data.descricao !== "string" || !data.descricao.trim() || data.descricao.trim().length > 100
      || typeof data.detalhe !== "string" || data.detalhe.trim().length > 180
      || typeof data.quantidadePorKit !== "number" || !Number.isFinite(data.quantidadePorKit) || data.quantidadePorKit <= 0) {
      throw new ErroOperacional("validacao", "Existem materiais inválidos ou repetidos no Kit. Solicite revisão; nenhum material foi descartado.");
    }
    ids.add(data.id);
    const unidadeMedida = data.unidadeMedida === undefined ? "un" : data.unidadeMedida;
    const disponibilidadeManual = data.disponibilidadeManual === undefined ? null : data.disponibilidadeManual;
    if (typeof unidadeMedida !== "string" || !unidadeMedida.trim() || unidadeMedida.trim().length > 12
      || (disponibilidadeManual !== null && (typeof disponibilidadeManual !== "number"
        || !Number.isFinite(disponibilidadeManual) || disponibilidadeManual < 0))) {
      throw new ErroOperacional("validacao", "A unidade de medida ou a disponibilidade informada é inválida.");
    }
    return { ...data, id: data.id, codigoSienge: data.codigoSienge.trim(), descricao: data.descricao.trim(), detalhe: data.detalhe.trim(),
      quantidadePorKit: data.quantidadePorKit, unidadeMedida: unidadeMedida.trim(), disponibilidadeManual };
  });
}

export const CATEGORIAS_EXECUCAO: CategoriaExecucao[] = ["nao-iniciado", "andamento", "concluido", "bloqueado", "outro"];
export function validarCategoriaExecucao(valor: unknown): CategoriaExecucao {
  if (!CATEGORIAS_EXECUCAO.includes(valor as CategoriaExecucao)) {
    throw new ErroOperacional("validacao", "A categoria operacional da legenda é inválida.");
  }
  return valor as CategoriaExecucao;
}
