import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { corTextoParaFundo, simboloDaLegenda } from "../config/statuses";
import { db } from "../config/firebase";
import type { LegendaUsuario } from "../types/planta";

function legendasCollection(usuarioId: string) {
  return collection(db, "usuarios", usuarioId, "legendas");
}

export function observarLegendas(
  usuarioId: string,
  aoAtualizar: (legendas: LegendaUsuario[]) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(legendasCollection(usuarioId), where("userId", "==", usuarioId)),
    (snapshot) => {
      aoAtualizar(
        snapshot.docs
          .map((documento) => {
            const data = documento.data();
            const nome = typeof data.nome === "string" ? data.nome.trim() : "";
            const cor =
              typeof data.cor === "string" && /^#[0-9a-f]{6}$/i.test(data.cor)
                ? data.cor
                : "#8b9690";
            return {
              id: documento.id,
              userId: usuarioId,
              nome: nome || "Legenda sem nome",
              cor,
              corTexto: corTextoParaFundo(cor),
              simbolo:
                typeof data.simbolo === "string" && data.simbolo
                  ? data.simbolo.slice(0, 2)
                  : simboloDaLegenda(nome),
              criadoEm:
                data.criadoEm instanceof Timestamp
                  ? data.criadoEm.toDate().toISOString()
                  : new Date().toISOString(),
            } satisfies LegendaUsuario;
          })
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
      );
    },
    aoFalhar,
  );
}

export function criarLegendaRemota(
  usuarioId: string,
  nome: string,
  cor: string,
) {
  const referencia = doc(legendasCollection(usuarioId));
  return setDoc(referencia, {
    userId: usuarioId,
    nome: nome.trim().slice(0, 48),
    cor,
    corTexto: corTextoParaFundo(cor),
    simbolo: simboloDaLegenda(nome),
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}

export function editarLegendaRemota(
  usuarioId: string,
  legendaId: string,
  nome: string,
  cor: string,
) {
  return updateDoc(doc(legendasCollection(usuarioId), legendaId), {
    nome: nome.trim().slice(0, 48),
    cor,
    corTexto: corTextoParaFundo(cor),
    simbolo: simboloDaLegenda(nome),
    atualizadoEm: serverTimestamp(),
  });
}

export function excluirLegendaRemota(usuarioId: string, legendaId: string) {
  return deleteDoc(doc(legendasCollection(usuarioId), legendaId));
}
