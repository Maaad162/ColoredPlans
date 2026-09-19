import { useEffect, useState } from "react";
import { atualizarUnidadesKit, excluirKitRemoto, observarKits, salvarKitRemoto, type DadosKit } from "../services/kits";
import { useControleSync } from "./useSincronizacao";
import type { Kit } from "../types/planta";

export function useKits(usuarioId: string, obraId: string, habilitado: boolean) {
  const controle = useControleSync();
  const [kits, setKits] = useState<Kit[]>([]);
  const [carregando, setCarregando] = useState(habilitado);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!habilitado) return;
    controle.observar("kits", { fromCache: true, hasPendingWrites: false });
    const cancelar = observarKits(usuarioId, obraId, (atuais, metadata) => {
      setKits(atuais); setCarregando(false); controle.observar("kits", metadata);
    }, (falha) => {
      setCarregando(false); controle.falharLeitura("kits", falha, () => setTentativa(v => v + 1));
    });
    return () => { cancelar(); controle.remover("kits"); };
  }, [habilitado, usuarioId, obraId, controle, tentativa]);
  return { kits, carregando,
    salvar: (dados: DadosKit) => controle.executar(`kit:${dados.id ?? "novo"}`, () => salvarKitRemoto(usuarioId, obraId, dados)),
    excluir: (id: string) => controle.executar(`kit:${id}`, () => excluirKitRemoto(usuarioId, obraId, id)),
    vincular: (id: string, ids: string[]) => controle.executar(`kit:${id}`, () => atualizarUnidadesKit(usuarioId, obraId, id, ids)),
  };
}
