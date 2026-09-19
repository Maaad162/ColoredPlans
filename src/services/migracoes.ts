import {
  collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction,
  serverTimestamp, where, Bytes, DocumentReference, GeoPoint, Timestamp, VectorValue,
  refEqual, type DocumentSnapshot, type Firestore,
} from "firebase/firestore";
import { COLECOES, CURRENT_SCHEMA_VERSION, lerSchemaVersion, validarId } from "../config/dados.ts";
import { planejarMigracaoV1 } from "./migracoes/planejarV1.ts";
import type { Obra } from "../types/planta";

const emAndamento = new WeakMap<Firestore, Map<string, Promise<void>>>();

function dadosIguais(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Timestamp) return b instanceof Timestamp && a.isEqual(b);
  if (a instanceof GeoPoint) return b instanceof GeoPoint && a.isEqual(b);
  if (a instanceof Bytes) return b instanceof Bytes && a.isEqual(b);
  if (a instanceof VectorValue) return b instanceof VectorValue && a.isEqual(b);
  if (a instanceof DocumentReference) return b instanceof DocumentReference && refEqual(a, b);
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, index) => dadosIguais(item, b[index]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object"
    || Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const primeiro = a as Record<string, unknown>;
  const segundo = b as Record<string, unknown>;
  const chaves = Object.keys(primeiro);
  return chaves.length === Object.keys(segundo).length
    && chaves.every((chave) => Object.hasOwn(segundo, chave) && dadosIguais(primeiro[chave], segundo[chave]));
}

export function conferirDocumentoDaMigracao(atual: DocumentSnapshot, original?: DocumentSnapshot) {
  // Snapshots também comparam estado interno; JSON depende da ordem das chaves.
  if (original ? !dadosIguais(atual.data(), original.data()) : atual.exists()) {
    throw new Error(`Dados alterados durante a migração (${atual.ref.path}). Recarregue para tentar novamente; nenhuma alteração concorrente foi sobrescrita.`);
  }
}

export function migrarObra(db: Firestore, usuarioId: string, obra: Obra, estoque: boolean) {
  const chave = `${usuarioId}/${obra.id}`;
  const pendentes = emAndamento.get(db) ?? new Map<string, Promise<void>>();
  emAndamento.set(db, pendentes);
  const existente = pendentes.get(chave);
  if (existente) return existente;
  const tarefa = executarMigracao(db, usuarioId, obra, estoque).finally(() => pendentes.delete(chave));
  pendentes.set(chave, tarefa);
  return tarefa;
}

async function executarMigracao(db: Firestore, usuarioId: string, obra: Obra, estoque: boolean) {
  const referencia = doc(db, COLECOES.usuarios, validarId(usuarioId), COLECOES.obras, validarId(obra.id));
  const obraAtual = await getDocFromServer(referencia);
  if (obraAtual.exists() && obraAtual.data().userId !== usuarioId) {
    throw new Error("Proprietário inválido na obra. Solicite revisão administrativa.");
  }
  if (lerSchemaVersion(obraAtual.data()?.schemaVersion) === CURRENT_SCHEMA_VERSION) return;
  const nomeObra = obraAtual.data()?.nome ?? obra.nome;
  if (typeof nomeObra !== "string" || !nomeObra.trim() || nomeObra.length > 100) {
    throw new Error("Nome inválido na obra. Solicite revisão administrativa.");
  }
  const mapasRef = collection(referencia, COLECOES.mapas);
  const kitsRef = collection(db, COLECOES.usuarios, usuarioId, COLECOES.kits);
  const [mapas, kits, legados] = await Promise.all([
    getDocsFromServer(query(mapasRef, where("userId", "==", usuarioId))),
    estoque ? getDocsFromServer(query(kitsRef, where("userId", "==", usuarioId))) : null,
    getDocsFromServer(query(collection(db, COLECOES.obras, obra.id, COLECOES.mapas), where("criadoPor", "==", usuarioId))),
  ]);
  const documentos = (snapshot: typeof mapas) => snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  const plano = planejarMigracaoV1(usuarioId, obra.id, documentos(mapas), kits ? documentos(kits) : [], documentos(legados));
  const originais = new Map([...mapas.docs, ...(kits?.docs ?? []), ...legados.docs]
    .map((item) => [item.ref.path, item]));
  for (const grupo of plano) {
    await runTransaction(db, async (transacao) => {
      const refs = grupo.map((item) => doc(item.colecao === "mapas" ? mapasRef : kitsRef, item.id));
      const fontes = grupo.flatMap((item) => typeof item.dados.origemLegada === "string"
        ? [doc(db, item.dados.origemLegada)] : []);
      const lidos = await Promise.all([...refs, ...fontes].map((ref) => transacao.get(ref)));
      const atuais = lidos.slice(0, refs.length);
      for (const atual of lidos) {
        conferirDocumentoDaMigracao(atual, originais.get(atual.ref.path));
      }
      grupo.forEach((item, index) => {
        transacao.set(refs[index], {
          ...item.dados,
          ...(!atuais[index].exists() ? { criadoEm: item.dados.criadoEm ?? serverTimestamp() } : {}),
          atualizadoEm: serverTimestamp(),
        }, { merge: true });
      });
    });
  }
  await runTransaction(db, async (transacao) => {
    const atual = await transacao.get(referencia);
    lerSchemaVersion(atual.data()?.schemaVersion);
    transacao.set(referencia, {
      userId: usuarioId, nome: atual.data()?.nome ?? obra.nome,
      schemaVersion: CURRENT_SCHEMA_VERSION, atualizadoEm: serverTimestamp(),
    }, { merge: true });
  });
}
