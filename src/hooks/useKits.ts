import { useEffect, useState } from "react";
import { atualizarUnidadesKit, excluirKitRemoto, observarKits, salvarKitRemoto, type DadosKit } from "../services/kits";
import { useControleSync } from "./useSincronizacao";
import { idsDaPlanta } from "../services/geometria";
import type { PlantaObra, PlantaDefinition } from "../types/planta";
import type { Kit } from "../types/planta";

export function useKits(usuarioId: string, obraId: string, habilitado: boolean, planta: PlantaObra, definicao: PlantaDefinition) {
  const controle = useControleSync();
  const [kits, setKits] = useState<Kit[]>([]);
  const [carregando, setCarregando] = useState(habilitado);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!habilitado) return;
    const chave = `kits:${obraId}:${planta.id}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const cancelar = observarKits(usuarioId, obraId, (atuais, metadata) => {
      setKits(atuais); setCarregando(false); controle.observar(chave, metadata);
    }, (falha) => {
      setCarregando(false); controle.falharLeitura(chave, falha, () => setTentativa(v => v + 1));
    }, planta.id, definicao);
    return () => { cancelar(); controle.remover(chave); };
  }, [habilitado, usuarioId, obraId, controle, tentativa, planta.id, definicao]);
  return { kits, carregando,
    salvar: (dados: DadosKit) => controle.executar(`kit:${obraId}:${planta.id}:${dados.id ?? "novo"}`, () => salvarKitRemoto(usuarioId, obraId, dados, planta.id)),
    excluir: (id: string) => controle.executar(`kit:${obraId}:${planta.id}:${id}`, () => excluirKitRemoto(usuarioId, obraId, id)),
    vincular: (id: string, ids: string[]) => controle.executar(`kit:${obraId}:${planta.id}:${id}`, () => atualizarUnidadesKit(usuarioId, obraId, id, ids, idsDaPlanta(definicao))),
  };
}
