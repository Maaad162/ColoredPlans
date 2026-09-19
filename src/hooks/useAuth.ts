import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { registrarErro, traduzirErro } from "../services/erros";

export function useAuth() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const cancelarObservacao = onAuthStateChanged(auth, (usuarioAtual) => {
        setUsuario(usuarioAtual);
        setErro(null);
        setCarregando(false);
      }, (falha) => {
        registrarErro("sessão", falha); setErro(traduzirErro(falha).mensagem);
        setUsuario(null); setCarregando(false);
      });
    return () => {
      cancelarObservacao();
    };
  }, []);

  async function entrar(email: string, senha: string) {
    await signInWithEmailAndPassword(auth, email.trim(), senha);
  }

  async function sair() {
    await signOut(auth);
  }

  return { usuario, carregando, entrar, sair, erro };
}
