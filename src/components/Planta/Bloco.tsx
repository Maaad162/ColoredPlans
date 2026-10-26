import type {
  Bloco as BlocoType,
  Marcacoes,
  StatusConfig,
} from "../../types/planta";
import { Unidade } from "./Unidade";

interface BlocoProps {
  bloco: BlocoType;
  marcacoes: Marcacoes;
  legendas: StatusConfig[];
  selecionadaId: string | null;
  unidadeAtenuada: (id: string) => boolean;
  mapaKit: boolean;
  unidadesDoKit: Set<string>;
  onSelecionar: (id: string) => void;
}

export function Bloco({
  bloco,
  marcacoes,
  legendas,
  selecionadaId,
  unidadeAtenuada,
  mapaKit,
  unidadesDoKit,
  onSelecionar,
}: BlocoProps) {
  return (
    <g className="bloco" aria-label={bloco.nome}>
      <rect
        className="bloco__fundo"
        x={bloco.x - 5}
        y={bloco.posicaoTitulo === "inferior" ? bloco.y - 3 : bloco.y - 24}
        width={bloco.width + 10}
        height={bloco.height + 29}
        rx="4"
      />
      <text className="bloco__titulo"
        x={bloco.posicaoTitulo ? bloco.x + bloco.width / 2 : bloco.x}
        y={bloco.posicaoTitulo === "inferior" ? bloco.y + bloco.height + 17 : bloco.y - 10}
        textAnchor={bloco.posicaoTitulo ? "middle" : "start"}>
        {bloco.nome.toUpperCase()}
      </text>
      {bloco.rotulosFileiras && <g className="bloco__fileiras" aria-hidden="true">
        <text x={bloco.x + bloco.width + 7} y={bloco.y + bloco.height / 4 + 4}>{bloco.rotulosFileiras.superior}</text>
        <text x={bloco.x + bloco.width + 7} y={bloco.y + bloco.height * 3 / 4 + 4}>{bloco.rotulosFileiras.inferior}</text>
      </g>}
      {bloco.unidades.map((unidade) => (
        <Unidade
          key={unidade.id}
          unidade={unidade}
          statusId={marcacoes[unidade.id] ?? null}
          legendas={legendas}
          selecionada={selecionadaId === unidade.id}
          atenuada={unidadeAtenuada(unidade.id)}
          mapaKit={mapaKit}
          kitUtilizado={unidadesDoKit.has(unidade.id)}
          onSelecionar={onSelecionar}
        />
      ))}
    </g>
  );
}
