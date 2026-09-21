import { useControleSync, useResumoSync } from "../hooks/useSincronizacao";

const textos = { sincronizado: "Sincronizado", salvando: "Salvando…", offline: "Offline · dados locais", erro: "Erro ao sincronizar" };
export function IndicadorSincronizacao() {
  const { estado } = useResumoSync();
  const controle = useControleSync();
  return <span role="status" aria-live="polite" className={`header-meta__live${estado === "erro" ? " header-meta__live--erro" : ""}`}>
    <i aria-hidden="true" />{estado === "erro"
      ? <button type="button" className="link-button" onClick={() => controle.reabrirAviso()}>{textos[estado]}</button>
      : textos[estado]}
  </span>;
}
export function FalhasSincronizacao() {
  const { aviso, pendentes } = useResumoSync();
  const controle = useControleSync();
  if (!aviso) return null;
  return <div className="sync-warning" role="alert">
    <span>{aviso.mensagem} <button className="link-button" type="button" disabled={pendentes > 0} onClick={aviso.tentar}>Tentar novamente</button></span>
    <button className="sync-warning__close" type="button" aria-label="Fechar mensagem de erro" onClick={() => controle.fecharAviso()}>×</button>
  </div>;
}
