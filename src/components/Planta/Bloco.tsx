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
        y={bloco.y - 24}
        width={bloco.width + 10}
        height={bloco.height + 29}
        rx="4"
      />
      <text className="bloco__titulo" x={bloco.x} y={bloco.y - 10}>
        {bloco.nome.toUpperCase()}
      </text>
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
