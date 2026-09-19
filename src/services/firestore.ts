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
import { UNIDADE_BY_ID } from "../data/planta";
import type { MapaServico, Marcacoes, StatusId } from "../types/planta";

function normalizarMarcacoes(valor: unknown): Marcacoes {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErroOperacional("validacao", "Este mapa contém marcações inválidas. Solicite revisão ao responsável.");
  const marcacoes: Marcacoes = {};
  for (const [id, status] of Object.entries(valor)) {
    if (status !== null && typeof status !== "string") throw new ErroOperacional("validacao", "Este mapa contém um estado inválido. Solicite revisão ao responsável.");
    marcacoes[id] = status;
  }
  validarMarcacoes(marcacoes);
  return marcacoes;
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
                  ? data.nome
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
) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "unidade", mapa, unidadeId, status });
}

export function substituirMarcacoesRemotas(
  mapa: MapaServico,
  marcacoes: Marcacoes,
  usuarioId: string,
  obraId: string,
) {
  return gravarComHistorico(db, usuarioId, obraId, { acao: "marcacoes", mapa, marcacoes });
}
