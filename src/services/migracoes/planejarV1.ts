import { CURRENT_SCHEMA_VERSION, OBRA_PADRAO_ID, lerSchemaVersion, validarId } from "../../config/dados.ts";
import { UNIDADE_BY_ID } from "../../data/planta.ts";

export interface DocumentoLegado {
  id: string;
  data: Record<string, unknown>;
}

export interface AlteracaoMigracao {
  colecao: "mapas" | "kits";
  id: string;
  dados: Record<string, unknown>;
}

function validarNome(nome: unknown) {
  if (typeof nome !== "string" || !nome.trim() || nome.length > 80) {
    throw new Error("Nome inválido nos dados antigos. Solicite revisão administrativa.");
  }
}

function validarUnidades(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length > 100 || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || !UNIDADE_BY_ID[id])) {
    throw new Error("Unidades inválidas nos dados antigos. Nenhuma unidade será descartada.");
  }
}

function validarMapa(mapa: DocumentoLegado) {
  lerSchemaVersion(mapa.data.schemaVersion);
  validarNome(mapa.data.nome);
  if (mapa.data.kitId !== undefined) {
    if (typeof mapa.data.kitId !== "string") throw new Error(`Referência de Kit inválida no mapa ${mapa.id}.`);
    validarId(mapa.data.kitId);
  }
  if (mapa.data.tipo !== undefined && mapa.data.tipo !== "manual" && mapa.data.tipo !== "kit") {
    throw new Error(`Tipo inválido no mapa ${mapa.id}.`);
  }
  if (mapa.data.kitUnidadeIds !== undefined) validarUnidades(mapa.data.kitUnidadeIds);
  const marcacoes = mapa.data.marcacoes;
  if (!marcacoes || typeof marcacoes !== "object" || Array.isArray(marcacoes)
    || Object.entries(marcacoes).some(([id, status]) => !UNIDADE_BY_ID[id]
      || (status !== null && (typeof status !== "string" || !status || status.length > 128)))) {
    throw new Error(`Marcações inválidas no mapa ${mapa.id}. Solicite revisão administrativa.`);
  }
}

const nomeComparavel = (nome: unknown) => String(nome).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

