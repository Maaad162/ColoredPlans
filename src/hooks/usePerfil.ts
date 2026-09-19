import { useEffect, useState } from "react";
import { observarPerfil } from "../services/perfil";
import type { PerfilUsuario } from "../types/planta";
import { registrarErro, traduzirErro } from "../services/erros";

export function usePerfil(usuarioId: string) {
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

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
        registrarErro("perfil", falha);
        setErro(traduzirErro(falha).mensagem);
        setCarregando(false);
      },
    );
  }, [usuarioId, tentativa]);

  return { perfil, carregando, erro, tentarNovamente: () => setTentativa(v => v + 1) };
}
