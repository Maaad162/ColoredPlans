import type { User } from "firebase/auth";
import { useEffect, useState } from "react";
import "./App.css";
import { AuthLoading, AuthScreen } from "./components/Auth/AuthScreen";
import { Legenda } from "./components/Legenda/Legenda";
import { MapTabs } from "./components/MapTabs/MapTabs";
import { PainelUnidade } from "./components/PainelUnidade/PainelUnidade";
import { Planta } from "./components/Planta/Planta";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { TOTAL_UNIDADES } from "./data/planta";
import { useAuth } from "./hooks/useAuth";
import { usePlanta } from "./hooks/usePlanta";
import {
  baixarMarcacoes,
  validarArquivoImportacao,
} from "./services/storage";

export default function App() {
  const { usuario, carregando, entrar, sair } = useAuth();

  if (carregando) return <AuthLoading />;
  if (!usuario) return <AuthScreen onEntrar={entrar} />;

  return <AplicacaoMapas key={usuario.uid} usuario={usuario} onSair={sair} />;
}

interface AplicacaoMapasProps {
  usuario: User;
  onSair: () => Promise<void>;
}

function AplicacaoMapas({ usuario, onSair }: AplicacaoMapasProps) {
  const planta = usePlanta(usuario.uid);
  const [zoom, setZoom] = useState(0.8);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const timeout = window.setTimeout(() => setMensagem(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [mensagem]);

  if (!planta.abaAtual) return <AuthLoading />;

  async function importar(arquivo: File) {
    try {
      const texto = await arquivo.text();
      const conteudo: unknown = JSON.parse(texto);
      const novasMarcacoes = validarArquivoImportacao(conteudo, planta.unidades);
      const confirmado = window.confirm(
        `A importação substituirá as marcações da aba “${planta.abaAtual.nome}”. Deseja continuar?`,
      );
      if (!confirmado) return;
      planta.substituirMarcacoes(novasMarcacoes);
      setMensagem("Marcações importadas com sucesso.");
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
    setMensagem(`Marcações de “${planta.abaAtual.nome}” removidas.`);
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
            className={`header-meta__live${
              planta.erroSincronizacao ? " header-meta__live--erro" : ""
            }`}
          >
            <i />
            {planta.erroSincronizacao
              ? "Sem sincronização"
              : planta.sincronizando
                ? "Sincronizando…"
                : "Sincronizado"}
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
        <MapTabs
          abas={planta.abas}
          abaAtivaId={planta.abaAtual.id}
          onSelecionar={planta.selecionarAba}
          onExcluir={(id, nome) => {
            planta.excluirAba(id);
            setMensagem(`Aba “${nome}” apagada.`);
          }}
          onCriar={(nome) => {
            const criada = planta.criarAba(nome);
            if (criada) setMensagem(`Aba “${nome.trim()}” criada.`);
            return criada;
          }}
        />

        <Toolbar
          blocos={planta.blocos}
          nomeMapaAtivo={planta.abaAtual.nome}
          blocoFiltro={planta.blocoFiltro}
          statusFiltro={planta.statusFiltro}
          statusPincel={planta.statusPincel}
          zoom={zoom}
          onBlocoFiltro={planta.setBlocoFiltro}
          onStatusFiltro={planta.setStatusFiltro}
          onStatusPincel={planta.setStatusPincel}
          onZoom={setZoom}
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
                <p className="eyebrow">Serviço · {planta.abaAtual.nome}</p>
                <h2 id="planta-titulo">Planta do empreendimento</h2>
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
              selecionadaId={planta.unidadeSelecionada?.id ?? null}
              unidadeAtenuada={planta.unidadeAtenuada}
              onSelecionar={planta.selecionarUnidade}
              zoom={zoom}
              onZoomChange={setZoom}
            />
          </section>

          <aside className="sidebar" aria-label="Informações da planta">
            <PainelUnidade
              unidade={planta.unidadeSelecionada}
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
            <Legenda contagens={planta.contagens} total={TOTAL_UNIDADES} />
          </aside>
        </div>
      </main>

      {mensagem && (
        <div className="toast" role="status" aria-live="polite">
          {mensagem}
        </div>
      )}
    </div>
  );
}
