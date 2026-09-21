import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useControleSync } from "./useSincronizacao";
import { gravarComHistorico } from "../services/historico";
import { ErroOperacional } from "../services/erros";
import { idsDaPlanta, unidadesDaPlanta } from "../services/geometria";
import type { PlantaDefinition, PlantaObra } from "../types/planta";
import {
  atualizarStatusRemoto,
  criarMapaRemoto,
  excluirMapaRemoto,
  observarMapas,
  renomearMapaRemoto,
  substituirMarcacoesRemotas,
} from "../services/firestore";
import { carregarAbaAtiva, salvarAbaAtiva } from "../services/storage";
import { migrarObra } from "../services/migracoes";
import { garantirMapaInicial } from "../services/inicializarMapa";
import { db } from "../config/firebase";
import { CURRENT_SCHEMA_VERSION } from "../config/dados";
import type {
  CategoriaExecucao,
  EstadoMapas,
  FerramentaPintura,
  Marcacoes,
  StatusFilter,
  StatusConfig,
  StatusId,
  Obra,
} from "../types/planta";

const CATEGORIAS_EXECUCAO: CategoriaExecucao[] = [
  "nao-iniciado",
  "andamento",
  "concluido",
  "bloqueado",
  "outro",
];

function filtroCategoriaValido(filtro: StatusFilter) {
  if (!filtro.startsWith("categoria:")) return false;
  const categoria = filtro.slice("categoria:".length);
  return CATEGORIAS_EXECUCAO.some(item => item === categoria);
}

