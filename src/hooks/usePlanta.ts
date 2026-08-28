import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCOS, UNIDADES, UNIDADE_BY_ID } from "../data/planta";
import {
  atualizarStatusRemoto,
  criarMapaRemoto,
  excluirMapaRemoto,
  migrarMapasLegados,
  observarMapas,
  substituirMarcacoesRemotas,
} from "../services/firestore";
import { carregarAbaAtiva, salvarAbaAtiva } from "../services/storage";
import { migrarKitsEMapas } from "../services/kits";
import type {
  EstadoMapas,
  FerramentaPintura,
  Marcacoes,
  StatusFilter,
  StatusConfig,
  StatusId,
} from "../types/planta";

export function usePlanta(
  usuarioId: string,
  legendas: StatusConfig[],
  habilitarKits = false,
) {
  const [estadoMapas, setEstadoMapas] = useState<EstadoMapas>(() => ({
    version: 3,
    abaAtivaId: carregarAbaAtiva(usuarioId) ?? "",
    abas: [],
  }));
  const mapaInicialEmCriacao = useRef(false);
  const [sincronizando, setSincronizando] = useState(true);
  const [erroSincronizacao, setErroSincronizacao] = useState<string | null>(null);
  const [unidadeSelecionadaId, setUnidadeSelecionadaId] = useState<string | null>(
    null,
  );
  const [statusPincel, setStatusPincel] =
    useState<FerramentaPintura | null>(null);
  const [blocoFiltro, setBlocoFiltro] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFilter>("todos");

  useEffect(() => {
    if (
      statusFiltro !== "todos" &&
      statusFiltro !== "sem-marcacao" &&
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
      salvarAbaAtiva(usuarioId, estadoMapas.abaAtivaId);
    }
  }, [estadoMapas.abaAtivaId, usuarioId]);

  useEffect(() => {
    let ativo = true;
    let cancelarObservacao: (() => void) | undefined;
    setSincronizando(true);
    setErroSincronizacao(null);

    void migrarMapasLegados(usuarioId)
      .then(() => habilitarKits ? migrarKitsEMapas(usuarioId) : undefined)
      .then(() => {
        if (!ativo) return;
        cancelarObservacao = observarMapas(
          usuarioId,
          (mapasRemotos) => {
            if (mapasRemotos.length === 0) {
              if (!mapaInicialEmCriacao.current) {
                mapaInicialEmCriacao.current = true;
                const mapaInicial = {
                  id: "mapa-principal",
                  nome: "Mapa principal",
                  userId: usuarioId,
                  tipo: "manual" as const,
                  kitUnidadeIds: [],
                  marcacoes: {},
                  criadoEm: new Date().toISOString(),
                };
                void criarMapaRemoto(mapaInicial, usuarioId).catch((erro) => {
                  mapaInicialEmCriacao.current = false;
                  registrarErro(erro);
                });
              }
              return;
            }

            mapaInicialEmCriacao.current = false;
            setEstadoMapas((estadoAtual) => ({
              version: 3,
              abaAtivaId: mapasRemotos.some(
                (mapa) => mapa.id === estadoAtual.abaAtivaId,
              )
                ? estadoAtual.abaAtivaId
                : mapasRemotos[0].id,
              abas: mapasRemotos,
            }));
            setErroSincronizacao(null);
            setSincronizando(false);
          },
          registrarErro,
        );
      })
      .catch(registrarErro);

    return () => {
      ativo = false;
      cancelarObservacao?.();
    };
  }, [habilitarKits, usuarioId]);

  function registrarErro(erro: Error) {
    console.error("Falha ao sincronizar com o Firestore:", erro);
    setErroSincronizacao(
      "Não foi possível sincronizar com o Firebase. Verifique a conexão e as regras do Firestore.",
    );
    setSincronizando(false);
  }

  const abaAtual =
    estadoMapas.abas.find((aba) => aba.id === estadoMapas.abaAtivaId) ??
    estadoMapas.abas[0];
  const marcacoes = abaAtual?.marcacoes ?? {};

  const unidadeSelecionada = unidadeSelecionadaId
    ? UNIDADE_BY_ID[unidadeSelecionadaId]
    : null;

  const contagens = useMemo(() => {
    const resultado: Record<string, number> = { "sem-marcacao": 0 };
    for (const legenda of legendas) resultado[legenda.id] = 0;

    for (const unidade of UNIDADES) {
      const status = marcacoes[unidade.id];
      if (status && status in resultado) resultado[status] += 1;
      else resultado["sem-marcacao"] += 1;
    }
    return resultado;
  }, [legendas, marcacoes]);

  const usoPorLegenda = useMemo(() => {
    const resultado: Record<string, number> = {};
    for (const mapa of estadoMapas.abas) {
      for (const status of Object.values(mapa.marcacoes)) {
        if (status) resultado[status] = (resultado[status] ?? 0) + 1;
      }
    }
    return resultado;
  }, [estadoMapas.abas]);

  function selecionarUnidade(id: string) {
    setUnidadeSelecionadaId(id);
    const ferramenta = statusPincel;
    if (ferramenta && abaAtual) {
      atualizarMarcacoesAtuais((atuais) => {
        const proximas = { ...atuais };
        if (ferramenta === "sem-marcacao") delete proximas[id];
        else proximas[id] = ferramenta;
        return proximas;
      });
      void atualizarStatusRemoto(
        abaAtual.id,
        id,
        ferramenta === "sem-marcacao" ? null : ferramenta,
        usuarioId,
      ).catch(registrarErro);
    }
  }

  function definirStatus(id: string, status: StatusId | null) {
    if (!abaAtual) return;
    atualizarMarcacoesAtuais((atuais) => {
      const proximas = { ...atuais };
      if (status) proximas[id] = status;
      else delete proximas[id];
      return proximas;
    });
    void atualizarStatusRemoto(abaAtual.id, id, status, usuarioId).catch(
      registrarErro,
    );
  }

  function atualizarMarcacoesAtuais(
    atualizador: (marcacoes: Marcacoes) => Marcacoes,
  ) {
    setEstadoMapas((estadoAtual) => ({
      ...estadoAtual,
      abas: estadoAtual.abas.map((aba) =>
        aba.id === estadoAtual.abaAtivaId
          ? { ...aba, marcacoes: atualizador(aba.marcacoes) }
          : aba,
      ),
    }));
  }

  function limparTudo() {
    if (!abaAtual) return;
    atualizarMarcacoesAtuais(() => ({}));
    void substituirMarcacoesRemotas(abaAtual.id, {}, usuarioId).catch(
      registrarErro,
    );
  }

  function substituirMarcacoes(novas: Marcacoes) {
    if (!abaAtual) return;
    atualizarMarcacoesAtuais(() => novas);
    void substituirMarcacoesRemotas(abaAtual.id, novas, usuarioId).catch(
      registrarErro,
    );
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
        (aba) => aba.nome.toLocaleLowerCase() === nomeNormalizado.toLocaleLowerCase(),
      )
    ) {
      return false;
    }

    const id = `mapa-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const novaAba = {
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
      abas: [...estadoAtual.abas, novaAba],
    }));
    void criarMapaRemoto(novaAba, usuarioId).catch(registrarErro);
    setUnidadeSelecionadaId(null);
    return true;
  }

  function excluirAba(id: string) {
    const mapa = estadoMapas.abas.find((aba) => aba.id === id);
    if (!mapa || mapa.tipo === "kit") return false;
    setEstadoMapas((estadoAtual) => {
      if (estadoAtual.abas.length <= 1) return estadoAtual;
      const indiceExcluido = estadoAtual.abas.findIndex((aba) => aba.id === id);
      if (indiceExcluido < 0) return estadoAtual;

      const abas = estadoAtual.abas.filter((aba) => aba.id !== id);
      const abaAtivaId =
        estadoAtual.abaAtivaId === id
          ? abas[Math.min(indiceExcluido, abas.length - 1)].id
          : estadoAtual.abaAtivaId;
      return { ...estadoAtual, abas, abaAtivaId };
    });
    void excluirMapaRemoto(id, usuarioId).catch(registrarErro);
    setUnidadeSelecionadaId(null);
    return true;
  }

  function unidadeAtenuada(id: string) {
    const unidade = UNIDADE_BY_ID[id];
    const status = marcacoes[id] ?? null;
    const blocoNaoCorresponde =
      blocoFiltro !== "todos" && unidade.bloco !== blocoFiltro;
    const statusNaoCorresponde =
      statusFiltro !== "todos" &&
      (statusFiltro === "sem-marcacao"
        ? status !== null
        : status !== statusFiltro);
    return blocoNaoCorresponde || statusNaoCorresponde;
  }

  return {
    blocos: BLOCOS,
    unidades: UNIDADES,
    statuses: legendas,
    abas: estadoMapas.abas,
    abaAtual,
    marcacoes,
    unidadeSelecionada,
    statusPincel,
    blocoFiltro,
    statusFiltro,
    contagens,
    usoPorLegenda,
    sincronizando,
    erroSincronizacao,
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
