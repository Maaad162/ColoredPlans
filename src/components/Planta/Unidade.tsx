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
  mapaKit: boolean;
  kitUtilizado: boolean;
  onSelecionar: (id: string) => void;
}

export function Unidade({
  unidade,
  statusId,
  legendas,
  selecionada,
  atenuada,
  mapaKit,
  kitUtilizado,
  onSelecionar,
}: UnidadeProps) {
  const status = getStatus(statusId, legendas);
  const preencherKit = mapaKit && kitUtilizado && !statusId;
  const corPreenchimento = preencherKit ? "#08794d" : status.cor;
  const corTexto = preencherKit ? "#ffffff" : status.corTexto;
  const usoKit = mapaKit
    ? kitUtilizado
      ? ", serviço aplicável"
      : ", serviço não aplicável"
    : "";
  const descricao = `Bloco ${unidade.bloco}, unidade ${unidade.numero}, ${status.nome}${usoKit}`;
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
      }${mapaKit ? kitUtilizado ? " unidade--kit-utilizado" : " unidade--kit-nao-utilizado" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={descricao}
      aria-pressed={selecionada}
      onClick={() => onSelecionar(unidade.id)}
      onKeyDown={handleKeyDown}
    >
      <title>{`Bloco ${unidade.bloco}\nUnidade ${unidade.numero}\n${status.nome}${usoKit}`}</title>
      <rect
        className="unidade__lote"
        x={unidade.x}
        y={unidade.y}
        width={unidade.width}
        height={unidade.height}
        rx="1.5"
        fill={corPreenchimento}
      />
      <text
        className="unidade__numero"
        x={centroX}
        y={centroY + 3}
        fill={corTexto}
        textAnchor="middle"
      >
        {unidade.numero}
      </text>
      {statusId && (
        <text
          className="unidade__simbolo"
          x={unidade.x + unidade.width - 4}
          y={unidade.y + 8}
          fill={corTexto}
          textAnchor="end"
          aria-hidden="true"
        >
          {status.simbolo}
        </text>
      )}
      {mapaKit && kitUtilizado && (
        <circle
          className="unidade__kit-marca"
          cx={unidade.x + 5}
          cy={unidade.y + 5}
          r="3"
          aria-hidden="true"
        />
      )}
    </g>
  );
}
