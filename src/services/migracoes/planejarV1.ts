import { ErroOperacional } from "../erros.ts";
import { COLECOES, CURRENT_SCHEMA_VERSION, lerObraIdDoKit, lerSchemaVersion, validarId } from "../../config/dados.ts";
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
    throw new ErroOperacional("validacao", "Nome inválido nos dados antigos. Solicite revisão administrativa.");
  }
}

function validarUnidades(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length > 100 || new Set(ids).size !== ids.length
    || ids.some((id) => typeof id !== "string" || !UNIDADE_BY_ID[id])) {
    throw new ErroOperacional("validacao", "Unidades inválidas nos dados antigos. Nenhuma unidade será descartada.");
  }
}

function validarMapa(mapa: DocumentoLegado) {
  validarId(mapa.id);
  lerSchemaVersion(mapa.data.schemaVersion);
  validarNome(mapa.data.nome);
  if (mapa.data.kitId !== undefined) {
    if (typeof mapa.data.kitId !== "string") throw new ErroOperacional("validacao", `Referência de Kit inválida no mapa ${mapa.id}.`);
    validarId(mapa.data.kitId);
  }
  if (mapa.data.tipo !== undefined && mapa.data.tipo !== "manual" && mapa.data.tipo !== "kit") {
    throw new ErroOperacional("validacao", `Tipo inválido no mapa ${mapa.id}.`);
  }
  if (mapa.data.kitUnidadeIds !== undefined) validarUnidades(mapa.data.kitUnidadeIds);
  const marcacoes = mapa.data.marcacoes;
  if (!marcacoes || typeof marcacoes !== "object" || Array.isArray(marcacoes)
    || Object.entries(marcacoes).some(([id, status]) => !UNIDADE_BY_ID[id]
      || (status !== null && (typeof status !== "string" || !status || status.length > 128)))) {
    throw new ErroOperacional("validacao", `Marcações inválidas no mapa ${mapa.id}. Solicite revisão administrativa.`);
  }
}

const nomeComparavel = (nome: unknown) => String(nome).normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

export function planejarMigracaoV1(
  usuarioId: string,
  obraId: string,
  mapasAtuais: DocumentoLegado[],
  kitsDoUsuario: DocumentoLegado[],
  mapasGlobais: DocumentoLegado[],
): AlteracaoMigracao[][] {
  validarId(usuarioId);
  validarId(obraId);
  const grupos = planejarPassoV1(usuarioId, obraId, mapasAtuais, kitsDoUsuario, mapasGlobais);
  const mapas = new Map(mapasAtuais.map((item) => [item.id, item]));
  const kits = new Map(kitsDoUsuario.map((item) => [item.id, item]));
  for (const grupo of grupos) for (const item of grupo) {
    const destino = item.colecao === "mapas" ? mapas : kits;
    destino.set(item.id, { id: item.id, data: { ...destino.get(item.id)?.data, ...item.dados } });
  }
  // Valida a saída com o mesmo contrato: o estado resultante deve ser válido e
  // não exigir outra migração. Essa simulação não altera documentos de entrada.
  if (planejarPassoV1(usuarioId, obraId, [...mapas.values()], [...kits.values()], mapasGlobais).length) {
    throw new ErroOperacional("validacao", "A migração não produziu um estado completo na versão 1. Nenhum dado foi gravado.");
  }
  return grupos;
}

