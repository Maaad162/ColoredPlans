import test from 'node:test';
import assert from 'node:assert/strict';
import { ErroOperacional, traduzirErro } from '../src/services/erros.ts';
import { calcularEstadoSync, Sincronizacao } from '../src/services/sincronizacao.ts';
import { validarLegenda, validarMateriais, validarUnidadesKit } from '../src/services/validacoes.ts';
import { calcularResumoExecucao, calcularResumoMateriais } from '../src/services/operacao.ts';

test('aviso novo substitui o anterior e fechar não oculta falhas do estado de sincronização', async () => {
  const controle = new Sincronizacao();
  const falhar = async () => { throw { code: 'permission-denied' }; };
  await assert.rejects(controle.executar('primeira', falhar));
  await assert.rejects(controle.executar('segunda', falhar));
  assert.equal(controle.getSnapshot().aviso.chave, 'segunda');
  controle.fecharAviso();
  controle.observar('mapas', { fromCache: false, hasPendingWrites: false });
  assert.equal(controle.getSnapshot().aviso, null);
  assert.equal(controle.getSnapshot().estado, 'erro');
  assert.equal(controle.getSnapshot().falhas.length, 2);
  controle.reabrirAviso();
  assert.equal(controle.getSnapshot().aviso.chave, 'segunda');
  await assert.rejects(controle.executar('segunda', falhar));
  assert.equal(controle.getSnapshot().aviso.chave, 'segunda');
  await controle.executar('segunda', async () => {});
  assert.equal(controle.getSnapshot().aviso, null, 'aviso antigo não reaparece');
  assert.equal(controle.getSnapshot().estado, 'erro');
  controle.reabrirAviso();
  assert.equal(controle.getSnapshot().aviso.chave, 'primeira');
  await controle.executar('primeira', async () => {});
  controle.reabrirAviso();
  assert.equal(controle.getSnapshot().aviso, null);
});

test('sucesso antigo não apaga falha mais recente da mesma operação', async () => {
  const controle = new Sincronizacao();
  let concluir;
  const antiga = controle.executar('mapa', () => new Promise(resolve => { concluir = resolve; }));
  await assert.rejects(controle.executar('mapa', async () => { throw { code: 'permission-denied' }; }));
  concluir(); await antiga;
  assert.equal(controle.getSnapshot().estado, 'erro');
  assert.equal(controle.getSnapshot().falhas.length, 1);
});

test('materiais e unidades inválidos são rejeitados sem descarte silencioso', () => {
  const material = { id: 'm1', codigoSienge: ' 42 ', descricao: 'Tinta', detalhe: '', quantidadePorKit: 2, extra: 'preservado' };
  assert.equal(validarMateriais([material])[0].codigoSienge, '42');
  assert.equal(validarMateriais([material])[0].extra, 'preservado');
  assert.equal(material.codigoSienge, ' 42 ');
  assert.throws(() => validarMateriais([material, material]), ErroOperacional);
  for (const quantidadePorKit of [NaN, Infinity, 0, -1]) {
    assert.throws(() => validarMateriais([{ ...material, quantidadePorKit }]), ErroOperacional);
  }
  assert.deepEqual(validarUnidadesKit(['bloco-01-001']), ['bloco-01-001']);
  assert.throws(() => validarUnidadesKit(['inexistente']), ErroOperacional);
  assert.throws(() => validarUnidadesKit(['bloco-01-001', 'bloco-01-001']), ErroOperacional);
});

test('legendas exigem nome útil e cor hexadecimal completa', () => {
  validarLegenda('Concluído', '#aBcDeF');
  for (const [nome, cor] of [[' ', '#123456'], ['x'.repeat(49), '#123456'], ['Vistoria', 'red'], ['Vistoria', '#fff']]) {
    assert.throws(() => validarLegenda(nome, cor), ErroOperacional);
  }
});

test('execução usa semântica explícita e reabertura recalcula estimativas', () => {
  const unidades = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
  const legendas = [{ id: 'verde-qualquer', categoria: 'concluido' }, { id: 'amarelo', categoria: 'andamento' }];
  const concluido = calcularResumoExecucao(unidades, { u1: 'verde-qualquer', u2: 'amarelo' }, legendas);
  assert.deepEqual({ total: concluido.total, concluidas: concluido.concluidas, andamento: concluido.andamento, restantes: concluido.restantes },
    { total: 3, concluidas: 1, andamento: 1, restantes: 2 });
  const reaberto = calcularResumoExecucao(unidades, { u1: 'amarelo', u2: 'amarelo' }, legendas);
  assert.equal(reaberto.concluidas, 0); assert.equal(reaberto.restantes, 3);
});

