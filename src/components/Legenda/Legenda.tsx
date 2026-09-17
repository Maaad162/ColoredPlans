import { STATUS_SEM_MARCACAO } from "../../config/statuses";
import type { StatusConfig } from "../../types/planta";

interface LegendaProps {
  legendas: StatusConfig[];
  contagens: Record<string, number>;
  total: number;
}

export function Legenda({ legendas, contagens, total }: LegendaProps) {
  const desconhecidas = Object.keys(contagens).filter((id) => id !== "sem-marcacao"
    && !legendas.some((legenda) => legenda.id === id));
  return (
    <section className="side-card legenda" aria-labelledby="legenda-titulo">
      <div className="side-card__cabecalho">
        <div>
          <p className="eyebrow">Resumo do mapa ativo</p>
          <h2 id="legenda-titulo">Legenda</h2>
        </div>
        <span className="total-pill">{total} unidades</span>
      </div>
      <p aria-live="polite">
        <strong>{total - (contagens["sem-marcacao"] ?? 0)} de {total}</strong> unidades marcadas
        {" · "}{(total ? (total - (contagens["sem-marcacao"] ?? 0)) / total : 0).toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 })}
      </p>
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
        {desconhecidas.map((id) => <div className="legenda__item" key={id}>
          <span className="legenda__cor" style={{ backgroundColor: "#8b9690" }} aria-hidden="true" />
          <span className="legenda__nome">Legenda indisponível ({id})</span>
          <strong>{contagens[id]}</strong>
        </div>)}
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
        {desconhecidas.map((id) => <span key={id} style={{
          backgroundColor: "#8b9690", width: `${(contagens[id] / total) * 100}%`,
        }} />)}
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
