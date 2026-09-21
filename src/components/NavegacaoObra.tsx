import { useEffect, useState, type ReactNode } from "react";
import { useObras, usePlantas, useDefinicao } from "../hooks/useHierarquia";
import { useControleSync, useResumoSync } from "../hooks/useSincronizacao";
import { FalhasSincronizacao, IndicadorSincronizacao } from "./EstadoSincronizacao";
import { VisaoObra } from "./VisaoObra";
import type { Obra, PlantaDefinition, PlantaObra, StatusFilter } from "../types/planta";

export interface DestinoMapa { plantaId: string; mapaId: string; filtro: StatusFilter }
interface Props {
  uid: string; estoque: boolean; onSair: () => Promise<void>;
  renderizar: (obra: Obra, planta: PlantaObra, definicao: PlantaDefinition, destino: DestinoMapa | null) => ReactNode;
}
function lerPreferencia(chave: string) { try { return localStorage.getItem(chave) ?? ""; } catch { return ""; } }
function salvarPreferencia(chave: string, valor: string) { try { localStorage.setItem(chave, valor); } catch { /* Preferência opcional. */ } }
export function NavegacaoObra(props: Props) {
  const controle = useControleSync();
  const { dados: obras, carregando } = useObras(props.uid);
  const chave = `coloredplans:obra:${props.uid}`;
  const [selecionada, selecionar] = useState(() => lerPreferencia(chave));
  const { pendentes } = useResumoSync();
  const obra = obras.find(o => o.id === selecionada) ?? obras.find(o => o.status !== "arquivada") ?? obras[0];
  useEffect(() => { if (obra) salvarPreferencia(chave, obra.id); }, [chave, obra]);
  return <>
    <div className="context-nav"><label>Obra <select aria-label="Obra selecionada" value={obra?.id ?? ""} disabled={!!pendentes} onChange={e => selecionar(e.target.value)}>
      {obras.map(o => <option key={o.id} value={o.id}>{o.nome}{o.status === "arquivada" ? " · Arquivada" : ""}</option>)}
    </select></label><IndicadorSincronizacao /><button type="button" className="header-logout" onClick={() => controle.enfileirar("sessao:sair", props.onSair, "Saída da conta")}>Sair</button></div>
    <FalhasSincronizacao />
    {carregando ? <p role="status">Carregando obras…</p> : obra ? <ObraSelecionada key={obra.id} {...props} obra={obra} />
      : <p>Nenhuma obra disponível. Solicite o provisionamento ao responsável técnico.</p>}
  </>;
}
function ObraSelecionada({ obra, ...props }: Props & { obra: Obra }) {
  const { dados: plantas, carregando } = usePlantas(props.uid, obra.id, obra.plantaLegada);
  const chave = `coloredplans:planta:${props.uid}:${obra.id}`;
  const [selecionada, selecionar] = useState(() => lerPreferencia(chave));
  const [visao, setVisao] = useState(false);
  const [destino, setDestino] = useState<DestinoMapa | null>(null);
  const { pendentes } = useResumoSync();
  const planta = plantas.find(p => p.id === selecionada) ?? plantas[0];
  useEffect(() => { if (planta) salvarPreferencia(chave, planta.id); }, [chave, planta]);
  if (carregando) return <p role="status">Carregando plantas…</p>;
  return <>
    <nav className="context-nav" aria-label="Obra e planta">
      <span>{obra.nome} ›</span>
      <label>Planta <select aria-label="Planta selecionada" value={planta?.id ?? ""} disabled={!!pendentes} onChange={e => { selecionar(e.target.value); setDestino(null); setVisao(false); }}>
        {plantas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select></label>
      <button type="button" className="button button--secondary" disabled={!!pendentes} onClick={() => setVisao(v => !v)}>{visao ? "Voltar à planta" : "Visão geral da obra"}</button>
      {obra.status === "arquivada" && <span>Obra arquivada · dados preservados</span>}
    </nav>
    {visao ? <VisaoObra uid={props.uid} obra={obra} plantas={plantas} estoque={props.estoque} onAbrir={d => { selecionar(d.plantaId); setDestino(d); setVisao(false); }} />
      : planta && <PlantaSelecionada key={`${planta.id}:${planta.templateId}`} {...props} obra={obra} planta={planta} destino={destino} />}
  </>;
}
function PlantaSelecionada({ uid, obra, planta, destino, renderizar }: Props & { obra: Obra; planta: PlantaObra; destino: DestinoMapa | null }) {
  const definicao = useDefinicao(uid, obra.id, planta);
  return definicao ? renderizar(obra, planta, definicao, destino) : <p role="status">Aguardando definição da planta. Se estiver offline, conecte-se para carregar uma planta ainda não armazenada.</p>;
}
