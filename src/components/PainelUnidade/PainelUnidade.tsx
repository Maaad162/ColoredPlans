import { getStatus } from "../../config/statuses";
import type { StatusId, Unidade } from "../../types/planta";
import { PaletaStatus } from "../PaletaStatus/PaletaStatus";

interface PainelUnidadeProps {
  unidade: Unidade | null;
  statusId: StatusId | null;
  onDefinirStatus: (status: StatusId | null) => void;
}

export function PainelUnidade({
  unidade,
  statusId,
  onDefinirStatus,
}: PainelUnidadeProps) {
  const status = getStatus(statusId);

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

          <div className="painel-unidade__edicao">
            <p className="field-label">Alterar status</p>
            <PaletaStatus valor={statusId} onChange={onDefinirStatus} />
          </div>

          <button
            type="button"
            className="button button--ghost button--full"
            onClick={() => onDefinirStatus(null)}
            disabled={!statusId}
          >
            Limpar marcação
          </button>
        </>
      )}
    </section>
  );
}
