import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type Firestore, type SnapshotMetadata, type Unsubscribe } from "firebase/firestore";
import { COLECOES, CURRENT_SCHEMA_VERSION, validarId } from "../config/dados.ts";
import { UNIDADE_BY_ID } from "../data/planta.ts";
import { ErroOperacional } from "./erros.ts";
import { historicoCollection } from "./historico.ts";
import type { ContextoUnidade, MapaServico } from "../types/planta.ts";

export const CONTEXTO_OBSERVACAO_LIMITE = 240;
export const CONTEXTO_RESPONSAVEL_LIMITE = 80;
function contextoDocument(banco: Firestore, uid: string, obraId: string, mapaId: string, unidadeId: string) {
  return doc(banco, COLECOES.usuarios, validarId(uid), COLECOES.obras, validarId(obraId), COLECOES.mapas, validarId(mapaId), "contextos", validarId(unidadeId));
}
function contextosCollection(banco: Firestore, uid: string, obraId: string, mapaId: string) {
  return collection(banco, COLECOES.usuarios, validarId(uid), COLECOES.obras, validarId(obraId), COLECOES.mapas, validarId(mapaId), "contextos");
}
function converterContexto(unidadeId: string, data: Record<string, unknown> | undefined): ContextoUnidade {
  return { unidadeId, observacao: typeof data?.observacao === "string" ? data.observacao : "",
    responsavel: typeof data?.responsavel === "string" ? data.responsavel : "", atualizadoEm: (data?.atualizadoEm as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null,
    atualizadoPor: typeof data?.atualizadoPor === "string" ? data.atualizadoPor : "" };
}
export function observarContexto(banco: Firestore, uid: string, obraId: string, mapaId: string, unidadeId: string,
  atualizar: (contexto: ContextoUnidade, metadata: SnapshotMetadata) => void, falhar: (erro: Error) => void): Unsubscribe {
  return onSnapshot(contextoDocument(banco, uid, obraId, mapaId, unidadeId), { includeMetadataChanges: true }, snapshot => {
    const data = snapshot.data();
    atualizar(converterContexto(unidadeId, data), snapshot.metadata);
  }, falhar);
}
export function observarContextosMapa(banco: Firestore, uid: string, obraId: string, mapaId: string,
  atualizar: (contextos: ContextoUnidade[], metadata: SnapshotMetadata) => void, falhar: (erro: Error) => void) {
  return onSnapshot(query(contextosCollection(banco, uid, obraId, mapaId), where("userId", "==", uid)), { includeMetadataChanges: true },
    snapshot => atualizar(snapshot.docs.map(item => converterContexto(item.id, item.data())), snapshot.metadata), falhar);
}
export function salvarContexto(banco: Firestore, uid: string, obraId: string, mapa: MapaServico, unidadeId: string,
  anterior: Pick<ContextoUnidade, "observacao" | "responsavel">, proximo: Pick<ContextoUnidade, "observacao" | "responsavel">) {
  const observacao = proximo.observacao.trim(), responsavel = proximo.responsavel.trim();
  if (!UNIDADE_BY_ID[unidadeId] || mapa.userId !== uid || mapa.obraId !== obraId) throw new ErroOperacional("permissao", "Unidade, mapa ou obra inválidos.");
  if (observacao.length > CONTEXTO_OBSERVACAO_LIMITE || responsavel.length > CONTEXTO_RESPONSAVEL_LIMITE) {
    throw new ErroOperacional("validacao", "A observação ou o responsável ultrapassa o limite permitido.");
  }
  if (observacao === anterior.observacao && responsavel === anterior.responsavel) return Promise.resolve();
  const referencia = contextoDocument(banco, uid, obraId, mapa.id, unidadeId);
  const evento = doc(historicoCollection(banco, uid, obraId));
  const lote = writeBatch(banco);
  lote.set(referencia, { schemaVersion: CURRENT_SCHEMA_VERSION, userId: uid, obraId, mapaId: mapa.id, unidadeId,
    observacao, responsavel, atualizadoEm: serverTimestamp(), atualizadoPor: uid, ultimoEventoId: evento.id });
  lote.set(evento, { schemaVersion: CURRENT_SCHEMA_VERSION, userId: uid, obraId, mapaId: mapa.id, mapaNome: mapa.nome,
    acao: "contexto", unidadeIds: [unidadeId], antes: anterior, depois: { observacao, responsavel },
    nomeAnterior: mapa.nome, nomeAtual: mapa.nome, criadoEm: serverTimestamp() });
  return lote.commit();
}
