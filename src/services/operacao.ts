import type { DisponibilidadeMaterial, Kit, Marcacoes, StatusConfig, Unidade } from "../types/planta.ts";

export interface ResumoExecucao {
  total: number; concluidas: number; restantes: number; andamento: number; bloqueadas: number; naoIniciadas: number; outros: number;
}
export interface NecessidadeMaterial {
  materialId: string; descricao: string; codigoSienge: string; unidadeMedida: string;
  quantidadePorUnidade: number; consumoEstimado: number; necessidadeRestante: number;
  fonte: "manual" | "sienge" | null; atualizadoEm: string | null;
  disponibilidade: number | null; deficit: number | null; capacidade: number | null;
}
export interface ResumoMateriais {
  materiais: NecessidadeMaterial[]; capacidade: number | null; deficitUnidades: number | null;
  materialLimitanteId: string | null; disponibilidadeCompleta: boolean;
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 1000) / 1000;
export function calcularResumoExecucao(unidades: Unidade[], marcacoes: Marcacoes, legendas: StatusConfig[]): ResumoExecucao {
  const categorias = new Map(legendas.map(item => [item.id, item.categoria]));
  const resumo: ResumoExecucao = { total: unidades.length, concluidas: 0, restantes: 0, andamento: 0, bloqueadas: 0, naoIniciadas: 0, outros: 0 };
  for (const unidade of unidades) {
    const categoria = marcacoes[unidade.id] ? categorias.get(marcacoes[unidade.id] as string) ?? "outro" : "nao-iniciado";
    if (categoria === "concluido") resumo.concluidas++;
    else if (categoria === "andamento") resumo.andamento++;
    else if (categoria === "bloqueado") resumo.bloqueadas++;
    else if (categoria === "nao-iniciado") resumo.naoIniciadas++;
    else resumo.outros++;
  }
  resumo.restantes = resumo.total - resumo.concluidas;
  return resumo;
}

export function calcularResumoMateriais(kit: Kit, execucao: ResumoExecucao, disponibilidades: DisponibilidadeMaterial[] = []): ResumoMateriais {
  const porMaterial = new Map(disponibilidades.map(item => [item.materialId, item]));
  let limitante: NecessidadeMaterial | undefined;
  const materiais = kit.materiais.map(material => {
    const informada = porMaterial.get(material.id)?.quantidade ?? material.disponibilidadeManual;
    const capacidadeBruta = informada === null ? null : Math.floor(informada / material.quantidadePorKit);
    const capacidade = capacidadeBruta === null ? null : Math.min(execucao.restantes, capacidadeBruta);
    const item: NecessidadeMaterial = { materialId: material.id, descricao: material.descricao, codigoSienge: material.codigoSienge,
      unidadeMedida: material.unidadeMedida, fonte: informada === null ? null : porMaterial.get(material.id)?.fonte ?? "manual",
      atualizadoEm: porMaterial.get(material.id)?.atualizadoEm ?? kit.atualizadoEm ?? null, quantidadePorUnidade: material.quantidadePorKit,
      consumoEstimado: arredondar(execucao.concluidas * material.quantidadePorKit),
      necessidadeRestante: arredondar(execucao.restantes * material.quantidadePorKit), disponibilidade: informada,
      deficit: informada === null ? null : arredondar(Math.max(0, execucao.restantes * material.quantidadePorKit - informada)), capacidade };
    if (capacidade !== null && (!limitante || capacidade < (limitante.capacidade ?? Infinity))) limitante = item;
    return item;
  });
  const disponibilidadeCompleta = materiais.every(item => item.disponibilidade !== null);
  const capacidade = disponibilidadeCompleta && materiais.length ? Math.min(...materiais.map(item => item.capacidade as number)) : null;
  return { materiais, capacidade, deficitUnidades: capacidade === null ? null : execucao.restantes - capacidade,
    materialLimitanteId: disponibilidadeCompleta && capacidade !== null && capacidade < execucao.restantes ? limitante?.materialId ?? null : null,
    disponibilidadeCompleta };
}
