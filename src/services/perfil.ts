import {
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { STATUSES, legendaPadraoParaUsuario } from "../config/statuses";
import { db } from "../config/firebase";
import type { PerfilUsuario, TipoConta } from "../types/planta";

function perfilDocument(usuarioId: string) {
  return doc(db, "usuarios", usuarioId);
}

export function observarPerfil(
  usuarioId: string,
  aoAtualizar: (perfil: PerfilUsuario | null) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    perfilDocument(usuarioId),
    (snapshot) => {
      if (!snapshot.exists()) {
        aoAtualizar(null);
        return;
      }
      const data = snapshot.data();
      if (data.tipoConta !== "apontamento" && data.tipoConta !== "estoque") {
        aoFalhar(new Error("O perfil possui um tipo de conta inválido."));
        return;
      }
      aoAtualizar({
        userId: usuarioId,
        email: typeof data.email === "string" ? data.email : "",
        tipoConta: data.tipoConta,
        criadoEm:
          data.criadoEm instanceof Timestamp
            ? data.criadoEm.toDate().toISOString()
            : new Date().toISOString(),
      });
    },
    aoFalhar,
  );
}

export async function criarPerfil(
  usuarioId: string,
  email: string,
  tipoConta: TipoConta,
) {
  const batch = writeBatch(db);
  batch.set(perfilDocument(usuarioId), {
    userId: usuarioId,
    email: email.trim(),
    tipoConta,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });

  for (const status of STATUSES) {
    const legenda = legendaPadraoParaUsuario(status, usuarioId);
    batch.set(doc(db, "usuarios", usuarioId, "legendas", status.id), {
      userId: usuarioId,
      nome: legenda.nome,
      cor: legenda.cor,
      corTexto: legenda.corTexto,
      simbolo: legenda.simbolo,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
  }
  await batch.commit();
}
