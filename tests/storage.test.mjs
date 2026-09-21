import assert from "node:assert/strict";
import test from "node:test";
import { criarCsvMapas, criarArquivoExportacao, validarArquivoImportacao, carregarAbaAtiva, salvarAbaAtiva } from "../src/services/storage.ts";
import { OBRA_LEGADA_ID } from "../src/config/dados.ts";

const unidades = [
  { id: "bloco-01-001", bloco: "01", numero: "001" },
  { id: "bloco-02-001", bloco: "02", numero: "001" },
];
const legendas = [{ id: "custom", nome: 'Inspeção; "OK"\r\nLiberada' }];

test("aba ativa isolada por usuário/obra com fallback restrito à identidade legada", () => {
  const valores = new Map([["lm-colored-plans:aba-ativa:v3:a", "legado"]]);
  globalThis.localStorage = { getItem: (id) => valores.get(id) ?? null, setItem: (id, valor) => valores.set(id, valor) };
  assert.equal(carregarAbaAtiva("a", OBRA_LEGADA_ID), "legado");
  assert.equal(carregarAbaAtiva("a", "obra-b"), null);
  salvarAbaAtiva("a", "obra-b", "mapa-b");
  assert.equal(carregarAbaAtiva("a", "obra-b"), "mapa-b");
  assert.equal(carregarAbaAtiva("a", OBRA_LEGADA_ID), "legado");
  assert.equal(carregarAbaAtiva("b", "obra-b"), null);
  salvarAbaAtiva("a", OBRA_LEGADA_ID, "mapa-atual-da-obra-legada");
  assert.equal(carregarAbaAtiva("a", OBRA_LEGADA_ID), "mapa-atual-da-obra-legada");
  assert.equal(carregarAbaAtiva("a", "obra-b"), "mapa-b");
  delete globalThis.localStorage;
});

test("CSV inclui todos os mapas/unidades, status dinâmicos e campos escapados", () => {
  const csv = criarCsvMapas([
    { nome: "Elétrica", marcacoes: { "bloco-01-001": "custom" } },
    { nome: "Kit A", tipo: "kit", marcacoes: { "bloco-02-001": "legado" } },
  ], unidades, legendas);
  assert.equal(csv, '\uFEFF"Mapa";"Bloco";"Número da unidade";"Status"\r\n'
    + '"Elétrica";"01";"001";"Inspeção; ""OK""\r\nLiberada"\r\n'
    + '"Elétrica";"02";"001";"Sem marcação"\r\n'
    + '"Kit A";"01";"001";"Sem marcação"\r\n'
    + '"Kit A";"02";"001";"legado"\r\n');
  assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [239, 187, 191]);
});

test("CSV neutraliza fórmulas e não modifica os mapas", () => {
  const mapas = [{ nome: '=HYPERLINK("url")', marcacoes: {} }];
  const antes = structuredClone(mapas);
  assert.ok(criarCsvMapas(mapas, unidades, []).includes('"\'=HYPERLINK(""url"")"'));
  assert.deepEqual(mapas, antes);
});

test("JSON mantém o formato e permite reimportar legendas dinâmicas", () => {
  const marcacoes = { "bloco-02-001": "custom" };
  const arquivo = criarArquivoExportacao(unidades, marcacoes, "Elétrica");
  assert.equal(arquivo.version, 1);
  assert.equal(arquivo.unidades[0].status, null);
  assert.deepEqual(validarArquivoImportacao(arquivo, unidades, legendas), marcacoes);
});

test("importação rejeita versões incompatíveis antes de substituir marcações", () => {
  const arquivo = criarArquivoExportacao(unidades, {}, "Elétrica");
  for (const version of [0, 3, 99, "1", null]) {
    assert.throws(() => validarArquivoImportacao({ ...arquivo, version }, unidades, legendas), /Versão/);
  }
});

test("importação preserva compatibilidade com arquivos antigos sem versão", () => {
  const arquivo = { unidades: [{ bloco: "01", numero: "001", status: "custom" }] };
  assert.deepEqual(validarArquivoImportacao(arquivo, unidades, legendas), { "bloco-01-001": "custom" });
});
