import {
  Timestamp,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
  type SnapshotMetadata,
} from "firebase/firestore";
import { lerSchemaVersion } from "../config/dados";
import { db } from "../config/firebase";
import { gravarComHistorico, validarMarcacoes } from "./historico";
import { ErroOperacional } from "./erros";
import { mapasCollection } from "./caminhos";
import { DEFINICAO_LEGADA, idsDaPlanta, plantaDoDocumento, PLANTA_LEGADA_ID } from "./geometria";
import type { PlantaDefinition } from "../types/planta";
import { validarUnidadesKit } from "./validacoes";
import type { MapaServico, Marcacoes, StatusId } from "../types/planta";

function normalizarMarcacoes(valor: unknown, unidades: string[]): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErroOperacional("validacao", "Este mapa contém marcações inválidas. Solicite revisão ao responsável.");
  const marcacoes: Marcacoes = {};
  for (const [id, status] of Object.entries(valor)) {
    if (status !== null && typeof status !== "string") throw new ErroOperacional("validacao", "Este mapa contém um estado inválido. Solicite revisão ao responsável.");
    marcacoes[id] = status;
  }
  validarMarcacoes(marcacoes, unidades);
  return marcacoes;
}

export function observarMapas(
  usuarioId: string,
  obraId: string,
  aoAtualizar: (mapas: MapaServico[], metadata: SnapshotMetadata) => void,
  aoFalhar: (erro: Error) => void,
  plantaId = PLANTA_LEGADA_ID,
  definicao: PlantaDefinition = DEFINICAO_LEGADA,
): Unsubscribe {
  return onSnapshot(
    query(mapasCollection(usuarioId, obraId), where("userId", "==", usuarioId), ...(plantaId === PLANTA_LEGADA_ID ? [] : [where("plantaId", "==", plantaId)])),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        const mapas = snapshot.docs
          .filter(documento => plantaDoDocumento(documento.data().plantaId) === plantaId)
          .map((documento) => {
            const data = documento.data();
            const criadoEm =
              data.criadoEm instanceof Timestamp
                ? data.criadoEm.toDate().toISOString()
                : new Date().toISOString();
            const kitId =
              data.tipo === "kit" && typeof data.kitId === "string"
                ? data.kitId
                : undefined;
            return {
              id: documento.id,
              obraId, plantaId, equipeId: typeof data.equipeId === "string" ? data.equipeId : "",
              schemaVersion: lerSchemaVersion(data.schemaVersion),
              userId: usuarioId,
              tipo: kitId ? "kit" : "manual",
              ...(kitId ? { kitId } : {}),
              kitUnidadeIds: validarUnidadesKit(data.kitUnidadeIds ?? [], idsDaPlanta(definicao)),
              nome:
                typeof data.nome === "string" && data.nome.trim()
                  ? data.nome
                  : "Mapa sem nome",
              marcacoes: normalizarMarcacoes(data.marcacoes, idsDaPlanta(definicao)),
              criadoEm,
            } satisfies MapaServico;
          })
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
        aoAtualizar(mapas, snapshot.metadata);
      } catch (erro) {
        aoFalhar(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
    (erro) => aoFalhar(erro),
  );
}

export function criarMapaRemoto(mapa: MapaServico, usuarioId: string, obraId: string) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "criar", mapa });
}

export function excluirMapaRemoto(mapa: MapaServico, usuarioId: string, obraId: string) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "excluir", mapa });
}

export function renomearMapaRemoto(mapa: MapaServico, nome: string, usuarioId: string, obraId: string) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "renomear", mapa, nome });
}

export function atualizarStatusRemoto(
  mapa: MapaServico,
  unidadeId: string,
  status: StatusId | null,
  usuarioId: string,
  obraId: string,
  unidades: readonly string[] = idsDaPlanta(DEFINICAO_LEGADA),
) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "unidade", mapa, unidadeId, status }, unidades);
}

export function substituirMarcacoesRemotas(
  mapa: MapaServico,
  marcacoes: Marcacoes,
  usuarioId: string,
  obraId: string,
  unidades: readonly string[] = idsDaPlanta(DEFINICAO_LEGADA),
) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "marcacoes", mapa, marcacoes }, unidades);
}