// Cada grupo é atômico. Conflitos interrompem o plano, sem apagar ou adivinhar dados.
function planejarPassoV1(
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
      throw new ErroOperacional("validacao", `Proprietário ou obra inválidos no mapa ${mapa.id}.`);
    }
  }
  for (const legado of mapasGlobais) {
    if (legado.data.criadoPor !== usuarioId) throw new ErroOperacional("validacao", "Mapa legado de outro usuário.");
    validarMapa(legado);
    if (legado.data.kitId || legado.data.tipo === "kit"
      || (Array.isArray(legado.data.kitUnidadeIds) && legado.data.kitUnidadeIds.length > 0)) {
      throw new ErroOperacional("validacao", `Vínculo de Kit no mapa global ${legado.id}. Solicite revisão administrativa.`);
    }
    const origemLegada = `${COLECOES.obras}/${obraId}/${COLECOES.mapas}/${legado.id}`;
    const existente = mapas.get(legado.id);
    if (existente) {
      if (existente.data.origemLegada === origemLegada) continue;
      throw new ErroOperacional("validacao", `Conflito no mapa legado ${legado.id}. Os dois documentos foram preservados.`);
    }
    const data = {
      ...legado.data, userId: usuarioId, obraId, schemaVersion: CURRENT_SCHEMA_VERSION,
      tipo: "manual", kitUnidadeIds: [], origemLegada,
    };
    mapas.set(legado.id, { id: legado.id, data });
    copiasLegadas.set(legado.id, data);
  }

  const kits = kitsDoUsuario.filter((kit) => lerObraIdDoKit(kit.data.obraId) === obraId);
  const reservados = new Map<string, string>();
  const kitsSemVinculoPorNome = new Map<string, number>();
  for (const kit of kits) {
    validarId(kit.id);
    if (kit.data.mapaId !== undefined) {
      if (typeof kit.data.mapaId !== "string") throw new ErroOperacional("validacao", `Referência de mapa inválida no Kit ${kit.id}.`);
      validarId(kit.data.mapaId);
      if (reservados.has(kit.data.mapaId)) throw new ErroOperacional("validacao", `Colisão no mapa ${kit.data.mapaId}.`);
      reservados.set(kit.data.mapaId, kit.id);
    } else if (![...mapas.values()].some((mapa) => mapa.data.kitId === kit.id)) {
      const nome = nomeComparavel(kit.data.nome);
      kitsSemVinculoPorNome.set(nome, (kitsSemVinculoPorNome.get(nome) ?? 0) + 1);
    }
  }
  const atribuidos = new Set<string>();
  for (const kit of kits) {
    const versao = lerSchemaVersion(kit.data.schemaVersion);
    if (kit.data.userId !== usuarioId) throw new ErroOperacional("validacao", "Kit de outro usuário.");
    if ((kit.data.obraId !== undefined && kit.data.obraId !== obraId)
      || (versao === CURRENT_SCHEMA_VERSION && kit.data.obraId !== obraId)) {
      throw new ErroOperacional("validacao", `Obra inválida no Kit ${kit.id}.`);
    }
    validarNome(kit.data.nome);
    validarUnidades(kit.data.unidadeIds);
    const unidadeIds = kit.data.unidadeIds;
    const materiaisIds = new Set<string>();
    if (!Array.isArray(kit.data.materiais) || !kit.data.materiais.length
      || kit.data.materiais.some((material: unknown) => {
        if (!material || typeof material !== "object") return true;
        const item = material as Record<string, unknown>;
        if (typeof item.id !== "string" || !item.id.trim() || materiaisIds.has(item.id)) return true;
        materiaisIds.add(item.id);
        return typeof item.codigoSienge !== "string"
          || typeof item.descricao !== "string" || typeof item.detalhe !== "string"
          || item.codigoSienge.trim().length > 32 || item.descricao.trim().length > 100
          || item.detalhe.trim().length > 180
          || typeof item.quantidadePorKit !== "number" || !Number.isFinite(item.quantidadePorKit)
          || item.quantidadePorKit <= 0;
      })) throw new ErroOperacional("validacao", `Materiais inválidos no Kit ${kit.id}.`);

    const vinculados = [...mapas.values()].filter((mapa) => mapa.data.kitId === kit.id);
    if (vinculados.length > 1) throw new ErroOperacional("validacao", `Mais de um mapa vinculado ao Kit ${kit.id}.`);
    let mapa = vinculados[0];
    if (typeof kit.data.mapaId === "string" && kit.data.mapaId) {
      if (mapa && mapa.id !== kit.data.mapaId) throw new ErroOperacional("validacao", `Vínculos divergentes no Kit ${kit.id}.`);
      mapa = mapas.get(kit.data.mapaId) ?? mapa;
    } else if (!mapa) {
      const candidatos = [...mapas.values()].filter((item) => !item.data.kitId
        && !reservados.has(item.id)
        && !atribuidos.has(item.id) && nomeComparavel(item.data.nome) === nomeComparavel(kit.data.nome));
      if (candidatos.length > 1 || (candidatos.length > 0
        && (kitsSemVinculoPorNome.get(nomeComparavel(kit.data.nome)) ?? 0) > 1)) {
        throw new ErroOperacional("validacao", `Nome ambíguo no Kit ${kit.id}.`);
      }
      mapa = candidatos[0];
    }
    if (mapa && (atribuidos.has(mapa.id) || (mapa.data.kitId && mapa.data.kitId !== kit.id))) {
      throw new ErroOperacional("validacao", `O mapa ${mapa.id} já pertence a outro Kit.`);
    }
    const mapaId = mapa?.id ?? (typeof kit.data.mapaId === "string" && kit.data.mapaId
      ? kit.data.mapaId : `mapa-kit-${kit.id}`);
    if (!mapaId.trim() || mapaId.includes("/") || atribuidos.has(mapaId)
      || (reservados.has(mapaId) && reservados.get(mapaId) !== kit.id)
      || (!mapa && mapas.has(mapaId))) throw new ErroOperacional("validacao", `Colisão no mapa ${mapaId}.`);
    if (mapa && Array.isArray(mapa.data.kitUnidadeIds) && mapa.data.kitUnidadeIds.length > 0
      && (mapa.data.kitUnidadeIds.length !== unidadeIds.length
        || mapa.data.kitUnidadeIds.some((id) => !unidadeIds.includes(id)))) {
      throw new ErroOperacional("validacao", `Unidades divergentes entre o Kit ${kit.id} e seu mapa.`);
    }
    if (versao === CURRENT_SCHEMA_VERSION) {
      if (!mapa || mapa.data.kitId !== kit.id || mapa.data.tipo !== "kit"
        || kit.data.mapaId !== mapa.id || kit.data.nome !== mapa.data.nome
        || JSON.stringify(kit.data.unidadeIds) !== JSON.stringify(mapa.data.kitUnidadeIds)) {
        throw new ErroOperacional("validacao", `Vínculo inconsistente no Kit versionado ${kit.id}.`);
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
    if (mapa.data.kitId && !atribuidos.has(mapa.id)) throw new ErroOperacional("validacao", `Kit ausente para o mapa ${mapa.id}.`);
    if (!atribuidos.has(mapa.id) && (mapa.data.tipo === "kit"
      || (Array.isArray(mapa.data.kitUnidadeIds) && mapa.data.kitUnidadeIds.length > 0))) {
      throw new ErroOperacional("validacao", `Vínculo de Kit incompleto no mapa ${mapa.id}.`);
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
