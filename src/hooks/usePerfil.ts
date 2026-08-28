import { useEffect, useState } from "react";
import { criarPerfil, observarPerfil } from "../services/perfil";
import type { PerfilUsuario, TipoConta } from "../types/planta";

export function usePerfil(usuarioId: string, email: string) {
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
        console.error("Falha ao carregar perfil:", falha);
        setErro("Não foi possível carregar o perfil da conta.");
        setCarregando(false);
      },
    );
  }, [usuarioId]);

  async function configurar(tipoConta: TipoConta) {
    setErro(null);
    try {
      await criarPerfil(usuarioId, email, tipoConta);
    } catch (falha) {
      console.error("Falha ao criar perfil:", falha);
      setErro("Não foi possível configurar o tipo da conta.");
      throw falha;
    }
  }

  return { perfil, carregando, erro, configurar };
}
