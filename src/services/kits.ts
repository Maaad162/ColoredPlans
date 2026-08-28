import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { UNIDADE_BY_ID } from "../data/planta";
import type { Kit, MaterialKit } from "../types/planta";

export interface DadosKit {
  id?: string;
  nome: string;
  materiais: MaterialKit[];
}

const OBRA_ID = "obra-principal";
// As regras consultam o documento pareado. Manter lotes pequenos também
// respeita o limite de leituras getAfter por operação atômica do Firestore.
const LIMITE_OPERACOES_LOTE = 16;

function kitsCollection(usuarioId: string) {
  return collection(db, "usuarios", usuarioId, "kits");
}

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

function mapaDocument(usuarioId: string, mapaId: string) {
  return doc(mapasCollection(usuarioId), mapaId);
}

function mapaIdDoKit(kitId: string) {
  return `mapa-kit-${kitId}`;
}

function nomeComparavel(nome: unknown) {
  return typeof nome === "string"
    ? nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("pt-BR")
    : "";
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

function listasIguais(primeira: string[], segunda: string[]) {
  return primeira.length === segunda.length
    && primeira.every((valor, indice) => valor === segunda[indice]);
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

/**
 * Vincula documentos antigos usando, nessa ordem: kitId já presente, mapaId já
 * salvo e nome equivalente. Quando não há candidato seguro, cria um mapa com ID
 * determinístico. O lote sempre grava os dois lados do vínculo juntos.
 */
export async function migrarKitsEMapas(usuarioId: string) {
  const [kitsSnapshot, mapasSnapshot] = await Promise.all([
    getDocs(query(kitsCollection(usuarioId), where("userId", "==", usuarioId))),
    getDocs(query(mapasCollection(usuarioId), where("userId", "==", usuarioId))),
  ]);

  const kits = kitsSnapshot.docs.map((documento) => ({
    id: documento.id,
    referencia: documento.ref,
    data: documento.data(),
  }));
  const mapas = mapasSnapshot.docs.map((documento) => ({
    id: documento.id,
    referencia: documento.ref,
    data: documento.data(),
  }));
  const mapasPorId = new Map(mapas.map((mapa) => [mapa.id, mapa]));
  const kitIds = new Set(kits.map((kit) => kit.id));
  const mapasAtribuidos = new Set<string>();

  let lote: WriteBatch = writeBatch(db);
  let operacoes = 0;
  const garantirEspaco = async (quantidade: number) => {
    if (operacoes + quantidade <= LIMITE_OPERACOES_LOTE) return;
    await lote.commit();
    lote = writeBatch(db);
    operacoes = 0;
  };

  for (const kit of kits) {
    const unidades = unidadesValidas(kit.data.unidadeIds);
    const mapaIdInformado =
      typeof kit.data.mapaId === "string" && kit.data.mapaId.trim()
        ? kit.data.mapaId
        : "";

    let mapa = mapas.find(
      (candidato) =>
        !mapasAtribuidos.has(candidato.id) &&
        candidato.data.kitId === kit.id,
    );
    if (!mapa && mapaIdInformado) {
      const candidato = mapasPorId.get(mapaIdInformado);
      if (
        candidato &&
        !mapasAtribuidos.has(candidato.id) &&
        (!candidato.data.kitId || candidato.data.kitId === kit.id)
      ) {
        mapa = candidato;
      }
    }
    if (!mapa) {
      mapa = mapas.find(
        (candidato) =>
          !mapasAtribuidos.has(candidato.id) &&
          !candidato.data.kitId &&
          nomeComparavel(candidato.data.nome) === nomeComparavel(kit.data.nome),
      );
    }

    let mapaId = mapa?.id;
    if (!mapaId) {
      const idPreferido = mapaIdInformado || mapaIdDoKit(kit.id);
      const colisao = mapasPorId.get(idPreferido);
      mapaId =
        colisao && (colisao.data.kitId || mapasAtribuidos.has(colisao.id))
          ? `${mapaIdDoKit(kit.id)}-migrado`
          : idPreferido;
    }

    const nome =
      typeof kit.data.nome === "string" && kit.data.nome.trim()
        ? kit.data.nome.trim().slice(0, 80)
        : "Kit sem nome";
    const mapaUnidades = unidadesValidas(mapa?.data.kitUnidadeIds);
    const vinculoConsistente = Boolean(
      mapa
      && kit.data.mapaId === mapaId
      && mapa.data.userId === usuarioId
      && mapa.data.nome === nome
      && mapa.data.tipo === "kit"
      && mapa.data.kitId === kit.id
      && listasIguais(mapaUnidades, unidades),
    );

    if (!vinculoConsistente) {
      await garantirEspaco(2);
      const referenciaMapa = mapa?.referencia ?? mapaDocument(usuarioId, mapaId);
      lote.set(
        referenciaMapa,
        {
          userId: usuarioId,
          nome,
          tipo: "kit",
          kitId: kit.id,
          kitUnidadeIds: unidades,
          ...(mapa
            ? {}
            : {
                marcacoes: {},
                criadoEm: serverTimestamp(),
                criadoPor: usuarioId,
              }),
          atualizadoEm: serverTimestamp(),
          atualizadoPor: usuarioId,
        },
        { merge: true },
      );
      lote.update(kit.referencia, {
        mapaId,
        atualizadoEm: serverTimestamp(),
      });
      operacoes += 2;
    }
    mapasAtribuidos.add(mapaId);
  }

  // Mapas de Kit duplicados ou cujo Kit não existe voltam a ser mapas manuais,
  // preservando integralmente suas marcações.
  for (const mapa of mapas) {
    if (
      typeof mapa.data.kitId === "string" &&
      (!kitIds.has(mapa.data.kitId) || !mapasAtribuidos.has(mapa.id))
    ) {
      await garantirEspaco(1);
      lote.update(mapa.referencia, {
        tipo: "manual",
        kitId: deleteField(),
        kitUnidadeIds: [],
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuarioId,
      });
      operacoes += 1;
    }
  }

  if (operacoes > 0) await lote.commit();
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
          return {
            id: documento.id,
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
    },
    aoFalhar,
  );
}

export async function salvarKitRemoto(
  usuarioId: string,
  dados: DadosKit,
) {
  const nome = dados.nome.trim().slice(0, 80);
  if (!nome) throw new Error("Informe um nome para o Kit e seu mapa.");

  if (dados.id) {
    const referenciaKit = doc(kitsCollection(usuarioId), dados.id);
    await runTransaction(db, async (transacao) => {
      const kitSnapshot = await transacao.get(referenciaKit);
      if (!kitSnapshot.exists()) throw new Error("O Kit não existe mais.");
      const mapaId = kitSnapshot.data().mapaId;
      if (typeof mapaId !== "string" || !mapaId) {
        throw new Error("O Kit ainda não possui um mapa associado. Recarregue para concluir a migração.");
      }
      const referenciaMapa = mapaDocument(usuarioId, mapaId);
      const mapaSnapshot = await transacao.get(referenciaMapa);
      if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== dados.id) {
        throw new Error("O mapa associado ao Kit não foi encontrado.");
      }
      transacao.update(referenciaKit, {
        nome,
        materiais: dados.materiais,
        atualizadoEm: serverTimestamp(),
      });
      transacao.update(referenciaMapa, {
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
    mapaId,
    nome,
    materiais: dados.materiais,
    unidadeIds: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  lote.set(mapaDocument(usuarioId, mapaId), {
    userId: usuarioId,
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

export async function excluirKitRemoto(usuarioId: string, kitId: string) {
  const referenciaKit = doc(kitsCollection(usuarioId), kitId);
  await runTransaction(db, async (transacao) => {
    const kitSnapshot = await transacao.get(referenciaKit);
    if (!kitSnapshot.exists()) return;
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new Error("Não foi possível localizar o mapa deste Kit.");
    }
    const referenciaMapa = mapaDocument(usuarioId, mapaId);
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
  kitId: string,
  unidadeIds: string[],
) {
  const idsValidos = unidadesValidas(unidadeIds);
  const referenciaKit = doc(kitsCollection(usuarioId), kitId);
  await runTransaction(db, async (transacao) => {
    const kitSnapshot = await transacao.get(referenciaKit);
    if (!kitSnapshot.exists()) throw new Error("O Kit não existe mais.");
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new Error("O Kit não possui um mapa associado.");
    }
    const referenciaMapa = mapaDocument(usuarioId, mapaId);
    const mapaSnapshot = await transacao.get(referenciaMapa);
    if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== kitId) {
      throw new Error("O mapa associado ao Kit não foi encontrado.");
    }
    transacao.update(referenciaKit, {
      unidadeIds: idsValidos,
      atualizadoEm: serverTimestamp(),
    });
    transacao.update(referenciaMapa, {
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
