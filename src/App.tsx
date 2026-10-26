import { permissoes, podeAlterarMapa } from "./services/hierarquia";
import type { User } from "firebase/auth";
import { useEffect, useState } from "react";
import "./App.css";
import { AuthLoading, AuthScreen } from "./components/Auth/AuthScreen";
import { CentralKits } from "./components/CentralKits/CentralKits";
import { ContaPendente } from "./components/Conta/ContaPendente";
import { GerenciarLegendas } from "./components/GerenciarLegendas/GerenciarLegendas";
import { Legenda } from "./components/Legenda/Legenda";
import { MapTabs } from "./components/MapTabs/MapTabs";
import { PainelUnidade } from "./components/PainelUnidade/PainelUnidade";
import { Planta } from "./components/Planta/Planta";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { BuscaUnidade } from "./components/BuscaUnidade/BuscaUnidade";
import { idsDaPlanta } from "./services/geometria";
import { NavegacaoObra, type DestinoMapa } from "./components/NavegacaoObra";
import type { PlantaObra, PlantaDefinition } from "./types/planta";
import { useAuth } from "./hooks/useAuth";
import { useLegendas } from "./hooks/useLegendas";
import { usePerfil } from "./hooks/usePerfil";
import { usePlanta } from "./hooks/usePlanta";
import { useEquipes } from "./hooks/useHierarquia";
import { useKits } from "./hooks/useKits";
import { useContextoUnidade, useContextosMapa } from "./hooks/useContextoUnidade";
import { ProvedorSincronizacao } from "./hooks/useSincronizacao";
import { registrarErro, traduzirErro } from "./services/erros";
import { Historico } from "./components/Historico";
import { calcularResumoExecucao, calcularResumoMateriais } from "./services/operacao";
import {
  baixarMarcacoes,
  baixarCsvMapas,
  validarArquivoImportacao,
} from "./services/storage";
import type { Obra, PerfilUsuario } from "./types/planta";

export default function App() {
  const { usuario, carregando, entrar, sair, erro } = useAuth();

  if (carregando) return <AuthLoading />;
  if (!usuario) return <AuthScreen onEntrar={entrar} erroInicial={erro} />;

  return <ContaAutenticada key={usuario.uid} usuario={usuario} onSair={sair} />;
}

interface ContaAutenticadaProps {
  usuario: User;
  onSair: () => Promise<void>;
}

function ContaAutenticada({ usuario, onSair }: ContaAutenticadaProps) {
  const perfilState = usePerfil(usuario.uid);
  if (perfilState.carregando) return <AuthLoading />;
  if (!perfilState.perfil) {
    return (
      <ContaPendente
        email={usuario.email ?? "Usuário autenticado"}
        erro={perfilState.erro}
        onTentar={perfilState.tentarNovamente}
        onSair={onSair}
      />
    );
  }
  return (
    <ProvedorSincronizacao key={`${usuario.uid}:${JSON.stringify(perfilState.perfil)}`}>
      <NavegacaoObra onSair={onSair} usuarioId={usuario.uid} uid={perfilState.perfil.hierarquia?.espacoId ?? usuario.uid} hierarquia={perfilState.perfil.hierarquia} estoque={!!perfilState.perfil.hierarquia || perfilState.perfil.tipoConta === "estoque"}
        renderizar={(obra, instancia, definicao, destino) => perfilState.perfil && <AplicacaoMapas
          key={`${obra.id}:${instancia.id}`} usuario={usuario} obra={obra} instancia={instancia}
          definicao={definicao} destino={destino} perfil={perfilState.perfil} onSair={onSair} />} />
    </ProvedorSincronizacao>
  );
}

interface AplicacaoMapasProps extends ContaAutenticadaProps {
  obra: Obra; instancia: PlantaObra; definicao: PlantaDefinition; destino: DestinoMapa | null;
  perfil: PerfilUsuario;
}

