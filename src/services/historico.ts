import { collection, doc, writeBatch, serverTimestamp, deleteField, type Firestore } from "firebase/firestore";
import { COLECOES, CURRENT_SCHEMA_VERSION, validarId } from "../config/dados.ts";
import { UNIDADE_BY_ID } from "../data/planta.ts";
import { ErroOperacional } from "./erros.ts";
import type { MapaServico, Marcacoes } from "../types/planta";

export type AcaoHistorico = "unidade" | "marcacoes" | "criar" | "renomear" | "excluir";
export type ComandoMapa = { mapa: MapaServico } & (
  { acao: "unidade"; unidadeId: string; status: string | null }
  | { acao: "marcacoes"; marcacoes: Marcacoes }
  | { acao: "renomear"; nome: string }
  | { acao: "criar" | "excluir" }
);
export interface EventoHistorico {
  id: string; acao: AcaoHistorico; userId: string; mapaId: string; mapaNome: string;
  unidadeIds: string[]; antes: Marcacoes; depois: Marcacoes;
  nomeAnterior: string | null; nomeAtual: string | null; criadoEm: string | null; pendente: boolean;
}
export function historicoCollection(db: Firestore, uid: string, obraId: string) {
  return collection(db, COLECOES.usuarios, validarId(uid), COLECOES.obras, validarId(obraId), "historico");
}
export function validarMarcacoes(marcacoes: Marcacoes) {
  if (Object.entries(marcacoes).some(([id, status]) => !UNIDADE_BY_ID[id]
    || (status !== null && (typeof status !== "string" || !status || status.length > 128)))) {
    throw new ErroOperacional("validacao", "As marcações contêm unidades ou estados inválidos.");
  }
}
export function unidadesAlteradas(antes: Marcacoes, depois: Marcacoes) {
  return [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(id => antes[id] !== depois[id]);
}

export function gravarComHistorico(db: Firestore, uid: string, obraId: string, comando: ComandoMapa): Promise<void> {
  const { mapa, acao } = comando;
  if (mapa.userId !== uid || mapa.obraId !== obraId) throw new ErroOperacional("permissao", "O mapa pertence a outra conta ou obra.");
  const referencia = doc(db, COLECOES.usuarios, validarId(uid), COLECOES.obras, validarId(obraId), COLECOES.mapas, validarId(mapa.id));
  const evento = doc(historicoCollection(db, uid, obraId));
  const lote = writeBatch(db);
  let antes: Marcacoes = {}, depois: Marcacoes = {}, unidadeIds: string[] = [];
  let nomeAtual: string | null = mapa.nome;
  const metadados = { schemaVersion: CURRENT_SCHEMA_VERSION, obraId, atualizadoEm: serverTimestamp(), atualizadoPor: uid, ultimoEventoId: evento.id };
  if (acao === "unidade") {
    antes = { [comando.unidadeId]: mapa.marcacoes[comando.unidadeId] ?? null };
    depois = { [comando.unidadeId]: comando.status };
    validarMarcacoes(depois);
    if (antes[comando.unidadeId] === comando.status) return Promise.resolve();
    unidadeIds = [comando.unidadeId];
    lote.update(referencia, { ...metadados, [`marcacoes.${comando.unidadeId}`]: comando.status ?? deleteField() });
  } else if (acao === "marcacoes") {
    antes = { ...mapa.marcacoes }; depois = { ...comando.marcacoes };
    validarMarcacoes(antes); validarMarcacoes(depois);
    unidadeIds = unidadesAlteradas(antes, depois);
    if (!unidadeIds.length) return Promise.resolve();
    lote.update(referencia, { ...metadados, marcacoes: depois });
  } else if (acao === "criar") {
    lote.set(referencia, { ...metadados, userId: uid, tipo: "manual", kitUnidadeIds: [], nome: mapa.nome,
      marcacoes: {}, criadoEm: serverTimestamp(), criadoPor: uid });
  } else if (acao === "renomear") {
    nomeAtual = comando.nome.trim();
    if (!nomeAtual || nomeAtual.length > 48) throw new ErroOperacional("validacao", "Informe um nome de mapa com até 48 caracteres.");
    if (nomeAtual === mapa.nome) return Promise.resolve();
    lote.update(referencia, { ...metadados, nome: nomeAtual });
  } else { nomeAtual = null; lote.delete(referencia); }
  lote.set(evento, { schemaVersion: CURRENT_SCHEMA_VERSION, userId: uid, obraId, mapaId: mapa.id, mapaNome: mapa.nome,
    acao, unidadeIds, antes, depois, nomeAnterior: acao === "criar" ? null : mapa.nome, nomeAtual, criadoEm: serverTimestamp() });
  return lote.commit();
}
