import type { Bloco, Unidade } from "../types/planta";

interface BlocoBase {
  id: string;
  x: number;
  y: number;
  colunas: number;
  largura: number;
  altura?: number;
}

function criarBloco({
  id,
  x,
  y,
  colunas,
  largura,
  altura = 72,
}: BlocoBase): Bloco {
  const larguraUnidade = largura / colunas;
  const alturaUnidade = altura / 2;
  const unidades: Unidade[] = [];

  // A planta original organiza a série 100 na fileira superior e a série 000
  // na inferior. Alterações de posição devem ser feitas nos blocos abaixo.
  for (let coluna = 0; coluna < colunas; coluna += 1) {
    for (const serie of [100, 0]) {
      const numero = String(serie + coluna + 1).padStart(3, "0");
      unidades.push({
        id: `bloco-${id}-${numero}`,
        bloco: id,
        numero,
        x: x + coluna * larguraUnidade,
        y: y + (serie === 100 ? 0 : alturaUnidade),
        width: larguraUnidade,
        height: alturaUnidade,
      });
    }
  }

  return {
    id,
    nome: `Bloco ${id}`,
    x,
    y,
    width: largura,
    height: altura,
    unidades,
  };
}

// Coordenadas SVG derivadas da disposição espacial de mapa.pdf.
export const BLOCOS: Bloco[] = [
  criarBloco({ id: "01", x: 390, y: 248, colunas: 8, largura: 304 }),
  criarBloco({ id: "02", x: 728, y: 112, colunas: 8, largura: 328 }),
  criarBloco({ id: "03", x: 728, y: 248, colunas: 8, largura: 328 }),
  criarBloco({ id: "04", x: 420, y: 438, colunas: 6, largura: 274 }),
  criarBloco({ id: "05", x: 728, y: 438, colunas: 8, largura: 328 }),
  criarBloco({ id: "06", x: 420, y: 562, colunas: 6, largura: 274 }),
  criarBloco({ id: "07", x: 728, y: 562, colunas: 6, largura: 328 }),
];

export const UNIDADES = BLOCOS.flatMap((bloco) => bloco.unidades);

export const TOTAL_UNIDADES = UNIDADES.length;

export const UNIDADE_BY_ID = Object.fromEntries(
  UNIDADES.map((unidade) => [unidade.id, unidade]),
) as Record<string, Unidade>;
