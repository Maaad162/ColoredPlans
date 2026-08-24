import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { STATUSES } from "../config/statuses";
import { db } from "../config/firebase";
import type { MapaServico, Marcacoes, StatusId } from "../types/planta";

export const OBRA_ID = "obra-principal";

const statusValidos = new Set(STATUSES.map((status) => status.id));
const mapasCollection = collection(db, "obras", OBRA_ID, "mapas");

function mapaDocument(id: string) {
  return doc(db, "obras", OBRA_ID, "mapas", id);
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
  aoAtualizar: (mapas: MapaServico[]) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    mapasCollection,
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

export async function migrarMapasLocais(
  mapas: MapaServico[],
  usuarioId: string,
) {
  const batch = writeBatch(db);
  for (const mapa of mapas) {
    const dataCriacao = new Date(mapa.criadoEm);
    batch.set(mapaDocument(mapa.id), {
      nome: mapa.nome,
      marcacoes: mapa.marcacoes,
      criadoEm: Timestamp.fromDate(
        Number.isNaN(dataCriacao.getTime()) ? new Date() : dataCriacao,
      ),
      atualizadoEm: serverTimestamp(),
      criadoPor: usuarioId,
      atualizadoPor: usuarioId,
    });
  }
  await batch.commit();
}

export function criarMapaRemoto(mapa: MapaServico, usuarioId: string) {
  return setDoc(mapaDocument(mapa.id), {
    nome: mapa.nome,
    marcacoes: {},
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    criadoPor: usuarioId,
    atualizadoPor: usuarioId,
  });
}

export function excluirMapaRemoto(id: string) {
  return deleteDoc(mapaDocument(id));
}

export function atualizarStatusRemoto(
  mapaId: string,
  unidadeId: string,
  status: StatusId | null,
  usuarioId: string,
) {
  return updateDoc(mapaDocument(mapaId), {
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
  return updateDoc(mapaDocument(mapaId), {
    marcacoes,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
}
