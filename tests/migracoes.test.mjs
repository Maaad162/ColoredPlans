import assert from "node:assert/strict";
import test from "node:test";
import { planejarMigracaoV1 } from "../src/services/migracoes/planejarV1.ts";
import { CURRENT_SCHEMA_VERSION, OBRA_LEGADA_ID, lerObraIdDoKit, lerSchemaVersion } from "../src/config/dados.ts";

const uid = "teste";
const mapa = { id: "pintura", data: { userId: uid, nome: "Pintura", marcacoes: { "bloco-01-001": "personalizado" } } };
const kit = { id: "kit", data: { userId: uid, nome: "Pintura", unidadeIds: ["bloco-01-001"], materiais: [
  { id: "a", codigoSienge: "1", descricao: "Material", detalhe: "", quantidadePorKit: 2 },
] } };
const planejar = (mapas = [mapa], kits = [], globais = []) => planejarMigracaoV1(uid, OBRA_LEGADA_ID, mapas, kits, globais);

test("migração preserva marcações e campos desconhecidos, agrupa Kit/mapa e é idempotente", () => {
  const mapas = structuredClone([mapa]);
  const kits = structuredClone([kit]);
  const grupos = planejar(mapas, kits);
  assert.equal(grupos[0].length, 2);
  for (const grupo of grupos) for (const item of grupo) {
    const destino = item.colecao === "mapas" ? mapas : kits;
    Object.assign(destino.find((doc) => doc.id === item.id).data, item.dados);
  }
  assert.deepEqual(mapas[0].data.marcacoes, mapa.data.marcacoes);
  assert.equal(kits[0].data.mapaId, mapa.id);
  assert.deepEqual(planejar(mapas, kits), []);
});

test("legado é copiado integralmente e não sobrescreve destino com mesmo ID", () => {
  const antigo = { id: "legado", data: { criadoPor: uid, nome: "Antigo", marcacoes: mapa.data.marcacoes, observacao: "preservar" } };
  const copia = planejar([], [], [antigo])[0][0];
  assert.equal(copia.dados.observacao, "preservar");
  assert.deepEqual(copia.dados.marcacoes, antigo.data.marcacoes);
  assert.equal(antigo.data.schemaVersion, undefined);
  assert.throws(() => planejar([{ ...mapa, id: "legado" }], [], [antigo]), /Conflito/);
  const editado = { id: "legado", data: { ...copia.dados, nome: "Alterado depois" } };
  assert.deepEqual(planejar([editado], [], [antigo]), []);
});

test("ambiguidade, colisão, versões futuras e dados inválidos não são corrigidos destrutivamente", () => {
  assert.throws(() => planejar([mapa, { ...mapa, id: "outro" }], [kit]), /ambíguo/);
  const kitMesmoNome = { id: "outro-kit", data: { ...kit.data, nome: " pintura " } };
  assert.throws(() => planejar([mapa], [kit, kitMesmoNome]), /ambíguo/);
  assert.throws(() => planejar([mapa], [kitMesmoNome, kit]), /ambíguo/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, schemaVersion: 99 } }]), /Versão/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, marcacoes: { desconhecida: "status" } } }]), /Marcações/);
  assert.throws(() => planejar([mapa], [{ ...kit, data: { ...kit.data, unidadeIds: ["invalida"] } }]), /Unidades/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, kitId: "ausente" } }]), /ausente/);
  assert.equal(lerSchemaVersion(undefined), 0);
  assert.equal(lerSchemaVersion(CURRENT_SCHEMA_VERSION), CURRENT_SCHEMA_VERSION);
});

test("Kits de outra obra não participam da migração atual", () => {
  const estrangeiro = { ...kit, data: { ...kit.data, obraId: "obra-b" } };
  assert.deepEqual(planejar([mapa], [estrangeiro]), planejar([mapa]));
  assert.equal(planejarMigracaoV1(uid, "obra-b", [], [kit], []).length, 0);
});

test("a obra recebida delimita o par Kit/mapa mesmo com IDs iguais em outras obras", () => {
  const kitB = { ...kit, data: { ...kit.data, obraId: "obra-b", mapaId: mapa.id } };
  const grupos = planejarMigracaoV1(uid, "obra-b", [mapa], [kitB], []);
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].map((item) => item.dados.obraId), ["obra-b", "obra-b"]);
  assert.equal(grupos[0][0].dados.mapaId, mapa.id);
  assert.equal(grupos[0][1].dados.kitId, kit.id);
  assert.equal(kit.data.obraId, undefined);
  assert.deepEqual(mapa.data.marcacoes, { "bloco-01-001": "personalizado" });
});

