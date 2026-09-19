import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sincronizacao } from "../services/sincronizacao";

const Contexto = createContext<Sincronizacao | null>(null);
export function ProvedorSincronizacao({ children }: { children: ReactNode }) {
  const [controle] = useState(() => new Sincronizacao());
  useEffect(() => {
    const atualizar = () => controle.conectar(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar); window.addEventListener("offline", atualizar);
    return () => { window.removeEventListener("online", atualizar); window.removeEventListener("offline", atualizar); };
  }, [controle]);
  return <Contexto.Provider value={controle}>{children}</Contexto.Provider>;
}
export function useControleSync() {
  const controle = useContext(Contexto);
  if (!controle) throw new Error("Contexto de sincronização ausente.");
  return controle;
}
export function useResumoSync() {
  const controle = useControleSync();
  return useSyncExternalStore(controle.subscribe, controle.getSnapshot);
}
