import { useResumoSync } from "../hooks/useSincronizacao";

const textos = { sincronizado: "Sincronizado", salvando: "Salvando…", offline: "Offline · dados locais", erro: "Erro ao sincronizar" };
export function IndicadorSincronizacao() {
  const { estado } = useResumoSync();
  return <span role="status" aria-live="polite" className={`header-meta__live${estado === "erro" ? " header-meta__live--erro" : ""}`}>
    <i aria-hidden="true" />{textos[estado]}
  </span>;
}
export function FalhasSincronizacao() {
  const { falhas, pendentes } = useResumoSync();
  return <>{falhas.map(falha => <div key={falha.chave} className="sync-warning" role="alert">
    {falha.mensagem} <button className="link-button" type="button" disabled={pendentes > 0} onClick={falha.tentar}>Tentar novamente</button>
  </div>)}</>;
}
