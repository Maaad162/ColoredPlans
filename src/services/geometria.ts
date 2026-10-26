import { BLOCOS } from "../data/planta.ts";
import { ErroOperacional } from "./erros.ts";
import type { AreaComum, Bloco, CategoriaAreaComum, PlantaDefinition, PlantaObra, PontoPlanta, Unidade } from "../types/planta.ts";

// Apenas compatibilidade: documentos anteriores à hierarquia não tinham plantaId.
export const PLANTA_LEGADA_ID = "planta-principal";
export const TEMPLATE_LEGADO_ID = "original-v1";
export const PLANTA_LEGADA: PlantaObra = { id: PLANTA_LEGADA_ID, nome: "Planta do empreendimento", templateId: TEMPLATE_LEGADO_ID };
export const DEFINICAO_LEGADA: PlantaDefinition = { schemaVersion: 1, nome: "Empreendimento original", width: 1120, height: 690, decoracao: "original", blocos: BLOCOS };
// Agrupamento operacional, separado dos blocos habitacionais.
export const AREAS_COMUNS_GRUPO = "areas-comuns";
export function unidadeDaArea(area: AreaComum): Unidade {
  return {
    id: area.id, tipo: "area-comum", bloco: AREAS_COMUNS_GRUPO, numero: area.id, label: area.nome,
    x: area.x, y: area.y, width: area.width, height: area.height,
    ...(area.linhasRotulo ? { linhasRotulo: area.linhasRotulo } : {}),
    ...(area.rotacaoRotulo ? { rotacaoRotulo: area.rotacaoRotulo } : {}),
  };
}
export const unidadesDaPlanta = (definicao: PlantaDefinition): Unidade[] => [
  ...definicao.blocos.flatMap(bloco => bloco.unidades), ...(definicao.areasComuns ?? []).map(unidadeDaArea),
];
export const idsDaPlanta = (definicao: PlantaDefinition) => unidadesDaPlanta(definicao).map(unidade => unidade.id);
export const rotuloDaUnidade = (unidade: Unidade) => unidade.tipo === "area-comum"
  ? `Área comum · ${unidade.label ?? unidade.numero}` : `Bloco ${unidade.bloco} · Unidade ${unidade.numero}`;
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
      if (unidade.bloco !== id || ids.has(unidadeId) || enderecos.has(endereco)
        || (unidade.tipo !== undefined && unidade.tipo !== "moradia")) throw new ErroOperacional("validacao", "Unidades repetidas ou bloco inconsistente.");
      ids.add(unidadeId); enderecos.add(endereco);
      return { id: unidadeId, bloco: id, numero: numeroUnidade, ...(unidade.tipo === "moradia" ? { tipo: "moradia" as const } : {}),
        ...(unidade.label === undefined ? {} : { label: texto(unidade.label) }), ...retangulo(unidade) };
    });
    if (bloco.posicaoTitulo !== undefined && bloco.posicaoTitulo !== "superior" && bloco.posicaoTitulo !== "inferior") throw new ErroOperacional("validacao", "Posição do título inválida.");
    const fileiras = bloco.rotulosFileiras === undefined ? undefined : objeto(bloco.rotulosFileiras);
    return { id, nome: texto(bloco.nome), ...retangulo(bloco), unidades,
      ...(bloco.posicaoTitulo ? { posicaoTitulo: bloco.posicaoTitulo as Bloco["posicaoTitulo"] } : {}),
      ...(fileiras ? { rotulosFileiras: { superior: texto(fileiras.superior, 8), inferior: texto(fileiras.inferior, 8) } } : {}) };
  });
  let areasComuns: AreaComum[] | undefined;
  if (data.areasComuns !== undefined) {
    if (!Array.isArray(data.areasComuns) || data.areasComuns.length > 100 || blocosIds.has(AREAS_COMUNS_GRUPO)) throw new ErroOperacional("validacao", "Áreas comuns inválidas ou grupo reservado.");
    const categorias: CategoriaAreaComum[] = ["bicicletario", "residuos", "parque-infantil", "centro-comunitario", "academia"];
    areasComuns = data.areasComuns.map((valor: unknown) => {
      const area = objeto(valor), id = plantaDoDocumento(texto(area.id, 128));
      if (ids.has(id) || !categorias.includes(area.categoria as CategoriaAreaComum)
        || (area.rotacaoRotulo !== undefined && area.rotacaoRotulo !== -90)) throw new ErroOperacional("validacao", "Área comum repetida ou inválida.");
      ids.add(id);
      let linhasRotulo: string[] | undefined;
      if (area.linhasRotulo !== undefined) {
        if (!Array.isArray(area.linhasRotulo) || !area.linhasRotulo.length || area.linhasRotulo.length > 4) throw new ErroOperacional("validacao", "Rótulo da área inválido.");
        linhasRotulo = area.linhasRotulo.map(linha => texto(linha, 40));
      }
      return { id, nome: texto(area.nome), categoria: area.categoria as CategoriaAreaComum, ...retangulo(area),
        ...(linhasRotulo ? { linhasRotulo } : {}), ...(area.rotacaoRotulo === -90 ? { rotacaoRotulo: -90 as const } : {}) };
    });
  }
  let implantacao: PlantaDefinition["implantacao"];
  if (data.implantacao !== undefined) {
    const implantacaoData = objeto(data.implantacao);
    const poligono = (valor: unknown): PontoPlanta[] => {
      if (!Array.isArray(valor) || valor.length < 3 || valor.length > 64) throw new ErroOperacional("validacao", "Polígono inválido na planta.");
      return valor.map(item => {
        const ponto = objeto(item), x = numero(ponto.x), y = numero(ponto.y);
        if (x > width || y > height) throw new ErroOperacional("validacao", "Ponto fora dos limites da planta.");
        return { x, y };
      });
    };
    if (!Array.isArray(implantacaoData.circulacao) || implantacaoData.circulacao.length > 32) throw new ErroOperacional("validacao", "Circulação inválida na planta.");
    implantacao = { limite: poligono(implantacaoData.limite), circulacao: implantacaoData.circulacao.map(item => ({ pontos: poligono(objeto(item).pontos) })) };
  }
  if (ids.size > 1000) throw new ErroOperacional("validacao", "Divida a planta em setores de até 1000 unidades.");
  return { schemaVersion: 1, nome: texto(data.nome), width, height, blocos,
    ...(areasComuns ? { areasComuns } : {}), ...(implantacao ? { implantacao } : {}),
    ...(data.decoracao === "original" ? { decoracao: "original" } : {}) };
}