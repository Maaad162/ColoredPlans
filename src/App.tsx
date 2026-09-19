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
import { TOTAL_UNIDADES } from "./data/planta";
import { useAuth } from "./hooks/useAuth";
import { useLegendas } from "./hooks/useLegendas";
import { usePerfil } from "./hooks/usePerfil";
import { usePlanta } from "./hooks/usePlanta";
import {
  baixarMarcacoes,
  baixarCsvMapas,
  validarArquivoImportacao,
} from "./services/storage";
import type { Obra, PerfilUsuario } from "./types/planta";

export default function App({ obra }: { obra: Obra }) {
  const { usuario, carregando, entrar, sair } = useAuth();

  if (carregando) return <AuthLoading />;
  if (!usuario) return <AuthScreen onEntrar={entrar} />;

  return <ContaAutenticada key={`${usuario.uid}:${obra.id}`} usuario={usuario} obra={obra} onSair={sair} />;
}

interface ContaAutenticadaProps {
  usuario: User;
  obra: Obra;
  onSair: () => Promise<void>;
}

function ContaAutenticada({ usuario, obra, onSair }: ContaAutenticadaProps) {
  const perfilState = usePerfil(usuario.uid);
  if (perfilState.carregando) return <AuthLoading />;
  if (!perfilState.perfil) {
    return (
      <ContaPendente
        email={usuario.email ?? "Usuário autenticado"}
        erro={perfilState.erro}
        onSair={onSair}
      />
    );
  }
  return (
    <AplicacaoMapas
      usuario={usuario}
      key={`${usuario.uid}:${obra.id}:${perfilState.perfil.tipoConta}`}
      obra={obra}
      perfil={perfilState.perfil}
      onSair={onSair}
    />
  );
}

interface AplicacaoMapasProps extends ContaAutenticadaProps {
  perfil: PerfilUsuario;
}

function AplicacaoMapas({ usuario, obra, perfil, onSair }: AplicacaoMapasProps) {
  const legendasState = useLegendas(usuario.uid);
  const planta = usePlanta(
    usuario.uid,
    obra,
    legendasState.legendas,
    perfil.tipoConta === "estoque",
  );
  const [zoom, setZoom] = useState(0.8);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<"mapas" | "kits">("mapas");

  useEffect(() => {
    if (!mensagem) return;
    const timeout = window.setTimeout(() => setMensagem(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [mensagem]);

  if (legendasState.carregando || !planta.abaAtual) return <>
    <AuthLoading />
    <p role="status">{planta.estadoSalvamento}</p>
    {planta.erroSincronizacao && <p role="alert">{planta.erroSincronizacao}</p>}
  </>;

  async function importar(arquivo: File) {
    try {
      const texto = await arquivo.text();
      const conteudo: unknown = JSON.parse(texto);
      const novasMarcacoes = validarArquivoImportacao(
        conteudo,
        planta.unidades,
        planta.statuses,
      );
      const confirmado = window.confirm(
        `A importação substituirá as marcações da aba “${planta.abaAtual.nome}”. Deseja continuar?`,
      );
      if (!confirmado) return;
      planta.substituirMarcacoes(novasMarcacoes);
      setMensagem("Importação enviada para sincronização.");
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : "Arquivo inválido.";
      setMensagem(`Não foi possível importar: ${detalhe}`);
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
          <span
            role="status"
            className={`header-meta__live${
              planta.erroSincronizacao ? " header-meta__live--erro" : ""
            }`}
          >
            <i />
            {planta.estadoSalvamento}
          </span>
          <span className="header-meta__divider" />
          <span className={`account-badge account-badge--${perfil.tipoConta}`}>
            {perfil.tipoConta === "estoque" ? "Estoque" : "Apontamento"}
          </span>
          <span className="header-meta__divider" />
          <span>{TOTAL_UNIDADES} unidades</span>
          <span className="header-meta__divider" />
          <span className="header-user" title={usuario.email ?? "Usuário autenticado"}>
            {usuario.email}
          </span>
          <button className="header-logout" type="button" onClick={() => void onSair()}>
            Sair
          </button>
        </div>
      </header>

      <main className="app-main">
        {planta.erroSincronizacao && (
          <div className="sync-warning" role="alert">
            {planta.erroSincronizacao}
          </div>
        )}
        {legendasState.erro && (
          <div className="sync-warning" role="alert">{legendasState.erro}</div>
        )}

        <nav className="section-nav" aria-label="Áreas da aplicação">
          <div className="section-nav__tabs">
            <button type="button" className={secaoAtiva === "mapas" ? "section-nav__tab section-nav__tab--active" : "section-nav__tab"} onClick={() => setSecaoAtiva("mapas")}>Mapas e marcações</button>
            {perfil.tipoConta === "estoque" && (
              <button type="button" className={secaoAtiva === "kits" ? "section-nav__tab section-nav__tab--active" : "section-nav__tab"} onClick={() => setSecaoAtiva("kits")}>Central de Kits</button>
            )}
          </div>
          <GerenciarLegendas
            legendas={legendasState.legendas}
            usoPorLegenda={planta.usoPorLegenda}
            onCriar={legendasState.criar}
            onEditar={legendasState.editar}
            onExcluir={legendasState.excluir}
            onMensagem={setMensagem}
          />
        </nav>

        {secaoAtiva === "kits" && perfil.tipoConta === "estoque" ? (
          <CentralKits
            usuarioId={usuario.uid}
            obraId={obra.id}
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

        <BuscaUnidade unidades={planta.unidades} onSelecionar={planta.localizarUnidade} />
        <Toolbar
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
            );
            setMensagem(`Marcações de “${planta.abaAtual.nome}” exportadas.`);
          }}
          onImportar={importar}
          onLimparTudo={limparTudo}
        />

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
                <h2 id="planta-titulo">Planta do empreendimento</h2>
                {planta.abaAtual.tipo === "kit" && (
                  <p className="kit-map-summary">
                    <strong>{planta.abaAtual.kitUnidadeIds.length}</strong> unidade(s) receberam este Kit. O contorno verde indica a utilização.
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
              blocos={planta.blocos}
              marcacoes={planta.marcacoes}
              legendas={planta.statuses}
              selecionadaId={planta.unidadeSelecionada?.id ?? null}
              unidadeAtenuada={planta.unidadeAtenuada}
              onSelecionar={planta.selecionarUnidade}
              zoom={zoom}
              onZoomChange={setZoom}
              mapaKit={planta.abaAtual.tipo === "kit"}
              kitUnidadeIds={planta.abaAtual.kitUnidadeIds}
            />
          </section>

          <aside className="sidebar" aria-label="Informações da planta">
            <PainelUnidade
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
            />
            <Legenda
              legendas={planta.statuses}
              contagens={planta.contagens}
              total={TOTAL_UNIDADES}
            />
          </aside>
        </div>
        </>
        )}
      </main>

      {mensagem && (
        <div className="toast" role="status" aria-live="polite">
          {mensagem}
        </div>
      )}
    </div>
  );
}
