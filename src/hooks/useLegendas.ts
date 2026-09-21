import { useEffect, useState } from "react";
import { criarLegendaRemota, editarLegendaRemota, excluirLegendaRemota, observarLegendas } from "../services/legendas";
import { useControleSync } from "./useSincronizacao";
import type { CategoriaExecucao, LegendaUsuario } from "../types/planta";

export function useLegendas(usuarioId: string) {
  const controle = useControleSync();
  const [legendas, setLegendas] = useState<LegendaUsuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    controle.observar("legendas", { fromCache: true, hasPendingWrites: false });
    const cancelar = observarLegendas(usuarioId, (atuais, metadata) => {
      setLegendas(atuais); setCarregando(false); controle.observar("legendas", metadata);
    }, (falha) => {
      setCarregando(false); controle.falharLeitura("legendas", falha, () => setTentativa(v => v + 1));
    });
    return () => { cancelar(); controle.remover("legendas"); };
  }, [usuarioId, controle, tentativa]);
  return { legendas, carregando,
    criar: (nome: string, cor: string, categoria: CategoriaExecucao) => controle.executar("legenda:nova", () => criarLegendaRemota(usuarioId, nome, cor, categoria)),
    editar: (id: string, nome: string, cor: string, categoria: CategoriaExecucao) => controle.executar(`legenda:${id}`, () => editarLegendaRemota(usuarioId, id, nome, cor, categoria)),
    excluir: (id: string) => controle.executar(`legenda:${id}`, () => excluirLegendaRemota(usuarioId, id)),
  };
}
