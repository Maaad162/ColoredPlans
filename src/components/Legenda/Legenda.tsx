import { STATUS_SEM_MARCACAO } from "../../config/statuses";
import type { StatusConfig } from "../../types/planta";

interface LegendaProps {
  legendas: StatusConfig[];
  contagens: Record<string, number>;
  total: number;
}

export function Legenda({ legendas, contagens, total }: LegendaProps) {
  return (
    <section className="side-card legenda" aria-labelledby="legenda-titulo">
      <div className="side-card__cabecalho">
        <div>
          <p className="eyebrow">Resumo da obra</p>
          <h2 id="legenda-titulo">Legenda</h2>
        </div>
        <span className="total-pill">{total} unidades</span>
      </div>
      <div className="legenda__lista">
        {legendas.map((status) => (
          <div className="legenda__item" key={status.id}>
            <span
              className="legenda__cor"
              style={{ backgroundColor: status.cor }}
              aria-hidden="true"
            />
            <span className="legenda__nome">{status.nome}</span>
            <strong>{contagens[status.id] ?? 0}</strong>
          </div>
        ))}
        <div className="legenda__item">
          <span
            className="legenda__cor legenda__cor--vazia"
            style={{ backgroundColor: STATUS_SEM_MARCACAO.cor }}
            aria-hidden="true"
          />
          <span className="legenda__nome">Sem marcação</span>
          <strong>{contagens["sem-marcacao"]}</strong>
        </div>
      </div>
      <div className="legenda__barra" aria-hidden="true">
        {legendas.map((status) =>
          (contagens[status.id] ?? 0) > 0 ? (
            <span
              key={status.id}
              style={{
                backgroundColor: status.cor,
                width: `${((contagens[status.id] ?? 0) / total) * 100}%`,
              }}
            />
          ) : null,
        )}
      </div>
    </section>
  );
}
