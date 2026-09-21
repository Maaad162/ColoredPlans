import { DEFINICAO_LEGADA, PLANTA_LEGADA_ID, idsDaPlanta, plantaDoDocumento } from "./geometria";
import type { PlantaDefinition } from "../types/planta";
import { ErroOperacional } from "./erros";
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
  type SnapshotMetadata,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { CURRENT_SCHEMA_VERSION, lerObraIdDoKit, lerSchemaVersion } from "../config/dados";
import { kitsCollection, mapaDocument } from "./caminhos";
import { validarMateriais, validarUnidadesKit } from "./validacoes";
import type { Kit, MaterialKit } from "../types/planta";

export interface DadosKit {
  id?: string;
  nome: string;
  materiais: MaterialKit[];
}

function mapaIdDoKit(kitId: string) {
  return `mapa-kit-${kitId}`;
}

export function observarKits(
  usuarioId: string,
  obraId: string,
  aoAtualizar: (kits: Kit[], metadata: SnapshotMetadata) => void,
  aoFalhar: (erro: Error) => void,
  plantaId = PLANTA_LEGADA_ID, definicao: PlantaDefinition = DEFINICAO_LEGADA,
): Unsubscribe {
  return onSnapshot(
    query(kitsCollection(usuarioId), where("userId", "==", usuarioId), ...(plantaId === PLANTA_LEGADA_ID ? [] : [where("obraId", "==", obraId), where("plantaId", "==", plantaId)])),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        const kits = snapshot.docs
          .filter((documento) => lerObraIdDoKit(documento.data().obraId) === obraId && plantaDoDocumento(documento.data().plantaId) === plantaId)
          .map((documento) => {
            const data = documento.data();
            return {
              id: documento.id,
              obraId, plantaId,
              schemaVersion: lerSchemaVersion(data.schemaVersion),
              userId: usuarioId,
              mapaId: typeof data.mapaId === "string" ? data.mapaId : "",
              nome:
                typeof data.nome === "string" && data.nome.trim()
                  ? data.nome.trim().slice(0, 80)
                  : "Kit sem nome",
              materiais: validarMateriais(data.materiais),
              unidadeIds: validarUnidadesKit(data.unidadeIds, idsDaPlanta(definicao)),
              criadoEm:
                data.criadoEm instanceof Timestamp
                  ? data.criadoEm.toDate().toISOString()
                  : new Date().toISOString(),
              atualizadoEm:
                data.atualizadoEm instanceof Timestamp
                  ? data.atualizadoEm.toDate().toISOString()
                  : new Date().toISOString(),
              atualizadoPor: typeof data.atualizadoPor === "string" ? data.atualizadoPor : "",
            } satisfies Kit;
          })
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
        aoAtualizar(kits, snapshot.metadata);
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
  plantaId = PLANTA_LEGADA_ID,
) {
  const nome = dados.nome.trim().slice(0, 80);
  if (!nome) throw new ErroOperacional("validacao", "Informe um nome para o Kit e seu mapa.");

  if (dados.id) {
    const referenciaKit = doc(kitsCollection(usuarioId), dados.id);
    await runTransaction(db, async (transacao) => {
      const kitSnapshot = await transacao.get(referenciaKit);
      if (!kitSnapshot.exists()) throw new ErroOperacional("ausente", "O Kit não existe mais.");
      if (lerObraIdDoKit(kitSnapshot.data().obraId) !== obraId) {
        throw new ErroOperacional("validacao", "O Kit pertence a outra obra.");
      }
      if (plantaDoDocumento(kitSnapshot.data().plantaId) !== plantaId) throw new ErroOperacional("permissao", "O Kit pertence a outra planta.");
      lerSchemaVersion(kitSnapshot.data().schemaVersion);
      const mapaId = kitSnapshot.data().mapaId;
      if (typeof mapaId !== "string" || !mapaId) {
        throw new ErroOperacional("validacao", "O Kit ainda não possui um mapa associado. Recarregue para concluir a migração.");
      }
      const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
      const mapaSnapshot = await transacao.get(referenciaMapa);
      if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== dados.id) {
        throw new ErroOperacional("validacao", "O mapa associado ao Kit não foi encontrado.");
      }
      transacao.update(referenciaKit, {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        obraId,
        nome,
        materiais: validarMateriais(dados.materiais),
        atualizadoEm: serverTimestamp(),
        atualizadoPor: usuarioId,
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
    obraId, plantaId,
    mapaId,
    nome,
    materiais: validarMateriais(dados.materiais),
    unidadeIds: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: usuarioId,
  });
  lote.set(mapaDocument(usuarioId, obraId, mapaId), {
    userId: usuarioId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    obraId, plantaId,
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
    if (lerObraIdDoKit(kitSnapshot.data().obraId) !== obraId) {
      throw new ErroOperacional("validacao", "O Kit pertence a outra obra.");
    }
    lerSchemaVersion(kitSnapshot.data().schemaVersion);
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new ErroOperacional("validacao", "Não foi possível localizar o mapa deste Kit.");
    }
    const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
    const mapaSnapshot = await transacao.get(referenciaMapa);
    if (mapaSnapshot.exists() && mapaSnapshot.data().kitId !== kitId) {
      throw new ErroOperacional("validacao", "O mapa informado está associado a outro Kit.");
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
  unidades: readonly string[] = idsDaPlanta(DEFINICAO_LEGADA),
) {
  const idsValidos = validarUnidadesKit(unidadeIds, unidades);
  const referenciaKit = doc(kitsCollection(usuarioId), kitId);
  await runTransaction(db, async (transacao) => {
    const kitSnapshot = await transacao.get(referenciaKit);
    if (!kitSnapshot.exists()) throw new ErroOperacional("ausente", "O Kit não existe mais.");
    if (lerObraIdDoKit(kitSnapshot.data().obraId) !== obraId) {
      throw new ErroOperacional("validacao", "O Kit pertence a outra obra.");
    }
    lerSchemaVersion(kitSnapshot.data().schemaVersion);
    const mapaId = kitSnapshot.data().mapaId;
    if (typeof mapaId !== "string" || !mapaId) {
      throw new ErroOperacional("validacao", "O Kit não possui um mapa associado.");
    }
    const referenciaMapa = mapaDocument(usuarioId, obraId, mapaId);
    const mapaSnapshot = await transacao.get(referenciaMapa);
    if (!mapaSnapshot.exists() || mapaSnapshot.data().kitId !== kitId) {
      throw new ErroOperacional("validacao", "O mapa associado ao Kit não foi encontrado.");
    }
    transacao.update(referenciaKit, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      obraId,
      unidadeIds: idsValidos,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: usuarioId,
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
