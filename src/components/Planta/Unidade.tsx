import { getStatus } from "../../config/statuses";
import type {
  StatusConfig,
  StatusId,
  Unidade as UnidadeType,
} from "../../types/planta";

interface UnidadeProps {
  unidade: UnidadeType;
  statusId: StatusId | null;
  legendas: StatusConfig[];
  selecionada: boolean;
  atenuada: boolean;
  onSelecionar: (id: string) => void;
}

export function Unidade({
  unidade,
  statusId,
  legendas,
  selecionada,
  atenuada,
  onSelecionar,
}: UnidadeProps) {
  const status = getStatus(statusId, legendas);
  const descricao = `Bloco ${unidade.bloco}, unidade ${unidade.numero}, ${status.nome}`;
  const centroX = unidade.x + unidade.width / 2;
  const centroY = unidade.y + unidade.height / 2;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelecionar(unidade.id);
    }
  }

  return (
    <g
      className={`unidade${selecionada ? " unidade--selecionada" : ""}${
        atenuada ? " unidade--atenuada" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-label={descricao}
      aria-pressed={selecionada}
      onClick={() => onSelecionar(unidade.id)}
      onKeyDown={handleKeyDown}
    >
      <title>{`Bloco ${unidade.bloco}\nUnidade ${unidade.numero}\n${status.nome}`}</title>
      <rect
        className="unidade__lote"
        x={unidade.x}
        y={unidade.y}
        width={unidade.width}
        height={unidade.height}
        rx="1.5"
        fill={status.cor}
      />
      <text
        className="unidade__numero"
        x={centroX}
        y={centroY + 3}
        fill={status.corTexto}
        textAnchor="middle"
      >
        {unidade.numero}
      </text>
      {statusId && (
        <text
          className="unidade__simbolo"
          x={unidade.x + unidade.width - 4}
          y={unidade.y + 8}
          fill={status.corTexto}
          textAnchor="end"
          aria-hidden="true"
        >
          {status.simbolo}
        </text>
      )}
    </g>
  );
}
