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
  const areaComum = unidade.tipo === "area-comum";
  const nome = areaComum ? `Área comum, ${unidade.label ?? unidade.numero}` : `Bloco ${unidade.bloco}, unidade ${unidade.numero}`;
  const descricao = `${nome}, ${status.nome}${usoKit}`;
  const linhas = unidade.linhasRotulo ?? [unidade.label ?? unidade.numero];
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
      data-unidade-id={unidade.id}
      role="button"
      tabIndex={0}
      aria-label={descricao}
      aria-pressed={selecionada}
      onClick={() => onSelecionar(unidade.id)}
      onKeyDown={handleKeyDown}
    >
      <title>{descricao}</title>
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
        className={areaComum ? "unidade__nome-area" : "unidade__numero"}
        x={centroX}
        y={areaComum ? centroY : centroY + 3}
        fill={corTexto}
        textAnchor="middle"
        transform={unidade.rotacaoRotulo ? `rotate(${unidade.rotacaoRotulo} ${centroX} ${centroY})` : undefined}
      >
        {areaComum ? linhas.map((linha, indice) => (
          <tspan key={indice} x={centroX} dy={indice === 0 ? `-${(linhas.length - 1) * 0.6}em` : "1.2em"}>{linha}</tspan>
        )) : unidade.label ?? unidade.numero}
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
