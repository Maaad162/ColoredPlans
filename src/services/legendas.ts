import {
  Timestamp,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
  type SnapshotMetadata,
} from "firebase/firestore";
import { corTextoParaFundo, simboloDaLegenda } from "../config/statuses";
import { CURRENT_SCHEMA_VERSION, lerSchemaVersion } from "../config/dados";
import { legendasCollection } from "./caminhos";
import type { LegendaUsuario } from "../types/planta";
import { validarLegenda } from "./validacoes";

export function observarLegendas(
  usuarioId: string,
  aoAtualizar: (legendas: LegendaUsuario[], metadata: SnapshotMetadata) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(legendasCollection(usuarioId), where("userId", "==", usuarioId)),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
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
                schemaVersion: lerSchemaVersion(data.schemaVersion),
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
            .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)), snapshot.metadata,
        );
      } catch (erro) {
        aoFalhar(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
    aoFalhar,
  );
}

export function criarLegendaRemota(
  usuarioId: string,
  nome: string,
  cor: string,
) {
  validarLegenda(nome, cor);
  const referencia = doc(legendasCollection(usuarioId));
  return setDoc(referencia, {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
  validarLegenda(nome, cor);
  return updateDoc(doc(legendasCollection(usuarioId), legendaId), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
