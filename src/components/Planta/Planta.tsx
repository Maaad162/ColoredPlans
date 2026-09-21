import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Bloco as BlocoType,
  Marcacoes,
  StatusConfig,
} from "../../types/planta";
import { Bloco } from "./Bloco";
import "./Planta.css";

interface PlantaProps {
  blocos: BlocoType[];
  definicao: import("../../types/planta").PlantaDefinition;
  marcacoes: Marcacoes;
  legendas: StatusConfig[];
  selecionadaId: string | null;
  unidadeAtenuada: (id: string) => boolean;
  onSelecionar: (id: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  mapaKit: boolean;
  kitUnidadeIds: string[];
}

interface PanState {
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

export function Planta({
  definicao,
  blocos,
  marcacoes,
  legendas,
  selecionadaId,
  unidadeAtenuada,
  onSelecionar,
  zoom,
  onZoomChange,
  mapaKit,
  kitUnidadeIds,
}: PlantaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const unidadesDoKit = useMemo(() => new Set(kitUnidadeIds), [kitUnidadeIds]);

  useEffect(() => {
    if (selecionadaId) viewportRef.current?.querySelector(".unidade--selecionada")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selecionadaId]);

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const direcao = event.deltaY > 0 ? -0.1 : 0.1;
    onZoomChange(Math.min(2.5, Math.max(0.65, zoom + direcao)));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (zoom <= 1 || target.closest(".unidade")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pan || !viewportRef.current) return;
    viewportRef.current.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    viewportRef.current.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  }

  return (
    <div
      className={`planta-viewport${pan ? " planta-viewport--arrastando" : ""}`}
      ref={viewportRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setPan(null)}
      onPointerCancel={() => setPan(null)}
      aria-label="Planta interativa do empreendimento"
    >
      <div className="planta-scale" style={{ width: `${zoom * 100}%` }}>
        <svg
          className="planta-svg"
          viewBox={`0 0 ${definicao.width} ${definicao.height}`}
          role="group"
          aria-label={`${blocos.reduce((total, bloco) => total + bloco.unidades.length, 0)} unidades distribuídas em ${blocos.length} blocos`}
        >
          {definicao.decoracao === "original" && <>
          <rect className="planta__papel" x="8" y="8" width="1104" height="674" rx="12" />
          <path
            className="planta__limite"
            d="M76 88H1090V642H190l-54-84H76Z"
          />

          <g className="area-comum">
            <rect x="110" y="112" width="482" height="106" rx="3" />
            <text x="351" y="160" textAnchor="middle">ÁREA INSTITUCIONAL</text>
            <text className="area-comum__apoio" x="351" y="178" textAnchor="middle">
              RESERVA PARA EQUIPAMENTO PÚBLICO
            </text>
          </g>

          <g className="equipamentos">
            <rect x="108" y="246" width="82" height="74" rx="3" />
            <text x="149" y="277" textAnchor="middle">CENT.</text>
            <text x="149" y="292" textAnchor="middle">RESÍDUOS</text>

            <rect x="201" y="246" width="78" height="74" rx="3" />
            <text x="240" y="278" textAnchor="middle">BICICLE-</text>
            <text x="240" y="293" textAnchor="middle">TÁRIO</text>

            <rect x="290" y="246" width="82" height="74" rx="3" />
            <text x="331" y="285" textAnchor="middle">QUIOSQUE</text>
          </g>

          <g className="rua">
            <path d="M101 348H1082V410H101Z" />
            <path className="rua__eixo" d="M120 379H1062" />
            <text x="600" y="374" textAnchor="middle">RUA A</text>
            <text className="rua__sentido" x="600" y="395" textAnchor="middle">
              VIA INTERNA
            </text>
          </g>

          <g className="equipamentos equipamentos--inferiores">
            <rect x="110" y="436" width="118" height="94" rx="3" />
            <text x="169" y="475" textAnchor="middle">ACADEMIA</text>
            <text x="169" y="491" textAnchor="middle">AO AR LIVRE</text>

            <rect x="238" y="436" width="142" height="94" rx="3" />
            <text x="309" y="470" textAnchor="middle">BICICLETÁRIO</text>
            <text x="309" y="488" textAnchor="middle">CENTRO</text>
            <text x="309" y="504" textAnchor="middle">COMUNITÁRIO</text>

            <rect x="194" y="554" width="186" height="76" rx="3" />
            <text x="287" y="595" textAnchor="middle">PARQUE INFANTIL</text>
          </g>

          </>}
          {blocos.map((bloco) => (
            <Bloco
              key={bloco.id}
              bloco={bloco}
              marcacoes={marcacoes}
              legendas={legendas}
              selecionadaId={selecionadaId}
              unidadeAtenuada={unidadeAtenuada}
              mapaKit={mapaKit}
              unidadesDoKit={unidadesDoKit}
              onSelecionar={onSelecionar}
            />
          ))}

          {definicao.decoracao === "original" && <g className="norte" transform="translate(1075 92)">
            <path d="M0 34 12 0l12 34-12-7Z" />
            <text x="12" y="49" textAnchor="middle">N</text>
          </g>}
        </svg>
      </div>
    </div>
  );
}
