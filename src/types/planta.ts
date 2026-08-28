export type StatusId =
  | "concluido"
  | "andamento"
  | "pendente"
  | "vistoria"
  | "outro";

export type StatusFilter = StatusId | "sem-marcacao" | "todos";

export type FerramentaPintura = StatusId | "sem-marcacao";

export interface StatusConfig {
  id: StatusId;
  nome: string;
  cor: string;
  corTexto: string;
  simbolo: string;
}

export interface Unidade {
  id: string;
  bloco: string;
  numero: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bloco {
  id: string;
  nome: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unidades: Unidade[];
}

export type Marcacoes = Record<string, StatusId | null>;

export interface MapaServico {
  id: string;
  nome: string;
  userId: string;
  marcacoes: Marcacoes;
  criadoEm: string;
}

export interface EstadoMapas {
  version: 3;
  abaAtivaId: string;
  abas: MapaServico[];
}

export interface UnidadeExportada {
  bloco: string;
  numero: string;
  status: StatusId | null;
}

export interface ArquivoMarcacoes {
  version: 1;
  updatedAt: string;
  mapa?: {
    nome: string;
  };
  unidades: UnidadeExportada[];
}
