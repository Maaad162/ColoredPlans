import {
  Timestamp,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
  type SnapshotMetadata,
} from "firebase/firestore";
import { CURRENT_SCHEMA_VERSION, lerSchemaVersion } from "../config/dados";
import { mapaDocument, mapasCollection } from "./caminhos";
import { UNIDADE_BY_ID } from "../data/planta";
import type { MapaServico, Marcacoes, StatusId } from "../types/planta";

function normalizarMarcacoes(valor: unknown): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor).filter(
      ([, status]) => typeof status === "string" && status.length <= 128,
    ),
  ) as Marcacoes;
}

export function observarMapas(
  usuarioId: string,
  obraId: string,
  aoAtualizar: (mapas: MapaServico[], metadata: SnapshotMetadata) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(mapasCollection(usuarioId, obraId), where("userId", "==", usuarioId)),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        const mapas = snapshot.docs
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
              obraId,
              schemaVersion: lerSchemaVersion(data.schemaVersion),
              userId: usuarioId,
              tipo: kitId ? "kit" : "manual",
              ...(kitId ? { kitId } : {}),
              kitUnidadeIds: Array.isArray(data.kitUnidadeIds)
                ? [...new Set(
                    data.kitUnidadeIds.filter(
                      (id): id is string =>
                        typeof id === "string" && Boolean(UNIDADE_BY_ID[id]),
                    ),
                  )]
                : [],
              nome:
                typeof data.nome === "string" && data.nome.trim()
                  ? data.nome.trim().slice(0, kitId ? 80 : 48)
                  : "Mapa sem nome",
              marcacoes: normalizarMarcacoes(data.marcacoes),
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
  if (mapa.userId !== usuarioId || mapa.obraId !== obraId) {
    return Promise.reject(new Error("O proprietário do mapa é inválido."));
  }

  return setDoc(mapaDocument(usuarioId, obraId, mapa.id), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    userId: usuarioId,
    tipo: "manual",
    kitUnidadeIds: [],
    nome: mapa.nome,
    marcacoes: {},
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    criadoPor: usuarioId,
    atualizadoPor: usuarioId,
  });
}

export function excluirMapaRemoto(id: string, usuarioId: string, obraId: string) {
  return deleteDoc(mapaDocument(usuarioId, obraId, id));
}

export function renomearMapaRemoto(id: string, nome: string, usuarioId: string, obraId: string) {
  return updateDoc(mapaDocument(usuarioId, obraId, id), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    nome,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}

export function atualizarStatusRemoto(
  mapaId: string,
  unidadeId: string,
  status: StatusId | null,
  usuarioId: string,
  obraId: string,
) {
  return updateDoc(mapaDocument(usuarioId, obraId, mapaId), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    [`marcacoes.${unidadeId}`]: status ?? deleteField(),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}

export function substituirMarcacoesRemotas(
  mapaId: string,
  marcacoes: Marcacoes,
  usuarioId: string,
  obraId: string,
) {
  return updateDoc(mapaDocument(usuarioId, obraId, mapaId), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    marcacoes,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}