test('necessidade decimal, capacidade, déficit, limitante e desconhecido permanecem distintos', () => {
  const kit = { materiais: [
    { id: 'registro', descricao: 'Registro', codigoSienge: '123', unidadeMedida: 'un', quantidadePorKit: 1, disponibilidadeManual: 28 },
    { id: 'tubo', descricao: 'Tubo', codigoSienge: 'T-1', unidadeMedida: 'm', quantidadePorKit: 6.5, disponibilidadeManual: 300 },
  ] };
  const resumo = calcularResumoMateriais(kit, { concluidas: 63, restantes: 37 });
  assert.equal(resumo.materiais[0].consumoEstimado, 63);
  assert.equal(resumo.materiais[1].necessidadeRestante, 240.5);
  assert.equal(resumo.capacidade, 28); assert.equal(resumo.deficitUnidades, 9);
  assert.equal(resumo.materialLimitanteId, 'registro');
  const parcial = calcularResumoMateriais({ materiais: [{ ...kit.materiais[0], disponibilidadeManual: null }] }, { concluidas: 63, restantes: 37 });
  assert.equal(parcial.capacidade, null); assert.equal(parcial.deficitUnidades, null);
  const zero = calcularResumoMateriais({ materiais: [{ ...kit.materiais[0], disponibilidadeManual: 0 }] }, { concluidas: 63, restantes: 37 });
  assert.equal(zero.capacidade, 0); assert.equal(zero.deficitUnidades, 37);
});

test('erros técnicos são classificados sem expor mensagens ou dados sensíveis', () => {
  for (const [code, categoria] of [['permission-denied', 'permissao'], ['auth/network-request-failed', 'conexao'],
    ['unavailable', 'conexao'], ['not-found', 'ausente'], ['aborted', 'conflito'], ['invalid-argument', 'validacao'],
    ['auth/invalid-credential', 'autenticacao'], ['internal', 'firestore'], ['desconhecido', 'desconhecido']]) {
    const traduzido = traduzirErro({ code, message: 'token-privado' });
    assert.equal(traduzido.codigo, categoria);
    assert.ok(!traduzido.mensagem.includes('token-privado'));
  }
  assert.equal(traduzirErro(new ErroOperacional('validacao', 'Informe uma cor válida.')).mensagem, 'Informe uma cor válida.');
});

test('sincronização exige confirmação de todas as fontes e nenhuma falha pendente', () => {
  const servidor = { fromCache: false, hasPendingWrites: false };
  assert.equal(calcularEstadoSync(true, [servidor], 0, 0), 'sincronizado');
  assert.equal(calcularEstadoSync(true, [servidor], 1, 0), 'salvando');
  assert.equal(calcularEstadoSync(true, [{ ...servidor, hasPendingWrites: true }], 0, 0), 'salvando');
  assert.equal(calcularEstadoSync(true, [servidor, { ...servidor, fromCache: true }], 0, 0), 'offline');
  assert.equal(calcularEstadoSync(false, [servidor], 1, 0), 'offline');
  assert.equal(calcularEstadoSync(false, [servidor], 0, 1), 'erro');
  assert.equal(calcularEstadoSync(true, [], 0, 0), 'salvando');
});

test('falha de gravação permanece após snapshot e sucesso de outra operação; retry resolve', async () => {
  const controle = new Sincronizacao();
  let rejeitar = true;
  const gravar = async () => { if (rejeitar) throw { code: 'permission-denied' }; };
  await assert.rejects(controle.executar('pintura', gravar));
  controle.observar('mapas', { fromCache: false, hasPendingWrites: false });
  await controle.executar('legenda', async () => undefined);
  assert.equal(controle.getSnapshot().estado, 'erro');
  rejeitar = false;
  await controle.executar('pintura', gravar);
  assert.equal(controle.getSnapshot().estado, 'sincronizado');
});

test('operações simultâneas só sincronizam depois da última confirmação', async () => {
  const controle = new Sincronizacao();
  controle.observar('mapas', { fromCache: false, hasPendingWrites: false });
  let concluir;
  const primeira = controle.executar('primeira', () => new Promise(resolve => { concluir = resolve; }));
  await controle.executar('segunda', async () => undefined);
  assert.equal(controle.getSnapshot().estado, 'salvando');
  concluir(); await primeira;
  assert.equal(controle.getSnapshot().estado, 'sincronizado');
});

test('reabrir prioriza gravação pendente mesmo quando a leitura se recupera', async () => {
  const controle = new Sincronizacao();
  await assert.rejects(controle.executar('obra-a:mapa', async () => { throw { code: 'permission-denied' }; }));
  controle.falharLeitura('mapas', { code: 'unavailable' }, () => {});
  controle.reabrirAviso();
  controle.observar('mapas', { fromCache: false, hasPendingWrites: false });
  assert.equal(controle.getSnapshot().aviso.chave, 'obra-a:mapa');
});