// Cada grupo é atômico. Conflitos interrompem o plano, sem apagar ou adivinhar dados.
export function planejarMigracaoV1(
  usuarioId: string,
  obraId: string,
  mapasAtuais: DocumentoLegado[],
  kitsDoUsuario: DocumentoLegado[],
  mapasGlobais: DocumentoLegado[],
): AlteracaoMigracao[][] {
  const grupos: AlteracaoMigracao[][] = [];
  const mapas = new Map(mapasAtuais.map((mapa) => [mapa.id, mapa]));
  const copiasLegadas = new Map<string, Record<string, unknown>>();
  for (const mapa of mapas.values()) {
    validarMapa(mapa);
    if (mapa.data.userId !== usuarioId
      || (mapa.data.obraId !== undefined && mapa.data.obraId !== obraId)
      || (mapa.data.schemaVersion === CURRENT_SCHEMA_VERSION && mapa.data.obraId !== obraId)) {
      throw new Error(`Proprietário ou obra inválidos no mapa ${mapa.id}.`);
    }
  }
  for (const legado of mapasGlobais) {
    if (legado.data.criadoPor !== usuarioId) throw new Error("Mapa legado de outro usuário.");
    validarMapa(legado);
    if (legado.data.kitId || legado.data.tipo === "kit"
      || (Array.isArray(legado.data.kitUnidadeIds) && legado.data.kitUnidadeIds.length > 0)) {
      throw new Error(`Vínculo de Kit no mapa global ${legado.id}. Solicite revisão administrativa.`);
    }
    const origemLegada = `obras/${obraId}/mapas/${legado.id}`;
    const existente = mapas.get(legado.id);
    if (existente) {
      if (existente.data.origemLegada === origemLegada) continue;
      throw new Error(`Conflito no mapa legado ${legado.id}. Os dois documentos foram preservados.`);
    }
    const data = {
      ...legado.data, userId: usuarioId, obraId, schemaVersion: CURRENT_SCHEMA_VERSION,
      tipo: "manual", kitUnidadeIds: [], origemLegada,
    };
    mapas.set(legado.id, { id: legado.id, data });
    copiasLegadas.set(legado.id, data);
  }

  const kits = kitsDoUsuario.filter((kit) => (kit.data.obraId ?? OBRA_PADRAO_ID) === obraId);
  const atribuidos = new Set<string>();
  for (const kit of kits) {
    const versao = lerSchemaVersion(kit.data.schemaVersion);
    if (kit.data.userId !== usuarioId) throw new Error("Kit de outro usuário.");
    if ((kit.data.obraId !== undefined && kit.data.obraId !== obraId)
      || (versao === CURRENT_SCHEMA_VERSION && kit.data.obraId !== obraId)) {
      throw new Error(`Obra inválida no Kit ${kit.id}.`);
    }
    if (kit.data.mapaId !== undefined) {
      if (typeof kit.data.mapaId !== "string") throw new Error(`Referência de mapa inválida no Kit ${kit.id}.`);
      validarId(kit.data.mapaId);
    }
    validarNome(kit.data.nome);
    validarUnidades(kit.data.unidadeIds);
    const unidadeIds = kit.data.unidadeIds;
    if (!Array.isArray(kit.data.materiais) || !kit.data.materiais.length
      || kit.data.materiais.some((material: unknown) => {
        if (!material || typeof material !== "object") return true;
        const item = material as Record<string, unknown>;
        return typeof item.id !== "string" || typeof item.codigoSienge !== "string"
          || typeof item.descricao !== "string" || typeof item.detalhe !== "string"
          || typeof item.quantidadePorKit !== "number" || !Number.isFinite(item.quantidadePorKit)
          || item.quantidadePorKit <= 0;
      })) throw new Error(`Materiais inválidos no Kit ${kit.id}.`);

    const vinculados = [...mapas.values()].filter((mapa) => mapa.data.kitId === kit.id);
    if (vinculados.length > 1) throw new Error(`Mais de um mapa vinculado ao Kit ${kit.id}.`);
    let mapa = vinculados[0];
    if (typeof kit.data.mapaId === "string" && kit.data.mapaId) {
      if (mapa && mapa.id !== kit.data.mapaId) throw new Error(`Vínculos divergentes no Kit ${kit.id}.`);
      mapa = mapas.get(kit.data.mapaId) ?? mapa;
    } else if (!mapa) {
      const candidatos = [...mapas.values()].filter((item) => !item.data.kitId
        && !atribuidos.has(item.id) && nomeComparavel(item.data.nome) === nomeComparavel(kit.data.nome));
      if (candidatos.length > 1) throw new Error(`Nome ambíguo no Kit ${kit.id}.`);
      mapa = candidatos[0];
    }
    if (mapa && (atribuidos.has(mapa.id) || (mapa.data.kitId && mapa.data.kitId !== kit.id))) {
      throw new Error(`O mapa ${mapa.id} já pertence a outro Kit.`);
    }
    const mapaId = mapa?.id ?? (typeof kit.data.mapaId === "string" && kit.data.mapaId
      ? kit.data.mapaId : `mapa-kit-${kit.id}`);
    if (!mapaId.trim() || mapaId.includes("/") || atribuidos.has(mapaId)
      || (!mapa && mapas.has(mapaId))) throw new Error(`Colisão no mapa ${mapaId}.`);
    if (mapa && Array.isArray(mapa.data.kitUnidadeIds) && mapa.data.kitUnidadeIds.length > 0
      && (mapa.data.kitUnidadeIds.length !== unidadeIds.length
        || mapa.data.kitUnidadeIds.some((id) => !unidadeIds.includes(id)))) {
      throw new Error(`Unidades divergentes entre o Kit ${kit.id} e seu mapa.`);
    }
    if (versao === CURRENT_SCHEMA_VERSION) {
      if (!mapa || mapa.data.kitId !== kit.id || mapa.data.tipo !== "kit"
        || kit.data.mapaId !== mapa.id || kit.data.nome !== mapa.data.nome
        || JSON.stringify(kit.data.unidadeIds) !== JSON.stringify(mapa.data.kitUnidadeIds)) {
        throw new Error(`Vínculo inconsistente no Kit versionado ${kit.id}.`);
      }
      if (lerSchemaVersion(mapa.data.schemaVersion) === 0) {
        grupos.push([{ colecao: "mapas", id: mapa.id, dados: { schemaVersion: CURRENT_SCHEMA_VERSION, obraId } }]);
      }
    } else {
      grupos.push([
        { colecao: "kits", id: kit.id, dados: { schemaVersion: CURRENT_SCHEMA_VERSION, obraId, mapaId } },
        { colecao: "mapas", id: mapaId, dados: {
          ...copiasLegadas.get(mapaId),
          schemaVersion: CURRENT_SCHEMA_VERSION, obraId, userId: usuarioId,
          tipo: "kit", kitId: kit.id, nome: kit.data.nome, kitUnidadeIds: kit.data.unidadeIds,
          ...(!mapa ? { marcacoes: {} } : {}),
        } },
      ]);
      copiasLegadas.delete(mapaId);
    }
    atribuidos.add(mapaId);
  }
  for (const mapa of mapas.values()) {
    if (mapa.data.kitId && !atribuidos.has(mapa.id)) throw new Error(`Kit ausente para o mapa ${mapa.id}.`);
    if (!atribuidos.has(mapa.id) && (mapa.data.tipo === "kit"
      || (Array.isArray(mapa.data.kitUnidadeIds) && mapa.data.kitUnidadeIds.length > 0))) {
      throw new Error(`Vínculo de Kit incompleto no mapa ${mapa.id}.`);
    }
    if (!atribuidos.has(mapa.id) && lerSchemaVersion(mapa.data.schemaVersion) === 0) {
      grupos.push([{ colecao: "mapas", id: mapa.id, dados: {
        schemaVersion: CURRENT_SCHEMA_VERSION, obraId, tipo: "manual", kitUnidadeIds: [],
      } }]);
    }
  }
  for (const [id, dados] of copiasLegadas) {
    grupos.push([{ colecao: "mapas", id, dados }]);
  }
  return grupos;
}
