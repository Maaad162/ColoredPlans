import { useEffect, useState } from "react";
import { db } from "../config/firebase";
import { observarContexto, observarContextosMapa, salvarContexto } from "../services/contextos";
import { useControleSync } from "./useSincronizacao";
import type { ContextoUnidade, MapaServico } from "../types/planta";

const vazio = (unidadeId = ""): ContextoUnidade => ({ unidadeId, observacao: "", responsavel: "", atualizadoEm: null, atualizadoPor: "" });
export function useContextoUnidade(uid: string, obraId: string, mapa: MapaServico | undefined, unidadeId: string | undefined, contextoConhecido?: ContextoUnidade) {
  const controle = useControleSync();
  const [contexto, setContexto] = useState(() => vazio(unidadeId));
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!mapa || !unidadeId) { setContexto(vazio()); return; }
    if (contextoConhecido) { setContexto(contextoConhecido); return; }
    const chave = `contexto:${mapa.id}:${unidadeId}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const cancelar = observarContexto(db, uid, obraId, mapa.id, unidadeId, (atual, metadata) => { setContexto(atual); controle.observar(chave, metadata); },
      erro => controle.falharLeitura(chave, erro, () => setTentativa(v => v + 1)));
    return () => { cancelar(); controle.remover(chave); };
  }, [uid, obraId, mapa, unidadeId, contextoConhecido, controle, tentativa]);
  return { contexto, salvar: (observacao: string, responsavel: string) => {
    if (!mapa || !unidadeId) return Promise.resolve();
    return controle.executar(`contexto:${mapa.id}:${unidadeId}`, () => salvarContexto(db, uid, obraId, mapa, unidadeId, contexto, { observacao, responsavel }), `Contexto da unidade ${unidadeId}`);
  } };
}

export function useContextosMapa(uid: string, obraId: string, mapa: MapaServico | undefined) {
  const controle = useControleSync();
  const [contextos, setContextos] = useState<ContextoUnidade[]>([]);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!mapa) { setContextos([]); return; }
    const chave = `contextos:${mapa.id}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const cancelar = observarContextosMapa(db, uid, obraId, mapa.id, (atuais, metadata) => { setContextos(atuais); controle.observar(chave, metadata); },
      erro => controle.falharLeitura(chave, erro, () => setTentativa(v => v + 1)));
    return () => { cancelar(); controle.remover(chave); };
  }, [uid, obraId, mapa, controle, tentativa]);
  return contextos;
}
