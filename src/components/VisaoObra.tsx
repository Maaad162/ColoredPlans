import { useEffect, useState } from "react";
import { useDefinicao, useEquipes } from "../hooks/useHierarquia";
import { useLegendas } from "../hooks/useLegendas";
import { useKits } from "../hooks/useKits";
import { useControleSync } from "../hooks/useSincronizacao";
import { observarMapas } from "../services/firestore";
import { calcularResumoExecucao, calcularResumoMateriais } from "../services/operacao";
import { unidadesDaPlanta } from "../services/geometria";
import type { DisponibilidadeMaterial, Kit, Equipe, MapaServico, Obra, PlantaDefinition, PlantaObra, StatusConfig, StatusFilter } from "../types/planta";
import type { DestinoMapa } from "./NavegacaoObra";

interface Props { disponibilidades?: (kit: Kit) => DisponibilidadeMaterial[]; uid: string; obra: Obra; plantas: PlantaObra[]; estoque: boolean; onAbrir: (destino: DestinoMapa) => void }
export function VisaoObra({ plantas, ...props }: Props) {
  const { legendas, carregando } = useLegendas(props.uid);
  const { dados: equipes } = useEquipes(props.uid, props.obra.id);
  const [equipe, setEquipe] = useState("");
  return <section className="work-overview" aria-label="Visão geral da obra"><h1>{props.obra.nome}</h1>
    <p>Execução por planta e serviço. Os totais representam unidades aplicáveis, sem média global entre serviços.</p>
    <label>Equipe responsável <select value={equipe} onChange={e => setEquipe(e.target.value)}><option value="">Todas as equipes</option>{equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
    {carregando ? <p>Carregando legendas…</p> : plantas.map(planta => <details key={planta.id} open={plantas.length === 1} className="overview-plant">
      <summary>{planta.nome} · ver serviços e pendências</summary>
      <ResumoSobDemanda {...props} planta={planta} legendas={legendas} equipes={equipes} equipe={equipe} />
    </details>)}
  </section>;
}
// As consultas existem apenas enquanto a seção da planta está aberta.
function ResumoSobDemanda(props: Omit<Props, "plantas"> & { planta: PlantaObra; legendas: StatusConfig[]; equipes: Equipe[]; equipe: string }) {
  const [aberto, setAberto] = useState(false);
  const [elemento, setElemento] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const details = elemento?.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    const atualizar = () => setAberto(details.open);
    atualizar(); details.addEventListener("toggle", atualizar);
    return () => details.removeEventListener("toggle", atualizar);
  }, [elemento]);
  return <div ref={setElemento}>{aberto && <ResumoComDefinicao {...props} />}</div>;
}
type ResumoProps = Parameters<typeof ResumoSobDemanda>[0];
function ResumoComDefinicao(props: ResumoProps) {
  const definicao = useDefinicao(props.uid, props.obra.id, props.planta);
  return definicao ? <ResumoServicos {...props} definicao={definicao} /> : <p>Definição indisponível. Confira a conexão ou o cadastro.</p>;
}
function ResumoServicos({ uid, obra, planta, estoque, legendas, definicao, onAbrir, equipes, equipe, disponibilidades }: ResumoProps & { definicao: PlantaDefinition }) {
  const controle = useControleSync();
  const [mapas, setMapas] = useState<MapaServico[] | null>(null), [tentativa, setTentativa] = useState(0);
  const kits = useKits(uid, obra.id, estoque, planta, definicao);
  useEffect(() => {
    const chave = `resumo:${obra.id}:${planta.id}`;
    controle.observar(chave, { fromCache: true, hasPendingWrites: false });
    const cancelar = observarMapas(uid, obra.id, (dados, metadata) => { setMapas(dados); controle.observar(chave, metadata); }, erro => {
      setMapas(null); controle.falharLeitura(chave, erro, () => setTentativa(v => v + 1));
    }, planta.id, definicao);
    return () => { cancelar(); controle.remover(chave); };
  }, [uid, obra.id, planta.id, definicao, controle, tentativa]);
  if (!mapas) return <p>Carregando serviços…</p>;
  return <div className="overview-services">{!mapas.length && <p>Nenhum serviço cadastrado nesta planta.</p>}{mapas.filter(m => !equipe || m.equipeId === equipe).map(mapa => {
    const unidades = unidadesDaPlanta(definicao).filter(u => mapa.tipo !== "kit" || mapa.kitUnidadeIds.includes(u.id));
    const resumo = calcularResumoExecucao(unidades, mapa.marcacoes, legendas);
    const kit = kits.kits.find(k => k.id === mapa.kitId);
    const materiais = kit ? calcularResumoMateriais(kit, resumo, disponibilidades?.(kit)) : null;
    const abrir = (filtro: StatusFilter) => onAbrir({ plantaId: planta.id, mapaId: mapa.id, filtro });
    return <article key={mapa.id} aria-label={`${planta.nome} · ${mapa.nome}`}><h3>{mapa.nome}</h3>
      {mapa.equipeId && <p>Equipe: {equipes.find(e => e.id === mapa.equipeId)?.nome ?? mapa.equipeId}</p>}
      <div className="overview-counts">
        <button onClick={() => abrir("categoria:concluido")}>{resumo.concluidas} / {resumo.total} concluídas</button>
        <button onClick={() => abrir("categoria:andamento")}>{resumo.andamento} em andamento</button>
        <button onClick={() => abrir("categoria:nao-iniciado")}>{resumo.naoIniciadas} pendentes</button>
        <button onClick={() => abrir("categoria:bloqueado")}>{resumo.bloqueadas} bloqueadas</button>
      <button onClick={() => abrir("restantes")}>{resumo.restantes} ainda não concluídas</button>
      </div>
      {materiais && <details><summary>Materiais e continuidade</summary><p>Estimativa teórica · disponibilidade com fonte identificada. SIENGE é a fonte oficial.</p>
        {kit && <p>Atualização: {new Date(kit.atualizadoEm).toLocaleString("pt-BR")}</p>}
        <ul>{materiais.materiais.map(m => <li key={m.materialId}>{m.descricao}: necessário {m.necessidadeRestante} {m.unidadeMedida}{m.disponibilidade !== null ? `; disponível (${m.fonte}) ${m.disponibilidade}; déficit ${m.deficit} ${m.unidadeMedida}` : "; disponibilidade desconhecida"}{m.atualizadoEm && m.disponibilidade !== null && <small> · atualizado em {new Date(m.atualizadoEm).toLocaleString("pt-BR")}</small>}</li>)}</ul>
        {materiais.capacidade !== null && <p>Capacidade: {materiais.capacidade} unidades. Déficit de capacidade: {materiais.deficitUnidades} unidades.</p>}
      </details>}
      <button className="button button--secondary" onClick={() => abrir("todos")}>Ver planta · {mapa.nome}</button>
    </article>;
  })}</div>;
}