function AplicacaoMapas({ usuario, obra, instancia, definicao, destino, perfil }: AplicacaoMapasProps) {
  const dadosUid = perfil.hierarquia?.espacoId ?? usuario.uid;
  const acesso = permissoes(perfil.hierarquia, perfil.tipoConta);
  const legendasState = useLegendas(dadosUid);
  const { dados: equipes } = useEquipes(dadosUid, obra.id);
  const kitsState = useKits(dadosUid, obra.id, !!perfil.hierarquia || perfil.tipoConta === "estoque", instancia, definicao, !!perfil.hierarquia);
  const planta = usePlanta(
    dadosUid,
    obra,
    legendasState.legendas, instancia, definicao,
    perfil.tipoConta === "estoque",
    acesso.gerenciar,
  );
  const [zoom, setZoom] = useState(0.8);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<"mapas" | "kits">("mapas");
  const [historico, setHistorico] = useState<{ mapaId?: string; unidadeId?: string } | null>(null);
  const [responsavelFiltro, setResponsavelFiltro] = useState("todos");
  const contextosMapa = useContextosMapa(dadosUid, obra.id, planta.abaAtual);
  const contextoState = useContextoUnidade(dadosUid, obra.id, planta.abaAtual, planta.unidadeSelecionada?.id,
    contextosMapa.find(item => item.unidadeId === planta.unidadeSelecionada?.id), idsDaPlanta(definicao));

  const [destinoAplicado, setDestinoAplicado] = useState(false);
  useEffect(() => {
    if (destino && !destinoAplicado && planta.abas.some(m => m.id === destino.mapaId)) {
      planta.selecionarAba(destino.mapaId); planta.setStatusFiltro(destino.filtro); setDestinoAplicado(true);
    }
  }, [destino, destinoAplicado, planta]);

  useEffect(() => {
    if (!mensagem) return;
    const timeout = window.setTimeout(() => setMensagem(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [mensagem]);

  useEffect(() => {
    setResponsavelFiltro("todos");
  }, [planta.abaAtual?.id]);

  if (legendasState.carregando || !planta.abaAtual) return <>
    {acesso.gerenciar || legendasState.carregando ? <AuthLoading /> : <p>Nenhum mapa disponível nesta planta. Solicite o cadastro ao Engenheiro responsável.</p>}


  </>;
  const unidadesAplicaveis = planta.abaAtual.tipo === "kit"
    ? planta.unidades.filter(unidade => planta.abaAtual.kitUnidadeIds.includes(unidade.id)) : planta.unidades;
  const resumoExecucao = calcularResumoExecucao(unidadesAplicaveis, planta.marcacoes, planta.statuses);
  const kitAtivo = kitsState.kits.find(kit => kit.id === planta.abaAtual.kitId);
  const podeEditarMapa = (mapa: typeof planta.abaAtual | undefined) => podeAlterarMapa(perfil.hierarquia, usuario.uid, mapa);
  const gerenciarMapaAtual = acesso.gerenciar && podeEditarMapa(planta.abaAtual);
  const resumoMateriais = kitAtivo ? calcularResumoMateriais(kitAtivo, resumoExecucao) : null;
  const totalAreas = definicao.areasComuns?.length ?? 0;
  const totalMoradias = definicao.blocos.reduce((total, bloco) => total + bloco.unidades.length, 0);

  async function importar(arquivo: File) {
    try {
      const texto = await arquivo.text();
      const conteudo: unknown = JSON.parse(texto);
      const novasMarcacoes = validarArquivoImportacao(
        conteudo,
        planta.unidades,
        planta.statuses,
        { obra, planta: instancia, mapaId: planta.abaAtual.id, definicao, kit: kitAtivo },
      );
      const confirmado = window.confirm(
        `A importação substituirá as marcações da aba “${planta.abaAtual.nome}”. Deseja continuar?`,
      );
      if (!confirmado) return;
      planta.substituirMarcacoes(novasMarcacoes);
      setMensagem("Importação enviada para sincronização.");
    } catch (erro) {
      registrarErro("importação", erro);
      setMensagem(traduzirErro(erro).mensagem);
    }
  }

  function limparTudo() {
    const confirmado = window.confirm(
      `Tem certeza que deseja remover todas as marcações da aba “${planta.abaAtual.nome}”?`,
    );
    if (!confirmado) return;
    planta.limparTudo();
    setMensagem("Remoção enviada para sincronização.");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <p className="brand__overline">Acompanhamento da obra</p>
            <h1>Mapa de unidades</h1>
          </div>
        </div>
        <div className="header-meta">

          <span className="header-meta__divider" />
          <span className={`account-badge account-badge--${perfil.tipoConta}`}>
            {perfil.tipoConta === "estoque" ? "Estoque" : "Apontamento"}
          </span>
          <span className="header-meta__divider" />
          <span>{totalAreas ? `${totalMoradias} moradias + ${totalAreas} áreas comuns` : `${planta.unidades.length} unidades`}</span>
          <span className="header-meta__divider" />
          <span className="header-user" title={usuario.email ?? "Usuário autenticado"}>
            {usuario.email}
          </span>

        </div>
      </header>

      <main className="app-main">


        <nav className="section-nav" aria-label="Áreas da aplicação">
          <div className="section-nav__tabs">
            <button className="section-nav__tab" type="button" onClick={() => setHistorico({})}>Histórico da obra</button>
            <button type="button" className={secaoAtiva === "mapas" ? "section-nav__tab section-nav__tab--active" : "section-nav__tab"} onClick={() => setSecaoAtiva("mapas")}>Mapas e marcações</button>
            {acesso.kits && (
              <button type="button" className={secaoAtiva === "kits" ? "section-nav__tab section-nav__tab--active" : "section-nav__tab"} onClick={() => setSecaoAtiva("kits")}>Central de Kits</button>
            )}
          </div>
          {(!perfil.hierarquia || acesso.administrar) && <GerenciarLegendas
            legendas={legendasState.legendas}
            usoPorLegenda={planta.usoPorLegenda}
            onCriar={legendasState.criar}
            onEditar={legendasState.editar}
            onExcluir={legendasState.excluir}
            onMensagem={setMensagem}
          />}
        </nav>

        {secaoAtiva === "kits" && acesso.kits ? (
          <CentralKits
            podeEditarKit={kit => podeEditarMapa(planta.abas.find(mapa => mapa.id === kit.mapaId))}
            definicao={definicao}
            kitsState={kitsState}
            onMensagem={setMensagem}
            onAbrirMapa={(mapaId) => {
              planta.selecionarAba(mapaId);
              setSecaoAtiva("mapas");
              setMensagem("Mapa associado ao Kit aberto.");
            }}
          />
        ) : (
        <>
        <MapTabs
          podeGerenciar={acesso.gerenciar}
          podeEditarMapa={podeEditarMapa}
          abas={planta.abas}
          abaAtivaId={planta.abaAtual.id}
          onSelecionar={planta.selecionarAba}
          onRenomear={planta.renomearAba}
          onExcluir={(id, nome) => {
            if (planta.excluirAba(id)) setMensagem(`Exclusão de “${nome}” enviada para sincronização.`);
          }}
          onCriar={(nome) => {
            const criada = planta.criarAba(nome);
            if (criada) setMensagem(`Criação de “${nome.trim()}” enviada para sincronização.`);
            return criada;
          }}
        />

        <label className="context-nav">Equipe do serviço <select disabled={!gerenciarMapaAtual || (!!perfil.hierarquia && planta.abaAtual.tipo === "kit")} aria-label="Equipe do serviço" value={planta.abaAtual.equipeId ?? ""} onChange={e => planta.definirEquipe(e.target.value)}><option value="">Não atribuída</option>{equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <BuscaUnidade unidades={planta.unidades} onSelecionar={planta.localizarUnidade} />
        <button className="link-button" type="button" onClick={() => setHistorico({ mapaId: planta.abaAtual.id })}>Histórico deste mapa</button>
        <Toolbar
          temAreasComuns={totalAreas > 0}
          podeApontar={acesso.apontar}
          blocos={planta.blocos}
          legendas={planta.statuses}
          nomeMapaAtivo={planta.abaAtual.nome}
          blocoFiltro={planta.blocoFiltro}
          statusFiltro={planta.statusFiltro}
          statusPincel={planta.statusPincel}
          zoom={zoom}
          onBlocoFiltro={planta.setBlocoFiltro}
          onStatusFiltro={planta.setStatusFiltro}
          onStatusPincel={planta.setStatusPincel}
          onZoom={setZoom}
          onExportarCsv={() => baixarCsvMapas(planta.abas, planta.unidades, planta.statuses)}
          onExportar={() => {
            baixarMarcacoes(
              planta.unidades,
              planta.marcacoes,
              planta.abaAtual.nome,
              { obra, planta: instancia, mapaId: planta.abaAtual.id, definicao, kit: kitAtivo },
            );
            setMensagem(`Marcações de “${planta.abaAtual.nome}” exportadas.`);
          }}
          onImportar={importar}
          onLimparTudo={limparTudo}
          responsaveis={[...new Set(contextosMapa.map(item => item.responsavel).filter(Boolean))].sort()}
          responsavelFiltro={responsavelFiltro}
          onResponsavelFiltro={setResponsavelFiltro}
          onLimparFiltros={() => { planta.setBlocoFiltro("todos"); planta.setStatusFiltro("todos"); setResponsavelFiltro("todos"); }}
        />

        <section className="operation-summary" aria-label="Resumo operacional do mapa">
          <div><span>Concluídas</span><strong>{resumoExecucao.concluidas} / {resumoExecucao.total}</strong></div>
          <div><span>Em andamento</span><strong>{resumoExecucao.andamento}</strong></div>
          <div><span>Bloqueadas</span><strong>{resumoExecucao.bloqueadas}</strong></div>
          <div><span>Ainda não concluídas</span><strong>{resumoExecucao.restantes}</strong></div>
          {totalAreas > 0 && <div><span>Escopo operacional deste mapa</span>
            <strong>{unidadesAplicaveis.filter(u => u.tipo !== "area-comum").length} moradias + {unidadesAplicaveis.filter(u => u.tipo === "area-comum").length} áreas comuns</strong>
          </div>}
          {resumoMateriais && <details className="materials-summary"><summary>Ver materiais necessários para concluir</summary>
            <p>Valores teóricos do Kit; não representam baixa ou saldo oficial do SIENGE.</p>
            {kitAtivo?.materiais.some(item => item.disponibilidadeManual !== null) && <p>Disponibilidade informada manualmente · atualização do Kit: {new Date(kitAtivo.atualizadoEm).toLocaleString("pt-BR")}{kitAtivo.atualizadoPor ? ` · por ${kitAtivo.atualizadoPor}` : ""}</p>}
            <ul>{resumoMateriais.materiais.map(material => <li key={material.materialId}><strong>{material.descricao}</strong>: necessário {material.necessidadeRestante.toLocaleString("pt-BR")} {material.unidadeMedida}; consumo estimado {material.consumoEstimado.toLocaleString("pt-BR")} {material.unidadeMedida}
              {material.disponibilidade === null ? "; disponibilidade não informada" : `; disponível manualmente ${material.disponibilidade.toLocaleString("pt-BR")} ${material.unidadeMedida}${material.deficit ? `; déficit ${material.deficit.toLocaleString("pt-BR")} ${material.unidadeMedida}` : "; suficiente"}`}</li>)}</ul>
            {resumoMateriais.capacidade === null ? <p>Não foi possível verificar a capacidade: há disponibilidade desconhecida.</p>
              : resumoMateriais.capacidade >= resumoExecucao.restantes ? <p>Material informado suficiente para concluir as {resumoExecucao.restantes} unidades restantes.</p>
              : <p>Disponibilidade informada permite executar {resumoMateriais.capacidade} das {resumoExecucao.restantes} unidades restantes. Déficit de capacidade: {resumoMateriais.deficitUnidades} unidade(s). Limitante: {resumoMateriais.materiais.find(item => item.materialId === resumoMateriais.materialLimitanteId)?.descricao}.</p>}
          </details>}
        </section>

        <div
          className="workspace"
          id="mapa-tab-panel"
          role="tabpanel"
          aria-labelledby={`tab-${planta.abaAtual.id}`}
        >
          <section className="map-column" aria-labelledby="planta-titulo">
            <div className="map-heading">
              <div>
                <p className="eyebrow">{planta.abaAtual.tipo === "kit" ? "Mapa de Kit" : "Serviço"} · {planta.abaAtual.nome}</p>
                <h2 id="planta-titulo">{instancia.nome}</h2>
                {planta.abaAtual.tipo === "kit" && (
                  <p className="kit-map-summary">
                    <strong>{planta.abaAtual.kitUnidadeIds.length}</strong> unidade(s) aplicáveis a este serviço. O preenchimento verde indica a aplicabilidade quando n?o h? marca??o.
                  </p>
                )}
              </div>
              <p className="map-hint">
                {planta.statusPincel === "sem-marcacao"
                  ? "Remoção rápida ativa — clique nas unidades para limpar."
                  : planta.statusPincel
                  ? "Pintura rápida ativa — clique nas unidades para aplicar."
                  : "Clique em uma unidade para ver os detalhes."}
              </p>
            </div>
            <Planta
              definicao={definicao}
              blocos={planta.blocos}
              marcacoes={planta.marcacoes}
              legendas={planta.statuses}
              selecionadaId={planta.unidadeSelecionada?.id ?? null}
              unidadeAtenuada={(id) => planta.unidadeAtenuada(id) || (responsavelFiltro !== "todos" && contextosMapa.find(item => item.unidadeId === id)?.responsavel !== responsavelFiltro)}
              onSelecionar={planta.selecionarUnidade}
              zoom={zoom}
              onZoomChange={setZoom}
              mapaKit={planta.abaAtual.tipo === "kit"}
              kitUnidadeIds={planta.abaAtual.kitUnidadeIds}
            />
          </section>

          <aside className="sidebar" aria-label="Informações da planta">
            <PainelUnidade
              podeApontar={acesso.apontar}
              key={`${planta.abaAtual.id}:${planta.unidadeSelecionada?.id ?? "sem-selecao"}`}
              onHistorico={() => setHistorico({ mapaId: planta.abaAtual.id, unidadeId: planta.unidadeSelecionada?.id })}
              unidade={planta.unidadeSelecionada}
              legendas={planta.statuses}
              statusId={
                planta.unidadeSelecionada
                  ? planta.marcacoes[planta.unidadeSelecionada.id] ?? null
                  : null
              }
              onDefinirStatus={(status) => {
                if (planta.unidadeSelecionada) {
                  planta.definirStatus(planta.unidadeSelecionada.id, status);
                }
              }}
              contexto={contextoState.contexto}
              onSalvarContexto={contextoState.salvar}
            />
            <Legenda
              legendas={planta.statuses}
              contagens={planta.contagens}
              total={planta.unidades.length}
            />
          </aside>
        </div>
        </>
        )}
      </main>

      {historico && <Historico atorId={usuario.uid} usuarioId={dadosUid} obraId={obra.id} legendas={planta.statuses} {...historico} onFechar={() => setHistorico(null)} />}
      {mensagem && (
        <div className="toast" role="status" aria-live="polite">
          {mensagem}
        </div>
      )}
    </div>
  );
}
