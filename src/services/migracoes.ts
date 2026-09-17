import {
  collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction,
  serverTimestamp, where, type Firestore,
} from "firebase/firestore";
import { CURRENT_SCHEMA_VERSION, lerSchemaVersion, validarId } from "../config/dados.ts";
import { planejarMigracaoV1 } from "./migracoes/planejarV1.ts";
import type { Obra } from "../types/planta";

const emAndamento = new WeakMap<Firestore, Map<string, Promise<void>>>();

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
  const referencia = doc(db, "usuarios", validarId(usuarioId), "obras", validarId(obra.id));
  const obraAtual = await getDocFromServer(referencia);
  if (obraAtual.exists() && obraAtual.data().userId !== usuarioId) {
    throw new Error("Proprietário inválido na obra. Solicite revisão administrativa.");
  }
  if (lerSchemaVersion(obraAtual.data()?.schemaVersion) === CURRENT_SCHEMA_VERSION) return;
  const mapasRef = collection(referencia, "mapas");
  const kitsRef = collection(db, "usuarios", usuarioId, "kits");
  const [mapas, kits, legados] = await Promise.all([
    getDocsFromServer(query(mapasRef, where("userId", "==", usuarioId))),
    estoque ? getDocsFromServer(query(kitsRef, where("userId", "==", usuarioId))) : null,
    getDocsFromServer(query(collection(db, "obras", obra.id, "mapas"), where("criadoPor", "==", usuarioId))),
  ]);
  const documentos = (snapshot: typeof mapas) => snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  const plano = planejarMigracaoV1(usuarioId, obra.id, documentos(mapas), kits ? documentos(kits) : [], documentos(legados));
  const originais = new Map([...mapas.docs, ...(kits?.docs ?? []), ...legados.docs]
    .map((item) => [item.ref.path, item.data()]));
  for (const grupo of plano) {
    await runTransaction(db, async (transacao) => {
      const refs = grupo.map((item) => doc(item.colecao === "mapas" ? mapasRef : kitsRef, item.id));
      const fontes = grupo.flatMap((item) => typeof item.dados.origemLegada === "string"
        ? [doc(db, item.dados.origemLegada)] : []);
      const lidos = await Promise.all([...refs, ...fontes].map((ref) => transacao.get(ref)));
      const atuais = lidos.slice(0, refs.length);
      for (const atual of lidos) {
        if (JSON.stringify(atual.data()) !== JSON.stringify(originais.get(atual.ref.path))) {
          throw new Error("Dados alterados durante a migração. Recarregue para tentar novamente; nenhuma alteração concorrente foi sobrescrita.");
        }
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
