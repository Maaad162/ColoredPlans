import {
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { lerSchemaVersion } from "../config/dados";
import { tipoContaValido, type PerfilUsuario } from "../types/planta";
import { perfilDocument } from "./caminhos";
import { ErroOperacional } from "./erros";

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
      if (data.userId !== usuarioId || !tipoContaValido(data.tipoConta)) {
        aoFalhar(new ErroOperacional("validacao", "O perfil possui dados inválidos. Solicite revisão ao responsável pela conta."));
        return;
      }
      try {
        aoAtualizar({
          schemaVersion: lerSchemaVersion(data.schemaVersion),
          userId: usuarioId,
          email: typeof data.email === "string" ? data.email : "",
          tipoConta: data.tipoConta,
          criadoEm:
            data.criadoEm instanceof Timestamp
              ? data.criadoEm.toDate().toISOString()
              : new Date().toISOString(),
        });
      } catch (erro) {
        aoFalhar(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
    aoFalhar,
  );
}
