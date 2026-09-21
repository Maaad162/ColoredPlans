import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { lerSchemaVersion } from "../config/dados";
import { obraDocument, perfilDocument } from "../services/caminhos";
import { DEFINICAO_LEGADA, PLANTA_LEGADA, TEMPLATE_LEGADO_ID, plantaDoDocumento, validarDefinicao } from "../services/geometria";
import { ErroOperacional } from "../services/erros";
import { useControleSync } from "./useSincronizacao";
import type { Equipe, Obra, PlantaDefinition, PlantaObra } from "../types/planta";

function nome(valor: unknown): string {
  if (typeof valor !== "string" || !valor.trim() || valor.length > 100) throw new ErroOperacional("validacao", "Cadastro inválido. Solicite revisão administrativa.");
  return valor;
}
function lerObra(doc: QueryDocumentSnapshot): Obra {
  const data = doc.data(); lerSchemaVersion(data.schemaVersion);
  const status = data.status ?? "ativa";
  if (status !== "ativa" && status !== "arquivada") throw new ErroOperacional("validacao", "Situação da obra inválida.");
  return { id: doc.id, schemaVersion: lerSchemaVersion(data.schemaVersion), nome: nome(data.nome), status, plantaLegada: data.plantaLegada !== false };
}
function lerPlanta(doc: QueryDocumentSnapshot): PlantaObra {
  const data = doc.data(); lerSchemaVersion(data.schemaVersion);
  if (doc.id === PLANTA_LEGADA.id && data.templateId !== TEMPLATE_LEGADO_ID) throw new ErroOperacional("validacao", "A planta original deve manter sua geometria.");
  return { id: plantaDoDocumento(doc.id), nome: nome(data.nome), templateId: plantaDoDocumento(nome(data.templateId)) };
}
function lerEquipe(doc: QueryDocumentSnapshot): Equipe { return { id: doc.id, nome: nome(doc.data().nome) }; }

function useCatalogo<T>(uid: string, obraId: string | null, colecao: "obras" | "plantas" | "equipes", ler: (doc: QueryDocumentSnapshot) => T) {
  const controle = useControleSync();
  const [dados, setDados] = useState<T[]>([]), [carregando, setCarregando] = useState(true), [tentativa, setTentativa] = useState(0), [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let ativo = true;
    const chave = `catalogo:${uid}:${obraId ?? ""}:${colecao}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const ref = collection(obraId ? obraDocument(uid, obraId) : perfilDocument(uid), colecao);
    const falhar = (erro: unknown) => { if (ativo) { setDados([]); setFalhou(true); setCarregando(false); controle.falharLeitura(chave, erro, () => setTentativa(v => v + 1)); } };
    const cancelar = onSnapshot(query(ref, ...(colecao === "obras" ? [where("userId", "==", uid)] : [])), { includeMetadataChanges: true }, snapshot => {
      if (!ativo) return;
      try { const proximos = snapshot.docs.map(ler); setDados(anteriores => JSON.stringify(anteriores) === JSON.stringify(proximos) ? anteriores : proximos); setFalhou(false); setCarregando(false); controle.observar(chave, snapshot.metadata); } catch (erro) { falhar(erro); }
    }, falhar);
    return () => { ativo = false; cancelar(); controle.remover(chave); };
  }, [uid, obraId, colecao, ler, controle, tentativa]);
  return { dados, carregando, falhou };
}
export const useObras = (uid: string) => useCatalogo(uid, null, "obras", lerObra);
export const usePlantas = (uid: string, obraId: string, incluirLegada = true) => {
  const resultado = useCatalogo(uid, obraId, "plantas", lerPlanta);
  // A ausência do catálogo é o formato histórico. A planta original nunca muda de ID.
  return { ...resultado, dados: !resultado.falhou && incluirLegada && !resultado.dados.some(p => p.id === PLANTA_LEGADA.id)
    ? [PLANTA_LEGADA, ...resultado.dados] : resultado.dados };
};
export const useEquipes = (uid: string, obraId: string) => useCatalogo(uid, obraId, "equipes", lerEquipe);

export function useDefinicao(uid: string, obraId: string, planta: PlantaObra) {
  const controle = useControleSync();
  const [definicao, setDefinicao] = useState<PlantaDefinition | null>(planta.templateId === TEMPLATE_LEGADO_ID ? DEFINICAO_LEGADA : null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (planta.templateId === TEMPLATE_LEGADO_ID) return;
    let ativo = true;
    const chave = `template:${obraId}:${planta.id}:${planta.templateId}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const falhar = (erro: unknown) => { if (ativo) { setDefinicao(null); controle.falharLeitura(chave, erro, () => setTentativa(v => v + 1)); } };
    const cancelar = onSnapshot(doc(obraDocument(uid, obraId), "templates", planta.templateId), { includeMetadataChanges: true }, snapshot => {
      if (!ativo) return;
      try {
        if (!snapshot.exists()) throw new ErroOperacional("ausente", snapshot.metadata.fromCache ? "Planta indisponível no cache. Conecte-se para carregar." : "A definição desta planta não foi cadastrada.");
        const proxima = validarDefinicao(snapshot.data().definicao); setDefinicao(anterior => JSON.stringify(anterior) === JSON.stringify(proxima) ? anterior : proxima); controle.observar(chave, snapshot.metadata);
      } catch (erro) { falhar(erro); }
    }, falhar);
    return () => { ativo = false; cancelar(); controle.remover(chave); };
  }, [uid, obraId, planta.templateId, planta.id, controle, tentativa]);
  return definicao;
}
