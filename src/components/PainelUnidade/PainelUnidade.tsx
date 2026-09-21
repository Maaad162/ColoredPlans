import { useEffect, useState } from "react";
import { getStatus } from "../../config/statuses";
import { CONTEXTO_OBSERVACAO_LIMITE, CONTEXTO_RESPONSAVEL_LIMITE } from "../../services/contextos";
import { traduzirErro } from "../../services/erros";
import type { ContextoUnidade, StatusConfig, StatusId, Unidade } from "../../types/planta";
import { PaletaStatus } from "../PaletaStatus/PaletaStatus";

interface PainelUnidadeProps {
  unidade: Unidade | null;
  statusId: StatusId | null;
  legendas: StatusConfig[];
  onDefinirStatus: (status: StatusId | null) => void;
  onHistorico: () => void;
  contexto: ContextoUnidade;
  onSalvarContexto: (observacao: string, responsavel: string) => Promise<void>;
}

export function PainelUnidade({
  unidade,
  statusId,
  legendas,
  onDefinirStatus,
  onHistorico,
  contexto,
  onSalvarContexto,
}: PainelUnidadeProps) {
  const status = getStatus(statusId, legendas);
  const [observacao, setObservacao] = useState(contexto.observacao);
  const [responsavel, setResponsavel] = useState(contexto.responsavel);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setObservacao(contexto.observacao);
    setResponsavel(contexto.responsavel);
    setErro(null);
  }, [contexto.observacao, contexto.responsavel, contexto.atualizadoEm]);

  return (
    <section className="side-card painel-unidade" aria-labelledby="unidade-titulo">
      <div className="side-card__cabecalho">
        <div>
          <p className="eyebrow">Seleção atual</p>
          <h2 id="unidade-titulo">Unidade selecionada</h2>
        </div>
        {unidade && <span className="selection-indicator" aria-hidden="true" />}
      </div>

      {!unidade ? (
        <div className="painel-vazio">
          <span className="painel-vazio__icone" aria-hidden="true">⌂</span>
          <p>Selecione uma unidade na planta para consultar ou alterar seu status.</p>
        </div>
      ) : (
        <>
          <dl className="unidade-detalhes">
            <div>
              <dt>Bloco</dt>
              <dd>Bloco {unidade.bloco}</dd>
            </div>
            <div>
              <dt>Unidade</dt>
              <dd>{unidade.numero}</dd>
            </div>
            <div className="unidade-detalhes__status">
              <dt>Status</dt>
              <dd>
                <span
                  className="status-dot"
                  style={{ backgroundColor: status.cor }}
                  aria-hidden="true"
                />
                {status.nome}
              </dd>
            </div>
          </dl>

          <button type="button" className="link-button" onClick={onHistorico}>Histórico desta unidade</button>
          <div className="painel-unidade__edicao">
            <p className="field-label">Alterar status</p>
            <PaletaStatus
              valor={statusId}
              legendas={legendas}
              onChange={onDefinirStatus}
            />
          </div>

          <button
            type="button"
            className="button button--ghost button--full"
            onClick={() => onDefinirStatus(null)}
            disabled={!statusId}
          >
            Limpar marcação
          </button>
          <form className="unit-context" onSubmit={(event) => { event.preventDefault(); setSalvando(true); setErro(null);
            void onSalvarContexto(observacao, responsavel).catch(falha => setErro(traduzirErro(falha).mensagem)).finally(() => setSalvando(false)); }}>
            <p className="field-label">Contexto deste serviço</p>
            <label htmlFor="unidade-responsavel">Responsável/equipe</label>
            <input id="unidade-responsavel" maxLength={CONTEXTO_RESPONSAVEL_LIMITE} value={responsavel} onChange={event => setResponsavel(event.target.value)} placeholder="Ex.: Equipe hidráulica" />
            <label htmlFor="unidade-observacao">Observação operacional</label>
            <textarea id="unidade-observacao" maxLength={CONTEXTO_OBSERVACAO_LIMITE} value={observacao} onChange={event => setObservacao(event.target.value)} placeholder="Ex.: Aguardando chegada do registro." />
            <small>{observacao.length}/{CONTEXTO_OBSERVACAO_LIMITE}</small>
            {contexto.atualizadoEm && <small>Atualizado em {new Date(contexto.atualizadoEm).toLocaleString("pt-BR")}</small>}
            {erro && <p className="form-error" role="alert">{erro}</p>}
            <button className="button button--secondary button--full" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar contexto"}</button>
          </form>
        </>
      )}
    </section>
  );
}
