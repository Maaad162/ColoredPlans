import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { STATUSES } from "../config/statuses";
import { db } from "../config/firebase";
import type { MapaServico, Marcacoes, StatusId } from "../types/planta";

export const OBRA_ID = "obra-principal";

const statusValidos = new Set(STATUSES.map((status) => status.id));
const mapasLegadosCollection = collection(db, "obras", OBRA_ID, "mapas");

function mapasCollection(usuarioId: string) {
  return collection(
    db,
    "usuarios",
    usuarioId,
    "obras",
    OBRA_ID,
    "mapas",
  );
}

function mapaDocument(usuarioId: string, id: string) {
  return doc(mapasCollection(usuarioId), id);
}

function normalizarMarcacoes(valor: unknown): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor).filter(([, status]) =>
      statusValidos.has(status as StatusId),
    ),
  ) as Marcacoes;
}

export function observarMapas(
  usuarioId: string,
  aoAtualizar: (mapas: MapaServico[]) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(mapasCollection(usuarioId), where("userId", "==", usuarioId)),
    (snapshot) => {
      const mapas = snapshot.docs
        .map((documento) => {
          const data = documento.data();
          const criadoEm =
            data.criadoEm instanceof Timestamp
              ? data.criadoEm.toDate().toISOString()
              : new Date().toISOString();
          return {
            id: documento.id,
            userId: usuarioId,
            nome:
              typeof data.nome === "string" && data.nome.trim()
                ? data.nome.trim().slice(0, 48)
                : "Mapa sem nome",
            marcacoes: normalizarMarcacoes(data.marcacoes),
            criadoEm,
          } satisfies MapaServico;
        })
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      aoAtualizar(mapas);
    },
    (erro) => aoFalhar(erro),
  );
}

export async function migrarMapasLegados(usuarioId: string) {
  const consulta = query(
    mapasLegadosCollection,
    where("criadoPor", "==", usuarioId),
  );
  const snapshot = await getDocs(consulta);

  for (let inicio = 0; inicio < snapshot.docs.length; inicio += 400) {
    const batch = writeBatch(db);
    for (const documento of snapshot.docs.slice(inicio, inicio + 400)) {
      const data = documento.data();
      batch.set(mapaDocument(usuarioId, documento.id), {
        userId: usuarioId,
        nome:
          typeof data.nome === "string" && data.nome.trim()
            ? data.nome.trim().slice(0, 48)
            : "Mapa sem nome",
        marcacoes: normalizarMarcacoes(data.marcacoes),
        criadoEm:
          data.criadoEm instanceof Timestamp
            ? data.criadoEm
            : serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        criadoPor: usuarioId,
        atualizadoPor: usuarioId,
      });
      batch.delete(documento.ref);
    }
    await batch.commit();
  }
}

export function criarMapaRemoto(mapa: MapaServico, usuarioId: string) {
  if (mapa.userId !== usuarioId) {
    return Promise.reject(new Error("O proprietário do mapa é inválido."));
  }

  return setDoc(mapaDocument(usuarioId, mapa.id), {
    userId: usuarioId,
    nome: mapa.nome,
    marcacoes: {},
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    criadoPor: usuarioId,
    atualizadoPor: usuarioId,
  });
}

export function excluirMapaRemoto(id: string, usuarioId: string) {
  return deleteDoc(mapaDocument(usuarioId, id));
}

export function atualizarStatusRemoto(
  mapaId: string,
  unidadeId: string,
  status: StatusId | null,
  usuarioId: string,
) {
  return updateDoc(mapaDocument(usuarioId, mapaId), {
    [`marcacoes.${unidadeId}`]: status ?? deleteField(),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}

export function substituirMarcacoesRemotas(
  mapaId: string,
  marcacoes: Marcacoes,
  usuarioId: string,
) {
  return updateDoc(mapaDocument(usuarioId, mapaId), {
    marcacoes,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}
