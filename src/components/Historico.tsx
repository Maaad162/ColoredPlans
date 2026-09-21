import { useEffect, useState } from "react";
import { limit, onSnapshot, orderBy, query, startAfter, Timestamp, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { historicoCollection, type EventoHistorico, type AcaoHistorico } from "../services/historico";
import { getStatus } from "../config/statuses";
import { plantaDoDocumento } from "../services/geometria";
import { lerSchemaVersion } from "../config/dados";
import { useControleSync } from "../hooks/useSincronizacao";
import type { Marcacoes, StatusConfig } from "../types/planta";

function lerMarcacoes(valor: unknown): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error("Histórico inválido.");
  const resultado: Marcacoes = {};
  for (const [id, status] of Object.entries(valor)) {
    if (status !== null && typeof status !== "string") throw new Error("Histórico inválido.");
    resultado[id] = status;
  }
  return resultado;
}
function lerAcao(acao: unknown): AcaoHistorico {
  if (acao === "unidade" || acao === "marcacoes" || acao === "criar" || acao === "excluir" || acao === "renomear" || acao === "contexto" || acao === "equipe") return acao;
  throw new Error("Histórico inválido.");
}
function converter(documento: QueryDocumentSnapshot): EventoHistorico {
  const data: Record<string, unknown> = documento.data();
  lerSchemaVersion(data.schemaVersion);
  if (typeof data.userId !== "string" || typeof data.mapaId !== "string" || typeof data.mapaNome !== "string"
    || !Array.isArray(data.unidadeIds) || !data.unidadeIds.every((id: unknown) => typeof id === "string")
    || (data.nomeAnterior !== null && typeof data.nomeAnterior !== "string")
    || (data.nomeAtual !== null && typeof data.nomeAtual !== "string")) throw new Error("Histórico inválido.");
  return { id: documento.id, plantaId: plantaDoDocumento(data.plantaId), acao: lerAcao(data.acao), userId: data.userId, mapaId: data.mapaId, mapaNome: data.mapaNome,
    unidadeIds: data.unidadeIds, antes: lerMarcacoes(data.antes), depois: lerMarcacoes(data.depois),
    nomeAnterior: data.nomeAnterior, nomeAtual: data.nomeAtual,
    criadoEm: data.criadoEm instanceof Timestamp ? data.criadoEm.toDate().toISOString() : null,
    pendente: documento.metadata.hasPendingWrites };
}

interface Props { usuarioId: string; obraId: string; legendas: StatusConfig[]; mapaId?: string; unidadeId?: string; onFechar: () => void }
export function Historico({ usuarioId, obraId, legendas, mapaId, unidadeId, onFechar }: Props) {
  const controle = useControleSync();
  const [eventos, setEventos] = useState<EventoHistorico[]>([]);
  const [cursores, setCursores] = useState<QueryDocumentSnapshot[]>([]);
  const [ultimo, setUltimo] = useState<QueryDocumentSnapshot>();
  const [carregando, setCarregando] = useState(true);
  const [doCache, setDoCache] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const fechar = (event: KeyboardEvent) => { if (event.key === "Escape") onFechar(); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [onFechar]);
  useEffect(() => {
    setCarregando(true);
    controle.observar("historico", { fromCache: true, hasPendingWrites: false });
    const consulta = query(historicoCollection(db, usuarioId, obraId), where("userId", "==", usuarioId), where("obraId", "==", obraId),
      ...(mapaId ? [where("mapaId", "==", mapaId)] : []), ...(unidadeId ? [where("unidadeIds", "array-contains", unidadeId)] : []),
      orderBy("criadoEm", "desc"), ...(cursores.length ? [startAfter(cursores[cursores.length - 1])] : []), limit(20));
    const falhar = (erro: unknown) => { setCarregando(false); controle.falharLeitura("historico", erro, () => setTentativa(v => v + 1)); };
    const cancelar = onSnapshot(consulta, { includeMetadataChanges: true }, snapshot => {
      try {
        setEventos(snapshot.docs.map(converter)); setUltimo(snapshot.docs.at(-1));
        setDoCache(snapshot.metadata.fromCache); setCarregando(false); controle.observar("historico", snapshot.metadata);
      } catch (erro) { falhar(erro); }
    }, falhar);
    return () => { cancelar(); controle.remover("historico"); };
  }, [usuarioId, obraId, mapaId, unidadeId, cursores, controle, tentativa]);
  return <div className="modal-backdrop">
    <section className="modal-card modal-card--wide history-panel" role="dialog" aria-modal="true" aria-labelledby="historico-titulo">
      <div className="manager-heading"><div><h2 id="historico-titulo">{unidadeId ? "Histórico da unidade" : mapaId ? "Histórico do mapa" : "Histórico da obra"}</h2>
        <p>Registros operacionais desta conta. {doCache ? "Exibindo dados locais; podem estar incompletos." : "Confirmados pelo servidor, salvo indicação de pendência."}</p></div>
        <button className="icon-button" type="button" onClick={onFechar} aria-label="Fechar histórico" autoFocus>×</button></div>
      {carregando ? <p role="status">Carregando histórico…</p> : <>
        {!eventos.length && <p>Nenhum evento nesta consulta. Alterações anteriores à ativação do histórico não foram reconstruídas.</p>}
        <ol className="history-list" aria-label="Eventos do histórico">{eventos.map(evento => <li key={evento.id}>
          <strong>{evento.mapaNome}</strong> · {evento.plantaId} · {evento.pendente ? "Pendente de sincronização" : evento.criadoEm ? new Date(evento.criadoEm).toLocaleString("pt-BR") : "Data indisponível"}
          <p>Por {evento.userId === usuarioId ? "você" : evento.userId}</p>
          {evento.acao === "criar" && <p>Mapa criado: {evento.nomeAtual}</p>}
          {evento.acao === "excluir" && <p>Mapa excluído: {evento.nomeAnterior}</p>}
          {evento.acao === "renomear" && <p>{evento.nomeAnterior} → {evento.nomeAtual}</p>}
          {evento.acao === "equipe" && <p>Equipe do serviço: {evento.antes.equipeId || "não atribuída"} → {evento.depois.equipeId || "não atribuída"}</p>}
          {evento.acao === "contexto" && <p>Contexto atualizado: observação “{evento.depois.observacao || "sem observação"}”; responsável “{evento.depois.responsavel || "não informado"}”.</p>}
          {evento.acao !== "contexto" && evento.unidadeIds.length > 0 && <details open={evento.unidadeIds.length === 1}>
            <summary>{evento.unidadeIds.length} unidade(s) alterada(s)</summary>
            <ul>{evento.unidadeIds.map(id => <li key={id}>{id}: {getStatus(evento.antes[id] ?? null, legendas).nome} → {getStatus(evento.depois[id] ?? null, legendas).nome}</li>)}</ul>
          </details>}
        </li>)}</ol>
        <div className="modal-card__acoes">
          <button type="button" className="button button--ghost" disabled={!cursores.length} onClick={() => setCursores(v => v.slice(0, -1))}>Mais recentes</button>
          <button type="button" className="button button--secondary" disabled={eventos.length < 20 || !ultimo || doCache || eventos.some(e => e.pendente)} onClick={() => { if (ultimo) setCursores(v => [...v, ultimo]); }}>Mais antigos</button>
        </div>
      </>}
    </section>
  </div>;
}
