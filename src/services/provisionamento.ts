import { ErroOperacional } from "./erros.ts";
import { idsDaPlanta, plantaDoDocumento, PLANTA_LEGADA_ID, TEMPLATE_LEGADO_ID, validarDefinicao } from "./geometria.ts";

export interface DocumentoProvisionado { caminho: string; dados: Record<string, unknown> }
function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErroOperacional("validacao", "Configuração inválida.");
  return valor as Record<string, unknown>;
}
function texto(valor: unknown): string {
  if (typeof valor !== "string" || !valor.trim() || valor.length > 100) throw new ErroOperacional("validacao", "Nome ou identificador inválido.");
  return valor;
}
function lista(valor: unknown): unknown[] {
  if (!Array.isArray(valor)) throw new ErroOperacional("validacao", "Lista de configuração inválida.");
  return valor;
}
// Plano de criação: não contém exclusões, sobrescritas, credenciais ou estado operacional antigo.
export function prepararProvisionamento(valor: unknown, uid: string): DocumentoProvisionado[] {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(uid)) throw new ErroOperacional("validacao", "UID inválido.");
  const config = objeto(valor), obra = objeto(config.obra);
  if (config.version !== 1) throw new ErroOperacional("validacao", "Versão de configuração não suportada.");
  const obraId = plantaDoDocumento(texto(obra.id));
  const base = `usuarios/${uid}/obras/${obraId}`;
  const registros: DocumentoProvisionado[] = [{ caminho: base, dados: { userId: uid, schemaVersion: 1, nome: texto(obra.nome), status: "ativa", plantaLegada: false } }];
  const templates = new Set([TEMPLATE_LEGADO_ID]);
  for (const valor of lista(config.templates ?? [])) {
    const template = objeto(valor), id = plantaDoDocumento(texto(template.id));
    if (templates.has(id)) throw new ErroOperacional("validacao", "Template repetido ou reservado.");
    templates.add(id);
    const definicao = validarDefinicao(template.definicao);
    registros.push({ caminho: `${base}/templates/${id}`, dados: { schemaVersion: 1, definicao, unidadeIds: idsDaPlanta(definicao) } });
  }
  const plantas = new Set<string>();
  for (const valor of lista(config.plantas)) {
    const planta = objeto(valor), id = plantaDoDocumento(texto(planta.id)), templateId = plantaDoDocumento(texto(planta.templateId));
    if (plantas.has(id) || !templates.has(templateId) || (id === PLANTA_LEGADA_ID && templateId !== TEMPLATE_LEGADO_ID)) throw new ErroOperacional("validacao", "Planta repetida, reservada ou sem template válido.");
    plantas.add(id);
    registros.push({ caminho: `${base}/plantas/${id}`, dados: { schemaVersion: 1, nome: texto(planta.nome), templateId } });
  }
  if (!plantas.size) throw new ErroOperacional("validacao", "Informe ao menos uma planta.");
  const equipes = new Set<string>();
  for (const valor of lista(config.equipes ?? [])) {
    const equipe = objeto(valor), id = plantaDoDocumento(texto(equipe.id));
    if (equipes.has(id)) throw new ErroOperacional("validacao", "Equipe repetida.");
    equipes.add(id); registros.push({ caminho: `${base}/equipes/${id}`, dados: { schemaVersion: 1, nome: texto(equipe.nome) } });
  }
  if (registros.length > 400) throw new ErroOperacional("validacao", "Divida o provisionamento em lotes menores.");
  return registros;
}
