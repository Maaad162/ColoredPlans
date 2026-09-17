import {
  Timestamp,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { CURRENT_SCHEMA_VERSION, OBRA_PADRAO_ID, lerSchemaVersion } from "../config/dados";
import { kitsCollection, mapaDocument } from "./caminhos";
import { UNIDADE_BY_ID } from "../data/planta";
import type { Kit, MaterialKit } from "../types/planta";

export interface DadosKit {
  id?: string;
  nome: string;
  materiais: MaterialKit[];
}

function mapaIdDoKit(kitId: string) {
  return `mapa-kit-${kitId}`;
}

function unidadesValidas(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return [
    ...new Set(
      valor.filter(
        (id): id is string =>
          typeof id === "string" && Boolean(UNIDADE_BY_ID[id]),
      ),
    ),
  ];
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
  obraId: string,
  aoAtualizar: (kits: Kit[]) => void,
  aoFalhar: (erro: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(kitsCollection(usuarioId), where("userId", "==", usuarioId)),
    (snapshot) => {
      try {
        const kits = snapshot.docs
          .filter((documento) => (documento.data().obraId ?? OBRA_PADRAO_ID) === obraId)
          .map((documento) => {
            const data = documento.data();
            return {
              id: documento.id,
              obraId,
              schemaVersion: lerSchemaVersion(data.schemaVersion),
              userId: usuarioId,
              mapaId: typeof data.mapaId === "string" ? data.mapaId : "",
              nome:
                typeof data.nome === "string" && data.nome.trim()
                  ? data.nome.trim().slice(0, 80)
                  : "Kit sem nome",
              materiais: normalizarMateriais(data.materiais),
              unidadeIds: unidadesValidas(data.unidadeIds),
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
      } catch (erro) {
        aoFalhar(erro instanceof Error ? erro : new Error(String(erro)));
      }
    },
    aoFalhar,
  );
}

export async function salvarKitRemoto(
  usuarioId: string,
  obraId: string,
  dados: DadosKit,
) {
  const nome = dados.nome.trim().slice(0, 80);
  if (!nome) throw new Error("Informe um nome para o Kit e seu mapa.");

  if (dados.id) {
    const referenciaKit = doc(kitsCollection(usuarioId), dados.id);
    await runTransaction(db, async (transacao) => {
      const kitSnapshot = await transacao.get(referenciaKit);
      if (!kitSnapshot.exists()) throw new Error("O Kit não existe mais.");
      if ((kitSnapshot.data().obraId ?? OBRA_PADRAO_ID) !== obraId) {
        throw new Error("O Kit pertence a outra obra.");
      }
      lerSchemaVersion(kitSnapshot.data().schemaVersion);
      const mapaId = kitSnapshot.data().mapaId;
      if (typeof mapaId !== "string" || !mapaId) {
        throw new Error("O Kit ainda não possui um mapa associado. Recarregue para concluir a migração.");
      }
      const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
      const mapaSnapshot = await transacao.get(referenciaMapa);
      if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== dados.id) {
        throw new Error("O mapa associado ao Kit não foi encontrado.");
      }
      transacao.update(referenciaKit, {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        obraId,
        nome,
        materiais: dados.materiais,
        atualizadoEm: serverTimestamp(),
      });
      transacao.update(referenciaMapa, {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        obraId,
        nome,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuarioId,
      });
    });
    return dados.id;
  }

  const referenciaKit = doc(kitsCollection(usuarioId));
  const mapaId = mapaIdDoKit(referenciaKit.id);
  const lote = writeBatch(db);
  lote.set(referenciaKit, {
    userId: usuarioId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    mapaId,
    nome,
    materiais: dados.materiais,
    unidadeIds: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  lote.set(mapaDocument(usuarioId, obraId, mapaId), {
    userId: usuarioId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId,
    nome,
    tipo: "kit",
    kitId: referenciaKit.id,
    kitUnidadeIds: [],
    marcacoes: {},
    criadoEm: serverTimestamp(),
    criadoPor: usuarioId,
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
  await lote.commit();
  return referenciaKit.id;
}

export async function excluirKitRemoto(usuarioId: string, obraId: string, kitId: string) {
  const referenciaKit = doc(kitsCollection(usuarioId), kitId);
  await runTransaction(db, async (transacao) => {
    const kitSnapshot = await transacao.get(referenciaKit);
    if (!kitSnapshot.exists()) return;
    if ((kitSnapshot.data().obraId ?? OBRA_PADRAO_ID) !== obraId) {
      throw new Error("O Kit pertence a outra obra.");
    }
    lerSchemaVersion(kitSnapshot.data().schemaVersion);
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new Error("Não foi possível localizar o mapa deste Kit.");
    }
    const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
    const mapaSnapshot = await transacao.get(referenciaMapa);
    if (mapaSnapshot.exists() && mapaSnapshot.data().kitId !== kitId) {
      throw new Error("O mapa informado está associado a outro Kit.");
    }
    transacao.delete(referenciaKit);
    if (mapaSnapshot.exists()) transacao.delete(referenciaMapa);
  });
}

export async function atualizarUnidadesKit(
  usuarioId: string,
  obraId: string,
  kitId: string,
  unidadeIds: string[],
) {
  const idsValidos = unidadesValidas(unidadeIds);
  const referenciaKit = doc(kitsCollection(usuarioId), kitId);
  await runTransaction(db, async (transacao) => {
    const kitSnapshot = await transacao.get(referenciaKit);
    if (!kitSnapshot.exists()) throw new Error("O Kit não existe mais.");
    if ((kitSnapshot.data().obraId ?? OBRA_PADRAO_ID) !== obraId) {
      throw new Error("O Kit pertence a outra obra.");
    }
    lerSchemaVersion(kitSnapshot.data().schemaVersion);
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new Error("O Kit não possui um mapa associado.");
    }
    const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
    const mapaSnapshot = await transacao.get(referenciaMapa);
    if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== kitId) {
      throw new Error("O mapa associado ao Kit não foi encontrado.");
    }
    transacao.update(referenciaKit, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      obraId,
      unidadeIds: idsValidos,
      atualizadoEm: serverTimestamp(),
    });
    transacao.update(referenciaMapa, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      obraId,
      kitUnidadeIds: idsValidos,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: usuarioId,
    });
  });
}

export function calcularConsumoKit(kit: Kit) {
  const unidadesAtendidas = new Set(kit.unidadeIds).size;
  return kit.materiais.map((material) => ({
    ...material,
    utilizado: material.quantidadePorKit * unidadesAtendidas,
  }));
}