test("cópia de mapa global e vínculo ao Kit são feitos no mesmo grupo atômico", () => {
  const legado = { id: "global", data: { ...mapa.data, criadoPor: uid } };
  const grupos = planejar([], [kit], [legado]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].length, 2);
  const copia = grupos[0].find((item) => item.colecao === "mapas");
  assert.deepEqual(copia.dados.marcacoes, mapa.data.marcacoes);
  assert.equal(copia.dados.kitId, kit.id);
  assert.ok(copia.dados.origemLegada);
});

test("vínculos colidentes ou divergentes não descartam informações antigas", () => {
  const primeiro = { ...kit, data: { ...kit.data, mapaId: "a-criar" } };
  const segundo = { id: "segundo", data: { ...kit.data, mapaId: "a-criar" } };
  assert.throws(() => planejar([], [primeiro, segundo]), /Colisão/);
  const divergente = { ...mapa, data: { ...mapa.data, kitUnidadeIds: ["bloco-02-001"] } };
  assert.throws(() => planejar([divergente], [kit]), /Unidades divergentes/);
  assert.throws(() => planejar([divergente]), /incompleto/);
  assert.throws(() => planejar([mapa], [{ ...kit, data: { ...kit.data, mapaId: 123 } }]), /Referência/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, kitId: false } }]), /Referência/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, schemaVersion: 1 } }]), /obra inválidos/);
  assert.throws(() => planejar([{ ...mapa, data: { ...mapa.data, tipo: "kit" } }]), /incompleto/);
  assert.throws(() => planejar([], [], [{ id: "global", data: {
    ...divergente.data, criadoPor: uid,
  } }]), /Vínculo de Kit/);
});

test("vínculos explícitos são reservados antes dos nomes, independentemente da ordem dos Kits", () => {
  const explicito = { id: "explicito", data: { ...kit.data, mapaId: mapa.id } };
  for (const kits of [[kit, explicito], [explicito, kit]]) {
    const antes = structuredClone({ mapas: [mapa], kits });
    const grupos = planejar([mapa], kits);
    const alteracoes = grupos.flat();
    assert.equal(alteracoes.find((item) => item.colecao === "kits" && item.id === "explicito").dados.mapaId, mapa.id);
    assert.equal(alteracoes.find((item) => item.colecao === "kits" && item.id === kit.id).dados.mapaId, "mapa-kit-kit");
    const mapasFinais = new Map([[mapa.id, mapa]]);
    const kitsFinais = new Map(kits.map((item) => [item.id, item]));
    for (const item of alteracoes) {
      const destino = item.colecao === "mapas" ? mapasFinais : kitsFinais;
      destino.set(item.id, { id: item.id, data: { ...destino.get(item.id)?.data, ...item.dados } });
    }
    assert.deepEqual(mapasFinais.get(mapa.id).data.marcacoes, mapa.data.marcacoes);
    assert.deepEqual(planejar([...mapasFinais.values()], [...kitsFinais.values()]), []);
    assert.deepEqual({ mapas: [mapa], kits }, antes);
  }
});

test("materiais que seriam descartados ou truncados pelo leitor impedem a migração", () => {
  const material = kit.data.materiais[0];
  for (const materiais of [
    [material, { ...material, descricao: "Outro material com mesmo ID" }],
    [{ ...material, id: " " }],
    [{ ...material, codigoSienge: "1".repeat(33) }],
    [{ ...material, descricao: "x".repeat(101) }],
    [{ ...material, detalhe: "x".repeat(181) }],
    [{ ...material, quantidadePorKit: Infinity }],
    [{ ...material, quantidadePorKit: 0 }],
  ]) {
    const entrada = { ...kit, data: { ...kit.data, materiais } };
    const antes = structuredClone(entrada);
    assert.throws(() => planejar([mapa], [entrada]), /Materiais inválidos/);
    assert.deepEqual(entrada, antes);
  }
});

test("schema e obra inválidos não são interpretados como ausência de versão ou escopo", () => {
  assert.equal(lerSchemaVersion(0), 0);
  assert.equal(lerObraIdDoKit(undefined), OBRA_LEGADA_ID);
  assert.equal(lerObraIdDoKit("obra-b"), "obra-b");
  for (const valor of [null, "1", -1, 2, true, NaN]) {
    assert.throws(() => lerSchemaVersion(valor), /Versão/);
  }
  for (const obraId of [null, "", " ", "obra/invalida", 123]) {
    assert.throws(() => planejar([mapa], [{ ...kit, data: { ...kit.data, obraId } }]), /inválid/);
  }
  assert.throws(() => planejar([{ ...mapa, id: "a/b" }]), /Identificador/);
});
