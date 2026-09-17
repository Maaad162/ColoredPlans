import { useEffect, useState } from "react";
import { observarPerfil } from "../services/perfil";
import type { PerfilUsuario } from "../types/planta";

export function usePerfil(usuarioId: string) {
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    return observarPerfil(
      usuarioId,
      (perfilAtual) => {
        setPerfil(perfilAtual);
        setErro(null);
        setCarregando(false);
      },
      (falha) => {
        setPerfil(null);
        console.error("Falha ao carregar perfil:", falha);
        setErro("Não foi possível carregar o perfil da conta.");
        setCarregando(false);
      },
    );
  }, [usuarioId]);

  return { perfil, carregando, erro };
}
