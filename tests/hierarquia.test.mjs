import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINICAO_LEGADA, validarDefinicao, idsDaPlanta, unidadesDaPlanta, plantaDoDocumento } from '../src/services/geometria.ts';
import { prepararProvisionamento } from '../src/services/provisionamento.ts';
import { criarArquivoExportacao, validarArquivoImportacao } from '../src/services/storage.ts';
import { calcularResumoExecucao, calcularResumoMateriais } from '../src/services/operacao.ts';

const definicao = { schemaVersion: 1, nome: 'Modelo duas unidades', width: 400, height: 180,
  blocos: [{ id: 'a', nome: 'Torre', x: 20, y: 40, width: 300, height: 90, unidades: [
    { id: 'apt-042', label: '42', bloco: 'a', numero: '042', x: 20, y: 40, width: 140, height: 90 },
    { id: 'apt-043', label: '43', bloco: 'a', numero: '043', x: 170, y: 40, width: 140, height: 90 },
  ] }] };
test('geometria original conserva IDs e posições, definições aceitam outros totais', () => {
  assert.deepEqual(validarDefinicao(DEFINICAO_LEGADA), DEFINICAO_LEGADA);
  assert.equal(idsDaPlanta(DEFINICAO_LEGADA).length, 100);
  assert.deepEqual(idsDaPlanta(validarDefinicao(definicao)), ['apt-042', 'apt-043']);
  assert.equal(plantaDoDocumento(undefined), 'planta-principal');
  for (const valor of [null, '', '../outra']) assert.throws(() => plantaDoDocumento(valor));
});
test('definições rejeitam duplicação, coordenadas inválidas, versão futura e texto ausente', () => {
  for (const mudar of [d => d.schemaVersion = 9, d => d.width = -1, d => d.nome = '',
    d => d.blocos[0].unidades[1].id = 'apt-042', d => d.blocos[0].unidades[0].x = Infinity,
    d => d.blocos[0].unidades[0].width = 999, d => d.blocos[0].unidades[0].bloco = 'b']) {
    const copia = structuredClone(definicao); mudar(copia); assert.throws(() => validarDefinicao(copia));
  }
});
test('mesmo template gera resumos independentes e continuidade não inventa disponibilidade', () => {
  const unidades = unidadesDaPlanta(definicao), legendas = [{ id: 'feito', categoria: 'concluido' }, { id: 'impedido', categoria: 'bloqueado' }];
  const a = calcularResumoExecucao(unidades, { 'apt-042': 'feito' }, legendas);
  const b = calcularResumoExecucao(unidades, { 'apt-042': 'impedido', 'apt-043': 'impedido' }, legendas);
  assert.equal(a.concluidas, 1); assert.equal(b.concluidas, 0); assert.equal(b.bloqueadas, 2);
  const kit = { materiais: [{ id: 'm', descricao: 'Registro', quantidadePorKit: 2, disponibilidadeManual: null, unidadeMedida: 'un' }] };
  assert.equal(calcularResumoMateriais(kit, b).materiais[0].necessidadeRestante, 4);
  assert.equal(calcularResumoMateriais(kit, b).capacidade, null);
  const conhecido = calcularResumoMateriais({ materiais: [{ ...kit.materiais[0], disponibilidadeManual: 3 }] }, b);
  assert.equal(conhecido.capacidade, 1); assert.equal(conhecido.materiais[0].deficit, 1);
});
test('JSON contextual preserva identidade e geometria e rejeita outra planta ou mapa', () => {
  const unidades = unidadesDaPlanta(definicao), legendas = [{ id: 'feito' }];
  const contexto = { obra: { id: 'obra-a', nome: 'Obra A' }, planta: { id: 'torre-a', nome: 'Torre A', templateId: 'tipo' }, mapaId: 'pintura-a', definicao };
  const arquivo = criarArquivoExportacao(unidades, { 'apt-042': 'feito' }, 'Pintura', contexto);
  assert.equal(arquivo.version, 2); assert.deepEqual(arquivo.contexto, contexto);
  assert.deepEqual(validarArquivoImportacao(arquivo, unidades, legendas, contexto), { 'apt-042': 'feito' });
  assert.throws(() => validarArquivoImportacao(arquivo, unidades, legendas));
  assert.throws(() => validarArquivoImportacao(arquivo, unidades, legendas, { ...contexto, planta: { ...contexto.planta, id: 'torre-b' } }));
  assert.throws(() => validarArquivoImportacao(arquivo, unidades, legendas, { ...contexto, mapaId: 'outro' }));
});

test('provisionamento valida vínculos, IDs e índices de unidades sem sobrescrever dados', () => {
  const config = { version: 1, obra: { id: 'obra-a', nome: 'Obra A' }, templates: [{ id: 'tipo', definicao }], plantas: [{ id: 'a', nome: 'A', templateId: 'tipo' }, { id: 'b', nome: 'B', templateId: 'tipo' }] };
  const plano = prepararProvisionamento(config, 'usuario');
  assert.equal(plano.length, 4); assert.deepEqual(plano[1].dados.unidadeIds, ['apt-042', 'apt-043']);
  assert.equal(plano[2].dados.templateId, plano[3].dados.templateId);
  assert.notEqual(plano[2].caminho, plano[3].caminho);
  assert.throws(() => prepararProvisionamento({ ...config, plantas: [...config.plantas, config.plantas[0]] }, 'usuario'));
  assert.throws(() => prepararProvisionamento({ ...config, plantas: [{ id: 'c', nome: 'C', templateId: 'ausente' }] }, 'usuario'));
  assert.throws(() => prepararProvisionamento(config, 'uid/fora'));
});
