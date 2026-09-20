import type { SchemaVersion } from "../config/dados";

export type StatusId = string;
export type CategoriaExecucao = "nao-iniciado" | "andamento" | "concluido" | "bloqueado" | "outro";

export type StatusFilter = StatusId | `categoria:${CategoriaExecucao}` | "sem-marcacao" | "todos";

export type FerramentaPintura = StatusId | "sem-marcacao";

export interface StatusConfig {
  id: StatusId;
  nome: string;
  cor: string;
  corTexto: string;
  simbolo: string;
  categoria: CategoriaExecucao;
}

/** Setor provisionado administrativamente; não é escolhido pelo usuário final. */
export type TipoConta = "apontamento" | "estoque";

export function tipoContaValido(valor: unknown): valor is TipoConta {
  return valor === "apontamento" || valor === "estoque";
}

/** Entidade de execução à qual os mapas se referem, independente do usuário. */
export interface Obra {
  id: string;
  nome: string;
}

/**
 * Representação de leitura de usuarios/{uid} na aplicação.
 * userId corresponde ao UID do Authentication e ao ID do documento.
 * criadoEm é convertido de Timestamp para ISO pelo serviço de perfil.
 * A imutabilidade do setor é garantida pelas regras Firestore, não pelo tipo TS.
 */
export interface PerfilUsuario {
  schemaVersion: SchemaVersion;
  userId: string;
  email: string;
  tipoConta: TipoConta;
  criadoEm: string;
}

export interface LegendaUsuario extends StatusConfig {
  schemaVersion: SchemaVersion;
  userId: string;
  criadoEm: string;
}

export interface MaterialKit {
  id: string;
  codigoSienge: string;
  descricao: string;
  detalhe: string;
  quantidadePorKit: number;
  unidadeMedida: string;
  disponibilidadeManual: number | null;
}

export interface Kit {
  schemaVersion: SchemaVersion;
  obraId: string;
  id: string;
  userId: string;
  nome: string;
  mapaId: string;
  materiais: MaterialKit[];
  unidadeIds: string[];
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string;
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
  schemaVersion: SchemaVersion;
  obraId: string;
  id: string;
  nome: string;
  userId: string;
  tipo: "manual" | "kit";
  kitId?: string;
  kitUnidadeIds: string[];
  marcacoes: Marcacoes;
  criadoEm: string;
}

export interface ContextoUnidade {
  unidadeId: string;
  observacao: string;
  responsavel: string;
  atualizadoEm: string | null;
  atualizadoPor: string;
}

export interface DisponibilidadeMaterial {
  materialId: string;
  quantidade: number;
  fonte: "manual" | "sienge";
  atualizadoEm: string | null;
}

export interface EstadoMapas {
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
