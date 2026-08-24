import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../config/firebase";

export function useAuth() {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const limiteDeEspera = window.setTimeout(() => setCarregando(false), 4000);
    const cancelarObservacao = onAuthStateChanged(auth, (usuarioAtual) => {
        window.clearTimeout(limiteDeEspera);
        setUsuario(usuarioAtual);
        setCarregando(false);
      });
    return () => {
      window.clearTimeout(limiteDeEspera);
      cancelarObservacao();
    };
  }, []);

  async function entrar(email: string, senha: string) {
    await signInWithEmailAndPassword(auth, email.trim(), senha);
  }

  async function sair() {
    await signOut(auth);
  }

  return { usuario, carregando, entrar, sair };
}
