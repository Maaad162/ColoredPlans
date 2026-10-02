import { doc, getDocFromServer, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { COLECOES, CURRENT_SCHEMA_VERSION, lerSchemaVersion, validarId } from "../config/dados.ts";
import { PLANTA_LEGADA_ID } from "./geometria.ts";
import { historicoCollection } from "./historico.ts";

// O ID é estável para que duas abas disputem o mesmo documento, sem criar cópias.
const MAPA_INICIAL_ID = "mapa-principal";

export function garantirMapaInicial(db: Firestore, usuarioId: string, obraId: string, plantaId = PLANTA_LEGADA_ID, autorId = usuarioId) {
  const referencia = doc(db, COLECOES.usuarios, validarId(usuarioId), COLECOES.obras,
    validarId(obraId), COLECOES.mapas, plantaId === PLANTA_LEGADA_ID ? MAPA_INICIAL_ID : `inicial-${validarId(plantaId)}`);
  const evento = doc(historicoCollection(db, usuarioId, obraId));
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
      criadoPor: autorId,
      atualizadoPor: autorId,
      ultimoEventoId: evento.id,
    });
    transacao.set(evento, { schemaVersion: CURRENT_SCHEMA_VERSION, userId: usuarioId, autorId, obraId, plantaId,
      mapaId: referencia.id, mapaNome: "Mapa principal", acao: "criar", unidadeIds: [], antes: {}, depois: {},
      nomeAnterior: null, nomeAtual: "Mapa principal", criadoEm: serverTimestamp() });
  }).catch(async (erro: unknown) => {
    // Outra aba pode vencer a criação antes da avaliação das Rules do evento.
    // Só consideramos a inicialização concluída após confirmar o mapa no servidor.
    if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "permission-denied") {
      try {
        const vencedor = await getDocFromServer(referencia);
        if (vencedor.exists() && vencedor.data().userId === usuarioId && vencedor.data().obraId === obraId) {
          lerSchemaVersion(vencedor.data().schemaVersion);
          return;
        }
      } catch { /* Uma leitura negada não confirma a inicialização. */ }
    }
    throw erro;
  });
}
