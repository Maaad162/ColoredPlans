import type { AreaComum, Bloco, PlantaDefinition, PontoPlanta, Unidade } from "../types/planta";

export const LIRIOS_OBRA_ID = "lirios-do-vale-ii";
export const LIRIOS_PLANTA_ID = "implantacao-lirios";
export const LIRIOS_TEMPLATE_ID = "lirios-v1";

// Coordenadas gráficas relativas à implantação da referência; não representam medidas em metros.
function bloco(id: string, x: number, y: number, colunas: number, ascendente: boolean, posicaoTitulo: "superior" | "inferior"): Bloco {
  const unidades: Unidade[] = [];
  const largura = 42, altura = 26;
  for (const serie of [100, 0]) {
    for (let coluna = 0; coluna < colunas; coluna++) {
      const numero = String(serie + (ascendente ? coluna + 1 : colunas - coluna)).padStart(3, "0");
      unidades.push({ id: `bloco-${id}-${numero}`, tipo: "moradia", bloco: id, numero,
        x: x + coluna * largura, y: y + (serie === 100 ? 0 : altura), width: largura, height: altura });
    }
  }
  return { id, nome: `Bloco ${id}`, x, y, width: colunas * largura, height: altura * 2,
    posicaoTitulo, rotulosFileiras: { superior: "S", inferior: "T" }, unidades };
}
const pontos = (pares: [number, number][]): PontoPlanta[] => pares.map(([x, y]) => ({ x, y }));
const area = (id: string, nome: string, categoria: AreaComum["categoria"], x: number, y: number, width: number, height: number,
  linhasRotulo: string[], vertical = false): AreaComum => ({
  id: `area-${id}`, nome, categoria, x, y, width, height, linhasRotulo, ...(vertical ? { rotacaoRotulo: -90 as const } : {}),
});

export const LIRIOS_DEFINICAO: PlantaDefinition = {
  schemaVersion: 1, nome: "Lírios do Vale II", width: 960, height: 550,
  blocos: [
    bloco("08", 141, 54, 8, true, "superior"),
    bloco("07", 516, 54, 6, true, "superior"),
    bloco("05", 266, 170, 6, false, "inferior"),
    bloco("06", 556, 170, 6, false, "inferior"),
    bloco("04", 266, 294, 6, false, "superior"),
    bloco("03", 556, 294, 6, false, "superior"),
    bloco("01", 351, 441, 6, false, "inferior"),
    bloco("02", 640, 441, 6, false, "inferior"),
  ],
  areasComuns: [
    area("bicicletario-noroeste", "Bicicletário noroeste", "bicicletario", 30, 75, 98, 26, ["BICICLETÁRIO"]),
    area("bicicletario-oeste", "Bicicletário junto ao bloco 04", "bicicletario", 230, 352, 84, 22, ["BICICLETÁRIO"]),
    area("bicicletario-sudoeste", "Bicicletário sudoeste", "bicicletario", 60, 422, 82, 24, ["BICICLETÁRIO"]),
    area("bicicletario-leste", "Bicicletário leste", "bicicletario", 909, 274, 24, 95, ["BICICLETÁRIO"], true),
    area("residuos", "Central de resíduos", "residuos", 60, 197, 42, 126, ["CENTRAL DE", "RESÍDUOS"], true),
    area("parque-infantil", "Parque infantil", "parque-infantil", 126, 170, 100, 104, ["PARQUE", "INFANTIL"]),
    area("academia", "Academia ao ar livre", "academia", 186, 276, 36, 92, ["ACADEMIA AO", "AR LIVRE"], true),
    area("centro-comunitario", "Centro comunitário", "centro-comunitario", 185, 441, 124, 72, ["CENTRO", "COMUNITÁRIO"]),
  ],
  implantacao: {
    limite: pontos([[0, 0], [848, 0], [848, 104], [940, 104], [940, 530], [30, 530], [30, 168], [0, 168],
      [0, 158], [30, 158], [30, 108], [0, 108]]),
    circulacao: [
      { pontos: pontos([[0, 108], [940, 108], [940, 274], [908, 274], [908, 162], [0, 162]]) },
      { pontos: pontos([[30, 374], [940, 374], [940, 422], [30, 422]]) },
    ],
  },
};