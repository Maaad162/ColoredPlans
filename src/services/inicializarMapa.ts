import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { COLECOES, CURRENT_SCHEMA_VERSION, lerSchemaVersion, validarId } from "../config/dados.ts";
import { PLANTA_LEGADA_ID } from "./geometria.ts";

// O ID é estável para que duas abas disputem o mesmo documento, sem criar cópias.
const MAPA_INICIAL_ID = "mapa-principal";

export function garantirMapaInicial(db: Firestore, usuarioId: string, obraId: string, plantaId = PLANTA_LEGADA_ID) {
  const referencia = doc(db, COLECOES.usuarios, validarId(usuarioId), COLECOES.obras,
    validarId(obraId), COLECOES.mapas, plantaId === PLANTA_LEGADA_ID ? MAPA_INICIAL_ID : `inicial-${validarId(plantaId)}`);
  return runTransaction(db, async (transacao) => {
    const atual = await transacao.get(referencia);
    if (atual.exists()) {
      lerSchemaVersion(atual.data().schemaVersion);
      return;
    }
    transacao.set(referencia, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      obraId,
      plantaId,
      userId: usuarioId,
      tipo: "manual",
      kitUnidadeIds: [],
      nome: "Mapa principal",
      marcacoes: {},
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      criadoPor: usuarioId,
      atualizadoPor: usuarioId,
    });
  });
}
