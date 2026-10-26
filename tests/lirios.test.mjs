import test from 'node:test';
import assert from 'node:assert/strict';
import { LIRIOS_DEFINICAO, LIRIOS_OBRA_ID, LIRIOS_PLANTA_ID, LIRIOS_TEMPLATE_ID } from '../src/data/liriosDoValeII.ts';
import { validarDefinicao, unidadesDaPlanta, idsDaPlanta, DEFINICAO_LEGADA } from '../src/services/geometria.ts';
import { criarArquivoExportacao, validarArquivoImportacao } from '../src/services/storage.ts';
import { STATUSES } from '../src/config/statuses.ts';
import { createSeedDocuments, SEED_SPACE_ID, SEED_OBRA_ID } from '../scripts/seed-test-users.mjs';

test('Lírios reproduz 8 blocos/100 moradias e mantém 8 equipamentos operacionais separados', () => {
  const definicao = validarDefinicao(LIRIOS_DEFINICAO);
  assert.equal(definicao.blocos.length, 8);
  assert.equal(definicao.blocos.flatMap(b => b.unidades).length, 100);
  assert.equal(definicao.areasComuns.length, 8);
  assert.equal(definicao.areasComuns.filter(a => a.categoria === 'bicicletario').length, 4);
  assert.equal(unidadesDaPlanta(definicao).length, 108);
  assert.equal(new Set(idsDaPlanta(definicao)).size, 108);
  assert.equal(unidadesDaPlanta(definicao).filter(u => u.tipo === 'area-comum').length, 8);
});

test('Lírios preserva a numeração e a orientação de cada fileira identificável da imagem', () => {
  for (const bloco of LIRIOS_DEFINICAO.blocos) {
    const colunas = bloco.id === '08' ? 8 : 6;
    const crescente = ['08', '07'].includes(bloco.id);
    const topo = Math.min(...bloco.unidades.map(u => u.y));
    const superior = bloco.unidades.filter(u => u.y === topo).sort((a, b) => a.x - b.x);
    const inferior = bloco.unidades.filter(u => u.y !== topo).sort((a, b) => a.x - b.x);
    const numeros = Array.from({ length: colunas }, (_, i) => crescente ? i + 1 : colunas - i);
    assert.deepEqual(superior.map(u => u.numero), numeros.map(n => String(100 + n)));
    assert.deepEqual(inferior.map(u => u.numero), numeros.map(n => String(n).padStart(3, '0')));
    assert.deepEqual(bloco.rotulosFileiras, { superior: 'S', inferior: 'T' });
  }
});

test('Lírios conserva posições relativas dos blocos, equipamentos e circulação', () => {
  const blocos = Object.fromEntries(LIRIOS_DEFINICAO.blocos.map(b => [b.id, b]));
  for (const [esquerdo, direito] of [['08','07'],['05','06'],['04','03'],['01','02']]) {
    assert(blocos[esquerdo].x < blocos[direito].x);
    assert.equal(blocos[esquerdo].y, blocos[direito].y);
  }
  assert(blocos['08'].y < blocos['05'].y && blocos['05'].y < blocos['04'].y && blocos['04'].y < blocos['01'].y);
  const area = id => LIRIOS_DEFINICAO.areasComuns.find(a => a.id === 'area-' + id);
  assert(area('residuos').x < area('parque-infantil').x);
  assert(area('academia').y > area('parque-infantil').y);
  assert(area('centro-comunitario').x < blocos['01'].x);
  assert(area('bicicletario-noroeste').y < blocos['05'].y);
  assert(area('bicicletario-leste').x > blocos['03'].x + blocos['03'].width);
  assert.equal(LIRIOS_DEFINICAO.implantacao.circulacao.length, 2);
  assert.deepEqual(validarDefinicao(JSON.parse(JSON.stringify(LIRIOS_DEFINICAO))), validarDefinicao(LIRIOS_DEFINICAO));
});

test('áreas e circulação rejeitam IDs duplicados, retângulos inválidos e pontos fora da planta', () => {
  const alterar = fn => { const d = structuredClone(LIRIOS_DEFINICAO); fn(d); return d; };
  assert.throws(() => validarDefinicao(alterar(d => { d.areasComuns[1].id = d.areasComuns[0].id; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.areasComuns[0].id = d.blocos[0].unidades[0].id; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.areasComuns[0].width = -1; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.areasComuns[0].x = d.width; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.implantacao.limite[0].x = Infinity; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.implantacao.circulacao[0].pontos[0].y = d.height + 1; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.implantacao.circulacao = [d.implantacao.limite]; })));
  assert.throws(() => validarDefinicao(alterar(d => { d.areasComuns[0].categoria = 'script'; })));
});

test('exportação contextual conserva a geometria e marcações de moradia e área sem cruzar obras', () => {
  const definicao = validarDefinicao(LIRIOS_DEFINICAO), unidades = unidadesDaPlanta(definicao);
  const contexto = { obra: { id: LIRIOS_OBRA_ID, nome: 'Lírios do Vale II' },
    planta: { id: LIRIOS_PLANTA_ID, nome: 'Implantação', templateId: LIRIOS_TEMPLATE_ID },
    mapaId: 'mapa-planejamento', definicao };
  const marcacoes = { 'bloco-08-108': 'concluido', 'area-bicicletario-leste': 'andamento' };
  const arquivo = criarArquivoExportacao(unidades, marcacoes, 'Planejamento físico', contexto);
  const retorno = validarArquivoImportacao(JSON.parse(JSON.stringify(arquivo)), unidades, STATUSES, contexto);
  assert.equal(retorno['bloco-08-108'], 'concluido');
  assert.equal(retorno['area-bicicletario-leste'], 'andamento');
  assert.equal(arquivo.contexto.definicao.areasComuns.length, 8);
  assert.throws(() => validarArquivoImportacao(arquivo, unidades, STATUSES, { ...contexto, obra: { id: SEED_OBRA_ID, nome: 'Jardim das Tulipas I' } }));
});

test('seed compartilha Lírios sem substituir Jardim e inclui os equipamentos no contrato das Rules', () => {
  const docs = createSeedDocuments();
  const obras = docs.filter(d => /^usuarios\/[^/]+\/obras\/[^/]+$/.test(d.path));
  assert.equal(obras.length, 3);
  assert(obras.some(d => d.path.endsWith('/' + SEED_OBRA_ID) && d.data.nome === 'Jardim das Tulipas I'));
  const prefixo = `usuarios/${SEED_SPACE_ID}/obras/${LIRIOS_OBRA_ID}`;
  assert.equal(docs.filter(d => d.path === prefixo).length, 1);
  const template = docs.find(d => d.path === `${prefixo}/templates/${LIRIOS_TEMPLATE_ID}`);
  assert.deepEqual(template.data.unidadeIds, idsDaPlanta(template.data.definicao));
  for (const perfil of docs.filter(d => d.profile)) assert(perfil.data.obraIds.includes(LIRIOS_OBRA_ID));
  assert.equal(unidadesDaPlanta(DEFINICAO_LEGADA).length, 100);
  assert.equal(validarDefinicao(DEFINICAO_LEGADA).areasComuns, undefined);
});

test('documentos do seed não contêm arrays diretamente aninhados incompatíveis com Firestore', () => {
  function conferir(valor) {
    if (Array.isArray(valor)) {
      assert(valor.every(item => !Array.isArray(item)), 'Firestore não aceita array como elemento direto de outro array');
      valor.forEach(conferir);
    } else if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      Object.values(valor).forEach(conferir);
    }
  }
  for (const documento of createSeedDocuments()) conferir(documento.data);
});
