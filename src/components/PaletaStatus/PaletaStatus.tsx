import { STATUSES, STATUS_SEM_MARCACAO } from "../../config/statuses";
import type { StatusId } from "../../types/planta";

interface PaletaStatusProps {
  valor: StatusId | "sem-marcacao" | null;
  onChange: (status: StatusId | null) => void;
  compacta?: boolean;
  incluirLimpar?: boolean;
}

export function PaletaStatus({
  valor,
  onChange,
  compacta = false,
  incluirLimpar = false,
}: PaletaStatusProps) {
  return (
    <div
      className={`paleta${compacta ? " paleta--compacta" : ""}`}
      role="group"
      aria-label="Escolha um status"
    >
      {STATUSES.map((status) => (
        <button
          key={status.id}
          type="button"
          className={`paleta__opcao${valor === status.id ? " paleta__opcao--ativa" : ""}`}
          onClick={() => onChange(status.id)}
          aria-pressed={valor === status.id}
          title={status.nome}
        >
          <span
            className="paleta__cor"
            style={{ backgroundColor: status.cor, color: status.corTexto }}
            aria-hidden="true"
          >
            {status.simbolo}
          </span>
          <span className="paleta__nome">{status.nome}</span>
        </button>
      ))}
      {incluirLimpar && (
        <button
          type="button"
          className={`paleta__opcao${
            valor === "sem-marcacao" ? " paleta__opcao--ativa" : ""
          }`}
          onClick={() => onChange(null)}
          aria-pressed={valor === "sem-marcacao"}
          title="Sem marcação"
        >
          <span
            className="paleta__cor paleta__cor--vazia"
            style={{ color: STATUS_SEM_MARCACAO.corTexto }}
            aria-hidden="true"
          >
            {STATUS_SEM_MARCACAO.simbolo}
          </span>
          <span className="paleta__nome">Sem marcação</span>
        </button>
      )}
    </div>
  );
}
