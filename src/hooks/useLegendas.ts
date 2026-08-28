import { useEffect, useState } from "react";
import {
  criarLegendaRemota,
  editarLegendaRemota,
  excluirLegendaRemota,
  observarLegendas,
} from "../services/legendas";
import type { LegendaUsuario } from "../types/planta";

export function useLegendas(usuarioId: string) {
  const [legendas, setLegendas] = useState<LegendaUsuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    return observarLegendas(
      usuarioId,
      (atuais) => {
        setLegendas(atuais);
        setErro(null);
        setCarregando(false);
      },
      (falha) => {
        console.error("Falha ao sincronizar legendas:", falha);
        setErro("Não foi possível sincronizar as cores e legendas.");
        setCarregando(false);
      },
    );
  }, [usuarioId]);

  return {
    legendas,
    carregando,
    erro,
    criar: (nome: string, cor: string) =>
      criarLegendaRemota(usuarioId, nome, cor),
    editar: (id: string, nome: string, cor: string) =>
      editarLegendaRemota(usuarioId, id, nome, cor),
    excluir: (id: string) => excluirLegendaRemota(usuarioId, id),
  };
}
