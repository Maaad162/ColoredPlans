import { useEffect, useState } from "react";
import {
  atualizarUnidadesKit,
  excluirKitRemoto,
  migrarKitsEMapas,
  observarKits,
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

    let ativo = true;
    let cancelarObservacao: (() => void) | undefined;
    setCarregando(true);
    setErro(null);

    void migrarKitsEMapas(usuarioId)
      .then(() => {
        if (!ativo) return;
        cancelarObservacao = observarKits(
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
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        console.error("Falha ao migrar kits e mapas:", falha);
        setErro(
          falha instanceof Error
            ? `Não foi possível associar Kits e mapas: ${falha.message}`
            : "Não foi possível associar os Kits aos mapas.",
        );
        setCarregando(false);
      });

    return () => {
      ativo = false;
      cancelarObservacao?.();
    };
  }, [habilitado, usuarioId]);

  return {
    kits,
    carregando,
    erro,
    salvar: (dados: DadosKit) => salvarKitRemoto(usuarioId, dados),
    excluir: (kitId: string) => excluirKitRemoto(usuarioId, kitId),
    vincular: (kitId: string, unidadeIds: string[]) =>
      atualizarUnidadesKit(usuarioId, kitId, unidadeIds),
  };
}
