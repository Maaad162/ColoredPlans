import { useEffect, useState } from "react";
import {
  aplicarKitEmUnidades,
  excluirKitRemoto,
  observarKits,
  removerKitDeUnidades,
  salvarKitRemoto,
  type DadosKit,
} from "../services/kits";
import type { Kit } from "../types/planta";

export function useKits(usuarioId: string, habilitado: boolean) {
  const [kits, setKits] = useState<Kit[]>([]);
  const [carregando, setCarregando] = useState(habilitado);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!habilitado) {
      setKits([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    return observarKits(
      usuarioId,
      (atuais) => {
        setKits(atuais);
        setErro(null);
        setCarregando(false);
      },
      (falha) => {
        console.error("Falha ao sincronizar kits:", falha);
        setErro("Não foi possível sincronizar a Central de Kits.");
        setCarregando(false);
      },
    );
  }, [habilitado, usuarioId]);

  return {
    kits,
    carregando,
    erro,
    salvar: (dados: DadosKit) => salvarKitRemoto(usuarioId, dados),
    excluir: (kitId: string) => excluirKitRemoto(usuarioId, kitId),
    aplicar: (kitId: string, unidadeIds: string[]) =>
      aplicarKitEmUnidades(usuarioId, kitId, unidadeIds),
    remover: (kitId: string, unidadeIds: string[]) =>
      removerKitDeUnidades(usuarioId, kitId, unidadeIds),
  };
}
