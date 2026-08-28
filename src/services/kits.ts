import {
  Timestamp,
  arrayRemove,
  arrayUnion,
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
import { db } from "../config/firebase";
import { UNIDADE_BY_ID } from "../data/planta";
import type { Kit, MaterialKit } from "../types/planta";

export interface DadosKit {
  id?: string;
  nome: string;
  materiais: MaterialKit[];
}

function kitsCollection(usuarioId: string) {
  return collection(db, "usuarios", usuarioId, "kits");
}

function normalizarMateriais(valor: unknown): MaterialKit[] {
  if (!Array.isArray(valor)) return [];
  const ids = new Set<string>();
  return valor.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    if (
      typeof data.id !== "string" ||
      ids.has(data.id) ||
      typeof data.codigoSienge !== "string" ||
      typeof data.descricao !== "string" ||
      typeof data.detalhe !== "string" ||
      typeof data.quantidadePorKit !== "number" ||
      !Number.isFinite(data.quantidadePorKit) ||
      data.quantidadePorKit <= 0
    ) {
      return [];
    }
    ids.add(data.id);
    return [
      {
        id: data.id,
        codigoSienge: data.codigoSienge.trim().slice(0, 32),
        descricao: data.descricao.trim().slice(0, 100),
        detalhe: data.detalhe.trim().slice(0, 180),
        quantidadePorKit: data.quantidadePorKit,
      },
    ];
  });
}

export function observarKits(
  usuarioId: string,
  aoAtualizar: (kits: Kit[]) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(kitsCollection(usuarioId), where("userId", "==", usuarioId)),
    (snapshot) => {
      const kits = snapshot.docs
        .map((documento) => {
          const data = documento.data();
          const unidades = Array.isArray(data.unidadeIds)
            ? [...new Set(
                data.unidadeIds.filter(
                  (id): id is string =>
                    typeof id === "string" && Boolean(UNIDADE_BY_ID[id]),
                ),
              )]
            : [];
          return {
            id: documento.id,
            userId: usuarioId,
            nome:
              typeof data.nome === "string" && data.nome.trim()
                ? data.nome.trim().slice(0, 80)
                : "Kit sem nome",
            materiais: normalizarMateriais(data.materiais),
            unidadeIds: unidades,
            criadoEm:
              data.criadoEm instanceof Timestamp
                ? data.criadoEm.toDate().toISOString()
                : new Date().toISOString(),
            atualizadoEm:
              data.atualizadoEm instanceof Timestamp
                ? data.atualizadoEm.toDate().toISOString()
                : new Date().toISOString(),
          } satisfies Kit;
        })
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      aoAtualizar(kits);
    },
    aoFalhar,
  );
}

export async function salvarKitRemoto(
  usuarioId: string,
  dados: DadosKit,
) {
  if (dados.id) {
    await updateDoc(doc(kitsCollection(usuarioId), dados.id), {
      nome: dados.nome.trim().slice(0, 80),
      materiais: dados.materiais,
      atualizadoEm: serverTimestamp(),
    });
    return dados.id;
  }

  const referencia = doc(kitsCollection(usuarioId));
  await setDoc(referencia, {
    userId: usuarioId,
    nome: dados.nome.trim().slice(0, 80),
    materiais: dados.materiais,
    unidadeIds: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return referencia.id;
}

export function excluirKitRemoto(usuarioId: string, kitId: string) {
  return deleteDoc(doc(kitsCollection(usuarioId), kitId));
}

export function aplicarKitEmUnidades(
  usuarioId: string,
  kitId: string,
  unidadeIds: string[],
) {
  const idsValidos = [...new Set(unidadeIds)].filter((id) => UNIDADE_BY_ID[id]);
  if (idsValidos.length === 0) return Promise.resolve();
  return updateDoc(doc(kitsCollection(usuarioId), kitId), {
    unidadeIds: arrayUnion(...idsValidos),
    atualizadoEm: serverTimestamp(),
  });
}

export function removerKitDeUnidades(
  usuarioId: string,
  kitId: string,
  unidadeIds: string[],
) {
  const idsValidos = [...new Set(unidadeIds)].filter((id) => UNIDADE_BY_ID[id]);
  if (idsValidos.length === 0) return Promise.resolve();
  return updateDoc(doc(kitsCollection(usuarioId), kitId), {
    unidadeIds: arrayRemove(...idsValidos),
    atualizadoEm: serverTimestamp(),
  });
}

export function calcularConsumoKit(kit: Kit) {
  const unidadesAtendidas = new Set(kit.unidadeIds).size;
  return kit.materiais.map((material) => ({
    ...material,
    utilizado: material.quantidadePorKit * unidadesAtendidas,
  }));
}