export function usePlanta(
  usuarioId: string,
  obra: Obra,
  legendas: StatusConfig[],
  instancia: PlantaObra,
  definicao: PlantaDefinition,
  habilitarKits = false,
) {
  const controle = useControleSync();
  const UNIDADES = useMemo(() => unidadesDaPlanta(definicao), [definicao]);
  const UNIDADE_BY_ID = useMemo(() => Object.fromEntries(UNIDADES.map(u => [u.id, u])), [UNIDADES]);
  const unidadeIds = useMemo(() => idsDaPlanta(definicao), [definicao]);
  const [tentativa, setTentativa] = useState(0);
  const mapasAtuais = useRef<EstadoMapas["abas"]>([]);
  const [estadoMapas, setEstadoMapas] = useState<EstadoMapas>(() => ({
    abaAtivaId: carregarAbaAtiva(usuarioId, `${obra.id}:${instancia.id}`) ?? carregarAbaAtiva(usuarioId, obra.id) ?? "",
    abas: [],
  }));
  const mapaInicialEmCriacao = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [unidadeSelecionadaId, setUnidadeSelecionadaId] = useState<string | null>(
    null,
  );
  const [statusPincel, setStatusPincel] =
    useState<FerramentaPintura | null>(null);
  const [blocoFiltro, setBlocoFiltro] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFilter>("todos");

  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  const gravar = useCallback((operacao: () => Promise<void>, rotulo = "Alteração no mapa") => {
    controle.enfileirar(`mapas:${crypto.randomUUID()}`, operacao, `${obra.nome} / ${instancia.nome} / ${rotulo}`);
  }, [controle, obra.nome, instancia.nome]);
  const registrarErro = useCallback((erro: unknown) => {
    controle.falharLeitura("mapas", erro, () => setTentativa(v => v + 1));
  }, [controle]);

  useEffect(() => {
    if (
      statusFiltro !== "todos" &&
      statusFiltro !== "sem-marcacao" && statusFiltro !== "restantes" &&
      !filtroCategoriaValido(statusFiltro) &&
      !legendas.some((legenda) => legenda.id === statusFiltro)
    ) {
      setStatusFiltro("todos");
    }
    if (
      statusPincel &&
      statusPincel !== "sem-marcacao" &&
      !legendas.some((legenda) => legenda.id === statusPincel)
    ) {
      setStatusPincel(null);
    }
  }, [legendas, statusFiltro, statusPincel]);

  useEffect(() => {
    if (estadoMapas.abaAtivaId) {
      salvarAbaAtiva(usuarioId, `${obra.id}:${instancia.id}`, estadoMapas.abaAtivaId);
    }
  }, [estadoMapas.abaAtivaId, usuarioId, obra.id, instancia.id]);

  useEffect(() => {
    let ativo = true;
    let cancelarObservacao: (() => void) | undefined;
    controle.observar("mapas", { fromCache: true, hasPendingWrites: false });

    function iniciarObservacao(criarInicial: boolean) {
      if (!ativo) return;
      cancelarObservacao?.();
      cancelarObservacao = observarMapas(
        usuarioId,
        obra.id,
        (mapasRemotos, metadata) => {
          if (!ativo) return;
          controle.observar("mapas", metadata);
          mapasAtuais.current = mapasRemotos;
          if (mapasRemotos.length === 0) {
            setEstadoMapas({ abaAtivaId: "", abas: [] });
            if (!criarInicial || metadata.fromCache || metadata.hasPendingWrites) return;
            if (!mapaInicialEmCriacao.current) {
              mapaInicialEmCriacao.current = true;
              gravar(() => garantirMapaInicial(db, usuarioId, obra.id, instancia.id).catch((erro) => {
                mapaInicialEmCriacao.current = false;
                throw erro;
              }));
            }
            return;
          }

          mapaInicialEmCriacao.current = false;
          setEstadoMapas((estadoAtual) => ({
            abaAtivaId: mapasRemotos.some(
              (mapa) => mapa.id === estadoAtual.abaAtivaId,
            )
              ? estadoAtual.abaAtivaId
              : mapasRemotos[0].id,
            abas: mapasRemotos,
          }));
        },
        registrarErro, instancia.id, definicao,
      );
    }

    // O cache permanece acessível mesmo se uma migração aguardar a conexão.
    iniciarObservacao(false);
    if (obra.schemaVersion === CURRENT_SCHEMA_VERSION) {
      iniciarObservacao(true);
    } else if (online) {
      controle.observar("preparacao", { fromCache: true, hasPendingWrites: false });
      void migrarObra(db, usuarioId, obra, habilitarKits)
        .then(() => { if (ativo) { controle.remover("preparacao"); iniciarObservacao(true); } })
        .catch((erro: unknown) => {
          if (ativo) controle.falharLeitura("preparacao", erro, () => setTentativa(v => v + 1));
        });
    }

    return () => {
      ativo = false;
      cancelarObservacao?.();
      controle.remover("mapas"); controle.remover("preparacao");
    };
  }, [habilitarKits, usuarioId, obra, online, gravar, registrarErro, controle, tentativa, instancia.id, definicao]);


  const abaAtual =
    estadoMapas.abas.find((aba) => aba.id === estadoMapas.abaAtivaId) ??
    estadoMapas.abas[0];
  const marcacoes = useMemo(() => abaAtual?.marcacoes ?? {}, [abaAtual?.marcacoes]);

  const unidadeSelecionada = unidadeSelecionadaId
    ? UNIDADE_BY_ID[unidadeSelecionadaId]
    : null;

  const contagens = useMemo(() => {
    const resultado: Record<string, number> = { "sem-marcacao": 0 };
    for (const legenda of legendas) resultado[legenda.id] = 0;

    for (const unidade of UNIDADES) {
      const status = marcacoes[unidade.id];
      if (status) resultado[status] = (resultado[status] ?? 0) + 1;
      else resultado["sem-marcacao"] += 1;
    }
    return resultado;
  }, [legendas, marcacoes, UNIDADES]);

  const usoPorLegenda = useMemo(() => {
    const resultado: Record<string, number> = {};
    for (const mapa of estadoMapas.abas) {
      for (const status of Object.values(mapa.marcacoes)) {
        if (status) resultado[status] = (resultado[status] ?? 0) + 1;
      }
    }
    return resultado;
  }, [estadoMapas.abas]);

  function obterMapa(id: string) {
    const mapa = mapasAtuais.current.find(m => m.id === id);
    if (!mapa) throw new ErroOperacional("ausente", "Este mapa não existe mais. Selecione outro mapa.");
    return mapa;
  }
  function selecionarUnidade(id: string) {
    setUnidadeSelecionadaId(id);
    const ferramenta = statusPincel;
    if (ferramenta && abaAtual) {
      gravar(() => atualizarStatusRemoto(
        obterMapa(abaAtual.id),
        id,
        ferramenta === "sem-marcacao" ? null : ferramenta,
        usuarioId,
        obra.id, unidadeIds,
      ), `Unidade ${id} · ${abaAtual.nome}`);
    }
  }

  function definirStatus(id: string, status: StatusId | null) {
    if (!abaAtual || !UNIDADE_BY_ID[id] || (status && !legendas.some(l => l.id === status))) return;
    gravar(() => atualizarStatusRemoto(obterMapa(abaAtual.id), id, status, usuarioId, obra.id, unidadeIds), `Unidade ${id} · ${abaAtual.nome}`);
  }

  function limparTudo() {
    if (!abaAtual) return;
    gravar(() => substituirMarcacoesRemotas(obterMapa(abaAtual.id), {}, usuarioId, obra.id, unidadeIds), `Limpeza · ${abaAtual.nome}`);
  }

  function substituirMarcacoes(novas: Marcacoes) {
    if (!abaAtual) return;
    gravar(() => substituirMarcacoesRemotas(obterMapa(abaAtual.id), novas, usuarioId, obra.id, unidadeIds), `Importação · ${abaAtual.nome}`);
    setUnidadeSelecionadaId(null);
  }

  function selecionarAba(id: string) {
    if (!estadoMapas.abas.some((aba) => aba.id === id)) return;
    setEstadoMapas((estadoAtual) => ({ ...estadoAtual, abaAtivaId: id }));
    setUnidadeSelecionadaId(null);
  }

  function criarAba(nome: string) {
    const nomeNormalizado = nome.trim().slice(0, 48);
    if (!nomeNormalizado) return false;
    if (
      estadoMapas.abas.some(
        (aba) => aba.nome.toLocaleLowerCase("pt-BR") === nomeNormalizado.toLocaleLowerCase("pt-BR"),
      )
    ) {
      return false;
    }

    const id = `mapa-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const novaAba = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      obraId: obra.id, plantaId: instancia.id,
      id,
      nome: nomeNormalizado,
      userId: usuarioId,
      tipo: "manual" as const,
      kitUnidadeIds: [],
      marcacoes: {},
      criadoEm: new Date().toISOString(),
    };
    setEstadoMapas((estadoAtual) => ({
      ...estadoAtual,
      abaAtivaId: id,
    }));
    gravar(() => criarMapaRemoto(novaAba, usuarioId, obra.id));
    setUnidadeSelecionadaId(null);
    return true;
  }

  function excluirAba(id: string) {
    const mapa = estadoMapas.abas.find((aba) => aba.id === id);
    if (!mapa || mapa.tipo === "kit" || estadoMapas.abas.length <= 1) return false;
    gravar(() => excluirMapaRemoto(obterMapa(id), usuarioId, obra.id));
    setUnidadeSelecionadaId(null);
    return true;
  }

  function renomearAba(id: string, nome: string) {
    const mapa = estadoMapas.abas.find((aba) => aba.id === id);
    const normalizado = nome.trim().slice(0, 48);
    if (!mapa || mapa.tipo === "kit" || !normalizado) return false;
    if (estadoMapas.abas.some((aba) => aba.id !== id
      && aba.nome.toLocaleLowerCase("pt-BR") === normalizado.toLocaleLowerCase("pt-BR"))) return false;
    gravar(() => renomearMapaRemoto(obterMapa(id), normalizado, usuarioId, obra.id));
    return true;
  }

  function localizarUnidade(id: string) {
    if (!UNIDADE_BY_ID[id]) return;
    setBlocoFiltro("todos");
    setStatusFiltro("todos");
    setUnidadeSelecionadaId(id);
  }

  function unidadeAtenuada(id: string) {
    const unidade = UNIDADE_BY_ID[id];
    const status = marcacoes[id] ?? null;
    const blocoNaoCorresponde =
      blocoFiltro !== "todos" && unidade.bloco !== blocoFiltro;
    const statusNaoCorresponde =
      statusFiltro !== "todos" &&
      (statusFiltro === "restantes" ? (status ? legendas.find(item => item.id === status)?.categoria : null) === "concluido"
        : statusFiltro === "sem-marcacao"
        ? status !== null
        : statusFiltro.startsWith("categoria:")
          ? (status ? legendas.find(item => item.id === status)?.categoria ?? "outro" : "nao-iniciado") !== statusFiltro.slice(10)
          : status !== statusFiltro);
    return (abaAtual?.tipo === "kit" && !abaAtual.kitUnidadeIds.includes(id)) || blocoNaoCorresponde || statusNaoCorresponde;
  }

  return {
    blocos: definicao.blocos,
    unidades: UNIDADES,
    statuses: legendas,
    definirEquipe: (equipeId: string) => { if (abaAtual) gravar(() => gravarComHistorico(db, usuarioId, obra.id, { acao: "equipe", mapa: obterMapa(abaAtual.id), equipeId }), `Equipe · ${abaAtual.nome}`); },
    abas: estadoMapas.abas,
    abaAtual,
    marcacoes,
    unidadeSelecionada,
    statusPincel,
    blocoFiltro,
    statusFiltro,
    contagens,
    usoPorLegenda,
    localizarUnidade,
    renomearAba,
    selecionarUnidade,
    definirStatus,
    setStatusPincel,
    setBlocoFiltro,
    setStatusFiltro,
    limparTudo,
    substituirMarcacoes,
    selecionarAba,
    criarAba,
    excluirAba,
    unidadeAtenuada,
  };
}
