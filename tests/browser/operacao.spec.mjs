import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDocFromServer, getDocs, collection, query, where } from 'firebase/firestore';

const projeto = 'demo-coloredplans', obraId = 'obra-principal';
let ambiente, uid, email, banco, errosPagina;
const mapaPath = () => `usuarios/${uid}/obras/${obraId}/mapas/pintura`;
const eventos = () => getDocs(query(collection(banco, `usuarios/${uid}/obras/${obraId}/historico`), where('userId', '==', uid), where('obraId', '==', obraId)));
const estadoRemoto = async () => (await getDocFromServer(doc(banco, mapaPath()))).data().marcacoes;
async function login(page) {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-emulador');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function selecionar(page, bloco = '01') {
  await page.getByLabel('Buscar número da unidade').fill('1');
  await page.getByRole('button', { name: `Bloco ${bloco} · Unidade 001`, exact: true }).click();
}
const painel = page => page.getByRole('region', { name: 'Unidade selecionada' });
async function rede(page, online) {
  const fonte = await (await page.request.get('/src/config/firebase.ts')).text();
  const modulo = fonte.match(/from "([^"]*firebase_firestore[^"]*)"/)[1];
  await page.evaluate(async ({ modulo, online }) => {
    const { db } = await import('/src/config/firebase.ts');
    const sdk = await import(modulo);
    await (online ? sdk.enableNetwork(db) : sdk.disableNetwork(db));
  }, { modulo, online });
}

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Testes exigem os dois emuladores.');
  ambiente = await initializeTestEnvironment({ projectId: projeto });
});
test.afterAll(async () => { await ambiente.cleanup(); });
test.beforeEach(async ({ page }, info) => {
  await ambiente.clearFirestore();
  email = `teste-${Date.now()}-${info.workerIndex}@example.invalid`;
  const resposta = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'senha-emulador', returnSecureToken: true }),
  });
  expect(resposta.ok).toBeTruthy();
  uid = (await resposta.json()).localId;
  banco = ambiente.authenticatedContext(uid).firestore();
  await ambiente.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    if (!info.title.includes('sem perfil')) await setDoc(doc(db, `usuarios/${uid}`), {
      schemaVersion: 1, userId: uid, tipoConta: info.title.includes('Apontamento') ? 'apontamento' : 'estoque', email,
    });
    await setDoc(doc(db, `usuarios/${uid}/obras/${obraId}`), { schemaVersion: 1, userId: uid, nome: 'Obra de teste' });
    await setDoc(doc(db, mapaPath()), { schemaVersion: 1, userId: uid, obraId, nome: 'Pintura', tipo: 'manual', kitUnidadeIds: [], marcacoes: { 'bloco-01-001': 'pendente' } });
    for (const [id, nome, cor] of [['pendente', 'Pendente', '#d9574f'], ['feito', 'Concluído', '#23875d']]) {
      await setDoc(doc(db, `usuarios/${uid}/legendas/${id}`), { schemaVersion: 1, userId: uid, nome, cor });
    }
  });
  errosPagina = [];
  page.on('pageerror', erro => errosPagina.push(erro.message));
  await login(page);
});
test.afterEach(() => { expect(errosPagina).toEqual([]); });

test('Apontamento: login, planta, estado persistido, histórico contextual e reabertura', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Planta do empreendimento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Central de Kits', exact: true })).toHaveCount(0);
  await selecionar(page);
  await expect(painel(page).getByRole('button', { name: 'Pendente', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await expect.poll(async () => (await estadoRemoto())['bloco-01-001']).toBe('feito');
  await page.getByRole('button', { name: 'Histórico desta unidade' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pendente → Concluído');
  await expect(page.getByRole('dialog')).toContainText('Por você');
  expect((await eventos()).size).toBe(1);
  await page.getByRole('button', { name: 'Fechar histórico' }).click();
  await page.reload();
  await selecionar(page);
  await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
});

test('offline: resposta local, pendência real, reconexão e histórico sem duplicação', async ({ page }) => {
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await rede(page, false);
  await expect(page.getByText('Offline · dados locais', { exact: true })).toBeVisible();
  await selecionar(page);
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await estadoRemoto())['bloco-01-001']).toBe('pendente');
  await expect(page.getByText('Sincronizado', { exact: true })).toHaveCount(0);
  await rede(page, true);
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  expect((await estadoRemoto())['bloco-01-001']).toBe('feito');
  expect((await eventos()).size).toBe(1);
  await rede(page, false); await rede(page, true);
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  expect((await eventos()).size).toBe(1);
});

test('falha permanente: rollback, erro persistente e recuperação sem reload', async ({ page }) => {
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await rede(page, false);
  await ambiente.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), mapaPath()), { schemaVersion: 999 }));
  await selecionar(page);
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await rede(page, true);
  await expect(page.getByText('Erro ao sincronizar', { exact: true })).toBeVisible();
  expect((await estadoRemoto())['bloco-01-001']).toBe('pendente');
  expect((await eventos()).size).toBe(0);
  await expect(page.getByText('Missing or insufficient permissions')).toHaveCount(0);
  await ambiente.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), mapaPath()), { schemaVersion: 1 }));
  await expect(painel(page).getByRole('button', { name: 'Pendente', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Erro ao sincronizar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Erro ao sincronizar', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.getByRole('button', { name: 'Fechar mensagem de erro', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Erro ao sincronizar', exact: true }).click();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  expect((await estadoRemoto())['bloco-01-001']).toBe('feito');
  expect((await eventos()).size).toBe(1);
});

test('mapas: criar, trocar, renomear e excluir com confirmação', async ({ page }) => {
  await page.getByRole('button', { name: 'Nova aba', exact: true }).click();
  await page.getByLabel('Nome do serviço').fill('Elétrica');
  await page.getByRole('button', { name: 'Criar aba', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Elétrica/ })).toBeVisible();
  await selecionar(page);
  await expect(painel(page)).toContainText('Não definido');
  await page.getByRole('tab', { name: /Pintura/ }).click();
  await selecionar(page);
  await expect(painel(page).getByRole('button', { name: 'Pendente', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Renomear Elétrica', exact: true }).click();
  await page.getByLabel('Nome do serviço').fill('Elétrica final');
  await page.getByRole('button', { name: 'Renomear', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Elétrica final/ })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Apagar aba Elétrica final', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Elétrica final/ })).toHaveCount(0);
  await expect.poll(async () => (await eventos()).size).toBe(3);
});

test('legendas: criação, edição de cor, rejeição inválida e fallback seguro', async ({ page }) => {
  await page.getByRole('button', { name: 'Cores e legendas', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Descrição/legenda').fill('Vistoria');
  await modal.getByLabel('Cor', { exact: true }).fill('#123456');
  await modal.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(modal.getByRole('button', { name: /Vistoria.*marcações/ })).toBeVisible();
  await modal.getByRole('button', { name: /Vistoria.*marcações/ }).click();
  await modal.getByLabel('Cor', { exact: true }).fill('#abcdef');
  await modal.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(modal.getByRole('button', { name: 'Salvar legenda' })).toBeEnabled();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const docs = await getDocs(query(collection(banco, `usuarios/${uid}/legendas`), where('userId', '==', uid)));
  expect(docs.docs.find(d => d.data().nome === 'Vistoria').data().cor).toBe('#abcdef');
  const erro = await page.evaluate(async uid => {
    const { editarLegendaRemota } = await import('/src/services/legendas.ts');
    try { await editarLegendaRemota(uid, 'feito', 'Concluído', 'invalida'); return null; } catch (e) { return e.code ?? e.codigo; }
  }, uid);
  expect(erro).toBeTruthy();
  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Excluir Vistoria', exact: true }).click();
  await expect(modal.getByRole('button', { name: /Vistoria.*marcações/ })).toHaveCount(0);
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const restantes = await getDocs(query(collection(banco, `usuarios/${uid}/legendas`), where('userId', '==', uid)));
  expect(restantes.docs.some(d => d.data().nome === 'Vistoria')).toBe(false);
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await ambiente.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), mapaPath()), { 'marcacoes.bloco-01-001': 'legenda-removida' }));
  await selecionar(page);
  await expect(painel(page)).toContainText('Legenda indisponível');
});

test('Kits: criação, edição, vínculo, desassociação, isolamento e exclusão atômica', async ({ page }) => {
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  await page.getByRole('button', { name: '+ Criar Kit', exact: true }).click();
  await page.getByLabel('Nome do Kit').fill('Kit hidráulico');
  await page.getByLabel('Referência SIENGE (opcional)', { exact: true }).fill('100');
  await page.getByLabel('Descrição', { exact: true }).fill('Tubo');
  await page.getByRole('button', { name: 'Salvar Kit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kit hidráulico', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const resultado = await page.evaluate(async uid => {
    const api = await import('/src/services/kits.ts');
    const { db } = await import('/src/config/firebase.ts');
    // Usa observação real para obter o documento criado pela interface.
    const kits = await new Promise((resolve, reject) => { const cancelar = api.observarKits(uid, 'obra-principal', lista => { if (lista.length) { cancelar(); resolve(lista); } }, reject); });
    const kit = kits[0];
    await api.salvarKitRemoto(uid, 'obra-principal', { id: kit.id, nome: 'Kit final', materiais: kit.materiais });
    await api.atualizarUnidadesKit(uid, 'obra-principal', kit.id, ['bloco-01-001', 'bloco-02-001']);
    let negado = false;
    try { await api.atualizarUnidadesKit(uid, 'outra-obra', kit.id, []); } catch { negado = true; }
    await api.atualizarUnidadesKit(uid, 'obra-principal', kit.id, []);
    return { kitId: kit.id, mapaId: kit.mapaId, negado, bancoDisponivel: Boolean(db) };
  }, uid);
  expect(resultado.negado).toBe(true);
  await expect(page.getByRole('heading', { name: 'Kit final', exact: true })).toBeVisible();
  expect((await getDocFromServer(doc(banco, `usuarios/${uid}/kits/${resultado.kitId}`))).data().unidadeIds).toEqual([]);
  await page.getByRole('button', { name: 'Mapas e marcações', exact: true }).click();
  await page.getByRole('tab', { name: /^Kit final/ }).click();
  await selecionar(page);
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const mapaKit = await getDocFromServer(doc(banco, `usuarios/${uid}/obras/${obraId}/mapas/${resultado.mapaId}`));
  expect(mapaKit.data().marcacoes['bloco-01-001']).toBe('feito');
  expect((await eventos()).docs.some(item => item.data().mapaId === resultado.mapaId && item.data().acao === 'unidade')).toBe(true);
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Excluir Kit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum Kit cadastrado' })).toBeVisible();
  expect((await getDocFromServer(doc(banco, `usuarios/${uid}/obras/${obraId}/mapas/${resultado.mapaId}`))).exists()).toBe(false);
});

test('sem perfil: login válido não libera planta nem escolha de setor', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Conta aguardando liberação' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planta do empreendimento' })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('importação agrupada, exportação e paginação limitada do histórico', async ({ page }) => {
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const arquivo = { version: 1, unidades: [
    { bloco: '01', numero: '001', status: 'feito' },
    { bloco: '02', numero: '001', status: 'feito' },
  ] };
  page.once('dialog', dialog => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({ name: 'marcacoes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(arquivo)) });
  await expect.poll(async () => (await eventos()).size).toBe(1);
  const grupo = (await eventos()).docs[0].data();
  expect(grupo.acao).toBe('marcacoes');
  expect(grupo.unidadeIds.sort()).toEqual(['bloco-01-001', 'bloco-02-001']);
  expect(await estadoRemoto()).toEqual({ 'bloco-01-001': 'feito', 'bloco-02-001': 'feito' });
  const baixando = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const download = await baixando;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const partes = [];
  for await (const parte of stream) partes.push(parte);
  const exportado = JSON.parse(Buffer.concat(partes).toString());
  expect(exportado.version).toBe(2);
  expect(exportado.contexto.obra.id).toBe(obraId);
  expect(exportado.contexto.planta.id).toBe("planta-principal");
  expect(exportado.unidades.filter(u => u.status === 'feito')).toHaveLength(2);
  await selecionar(page);
  for (let i = 0; i < 20; i++) {
    await painel(page).getByRole('button', { name: i % 2 ? 'Concluído' : 'Pendente', exact: true }).click();
    await expect.poll(async () => (await eventos()).size).toBe(i + 2);
  }
  await page.getByRole('button', { name: 'Histórico deste mapa' }).click();
  const lista = page.getByRole('list', { name: 'Eventos do histórico' });
  await expect(lista.locator(':scope > li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Mais antigos', exact: true }).click();
  await expect(lista.locator(':scope > li')).toHaveCount(1);
  await expect(lista).toContainText('2 unidade(s) alterada(s)');
  await expect(page.getByRole('button', { name: 'Mais antigos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Mais recentes', exact: true }).click();
  await expect(lista.locator(':scope > li')).toHaveCount(20);
});

test('Apontamento: resumo, filtro e contexto operacional permanecem ligados ao mapa atual', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Resumo operacional do mapa' })).toContainText('Ainda não concluídas100');
  await page.getByLabel('Status', { exact: true }).selectOption('pendente');
  await expect(page.getByRole('button', { name: /Bloco 01, unidade 001/ })).not.toHaveClass(/unidade--atenuada/);
  await expect(page.getByRole('button', { name: /Bloco 01, unidade 002/ })).toHaveClass(/unidade--atenuada/);
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await selecionar(page);
  await painel(page).getByLabel('Responsável/equipe').fill('Equipe hidráulica');
  await painel(page).getByLabel('Observação operacional').fill('Aguardando chegada do registro.');
  await painel(page).getByRole('button', { name: 'Salvar contexto', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const contexto = await getDocFromServer(doc(banco, `${mapaPath()}/contextos/bloco-01-001`));
  expect(contexto.data().responsavel).toBe('Equipe hidráulica');
  const historico = await eventos();
  expect(historico.docs.some(item => item.data().acao === 'contexto')).toBe(true);
  await page.getByLabel('Responsável', { exact: true }).selectOption('Equipe hidráulica');
  await expect(page.getByRole('button', { name: /Bloco 01, unidade 001/ })).not.toHaveClass(/unidade--atenuada/);
  await expect(page.getByRole('button', { name: /Bloco 02, unidade 001/ })).toHaveClass(/unidade--atenuada/);
  await page.reload(); await selecionar(page);
  await expect(painel(page).getByLabel('Observação operacional')).toHaveValue('Aguardando chegada do registro.');
});

test('Kit no mapa distingue necessidade, consumo estimado, disponibilidade manual e déficit', async ({ page }) => {
  await ambiente.withSecurityRulesDisabled(async c => {
    const db = c.firestore(), kitId = 'kit-operacao', mapaId = 'mapa-kit-operacao';
    const materiais = [{ id: 'registro', codigoSienge: '123', descricao: 'Registro', detalhe: '', quantidadePorKit: 1,
      unidadeMedida: 'un', disponibilidadeManual: 0 }];
    await setDoc(doc(db, `usuarios/${uid}/kits/${kitId}`), { schemaVersion: 1, userId: uid, obraId, mapaId, nome: 'Hidráulica', materiais,
      unidadeIds: ['bloco-01-001', 'bloco-02-001'], criadoEm: new Date(), atualizadoEm: new Date() });
    await setDoc(doc(db, `usuarios/${uid}/obras/${obraId}/mapas/${mapaId}`), { schemaVersion: 1, userId: uid, obraId, nome: 'Hidráulica', tipo: 'kit', kitId,
      kitUnidadeIds: ['bloco-01-001', 'bloco-02-001'], marcacoes: { 'bloco-01-001': 'feito' }, criadoEm: new Date() });
  });
  await page.getByRole('tab', { name: /Hidráulica/ }).click();
  const resumo = page.getByRole('region', { name: 'Resumo operacional do mapa' });
  await expect(resumo).toContainText('Concluídas1 / 2');
  await resumo.getByText('Ver materiais necessários para concluir').click();
  await expect(resumo).toContainText('necessário 1 un; consumo estimado 1 un');
  await expect(resumo).toContainText('disponível manualmente 0 un; déficit 1 un');
  await expect(resumo).toContainText('Limitante: Registro');
  await ambiente.withSecurityRulesDisabled(async c => updateDoc(doc(c.firestore(), `usuarios/${uid}/kits/kit-operacao`), { 'materiais': [{ id: 'registro', codigoSienge: '123', descricao: 'Registro', detalhe: '', quantidadePorKit: 1, unidadeMedida: 'un', disponibilidadeManual: null }] }));
  await expect(resumo).toContainText('disponibilidade não informada');
  await expect(resumo).toContainText('Não foi possível verificar a capacidade');
});

async function provisionarMultiplas() {
  const definicao = { schemaVersion: 1, nome: 'Duas unidades', width: 400, height: 180, blocos: [{
    id: 'a', nome: 'Setor A', x: 20, y: 40, width: 300, height: 90, unidades: [
      { id: 'apt-042', label: '42', bloco: 'a', numero: '042', x: 20, y: 40, width: 140, height: 90 },
      { id: 'apt-043', label: '43', bloco: 'a', numero: '043', x: 170, y: 40, width: 140, height: 90 },
    ] }] };
  await ambiente.withSecurityRulesDisabled(async c => {
    const admin = c.firestore();
    await setDoc(doc(admin, 'usuarios/' + uid + '/legendas/bloqueado'), { schemaVersion: 1, userId: uid, nome: 'Bloqueado', cor: '#884422', categoria: 'bloqueado' });
    for (const obra of ['obra-a', 'obra-b']) {
      const base = 'usuarios/' + uid + '/obras/' + obra;
      await setDoc(doc(admin, base), { schemaVersion: 1, userId: uid, nome: obra === 'obra-a' ? 'Residencial A' : 'Residencial B', status: obra === 'obra-a' ? 'ativa' : 'arquivada', plantaLegada: false });
      await setDoc(doc(admin, base + '/templates/tipo'), { schemaVersion: 1, definicao, unidadeIds: ['apt-042', 'apt-043'] });
      await setDoc(doc(admin, base + '/equipes/hid'), { nome: 'Equipe hidráulica' });
      for (const plantaId of ['torre-a', 'torre-b']) {
        await setDoc(doc(admin, base + '/plantas/' + plantaId), { schemaVersion: 1, nome: plantaId === 'torre-a' ? 'Torre A' : 'Torre B', templateId: 'tipo' });
        await setDoc(doc(admin, base + '/mapas/hid-' + plantaId), { schemaVersion: 1, userId: uid, obraId: obra, plantaId,
          nome: 'Hidráulica', tipo: 'manual', equipeId: 'hid', kitUnidadeIds: [], marcacoes: obra === 'obra-a' && plantaId === 'torre-b' ? { 'apt-042': 'bloqueado', 'apt-043': 'feito' } : {} });
      }
    }
  });
}

test('multiobra: template independente, dashboard, contexto, troca rápida e preferência', async ({ page }) => {
  await provisionarMultiplas();
  await page.getByLabel('Obra selecionada').selectOption('obra-a');
  await expect(page.getByRole('heading', { name: 'Torre A', exact: true })).toBeVisible();
  await expect(page.locator('.unidade')).toHaveCount(2);
  await page.getByRole('button', { name: /Bloco a, unidade 042/ }).click();
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const caminho = 'usuarios/' + uid + '/obras/obra-a/mapas/hid-torre-a';
  expect((await getDocFromServer(doc(banco, caminho))).data().marcacoes['apt-042']).toBe('feito');
  await page.getByLabel('Equipe do serviço', { exact: true }).selectOption('');
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  expect((await getDocFromServer(doc(banco, caminho))).data().equipeId).toBe('');
  await page.getByLabel('Equipe do serviço', { exact: true }).selectOption('hid');
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await painel(page).getByLabel('Observação operacional').fill('Conferir conexão');
  await painel(page).getByRole('button', { name: 'Salvar contexto', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  expect((await getDocFromServer(doc(banco, caminho + '/contextos/apt-042'))).data().plantaId).toBe('torre-a');
  await page.getByRole('button', { name: 'Visão geral da obra', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Torre B · ver serviços' }).click();
  const resumo = page.getByRole('article', { name: 'Torre B · Hidráulica' });
  await expect(resumo).toContainText('1 / 2 concluídas');
  await page.screenshot({ path: '.edge-validation/phase4-overview.png', fullPage: true });
  await resumo.getByRole('button', { name: '1 bloqueadas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Torre B', exact: true })).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('categoria:bloqueado');
  await expect(page.getByRole('button', { name: /Bloco a, unidade 042/ })).not.toHaveClass(/unidade--atenuada/);
  await expect(page.getByRole('button', { name: /Bloco a, unidade 043/ })).toHaveClass(/unidade--atenuada/);
  await page.getByLabel('Obra selecionada').selectOption('obra-b');
  await expect(page.getByText('Obra arquivada · dados preservados')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumo operacional do mapa' })).toContainText('Concluídas0 / 2');
  await page.getByLabel('Obra selecionada').selectOption('obra-a');
  await page.getByLabel('Obra selecionada').selectOption('obra-b');
  await page.getByLabel('Obra selecionada').selectOption('obra-a');
  await expect(page.getByLabel('Planta selecionada')).toHaveValue('torre-b');
  await page.reload();
  await expect(page.getByLabel('Obra selecionada')).toHaveValue('obra-a');
  await expect(page.getByLabel('Planta selecionada')).toHaveValue('torre-b');
  await expect(page.getByRole('region', { name: 'Resumo operacional do mapa' })).toContainText('Concluídas1 / 2');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Obra selecionada')).toBeVisible();
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await page.screenshot({ path: '.edge-validation/phase4-mobile.png', fullPage: true });
});

test('multiobra: kit utiliza geometria selecionada e mantém vínculo com planta', async ({ page }) => {
  await provisionarMultiplas();
  await page.getByLabel('Obra selecionada').selectOption('obra-a');
  await expect(page.getByRole('heading', { name: 'Torre A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  await page.getByRole('button', { name: '+ Criar Kit', exact: true }).click();
  await page.getByLabel('Nome do Kit', { exact: true }).fill('Kit torre A');
  await page.getByLabel('Descrição', { exact: true }).fill('Registro');
  await page.getByRole('button', { name: 'Salvar Kit', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Selecionar unidades', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('button', { name: 'Selecionar todas', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar 2 unidade(s)', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir mapa', exact: true }).click();
  await expect(page.locator('.unidade--kit-utilizado')).toHaveCount(2);
  await page.getByRole('button', { name: 'Visão geral da obra', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Torre A · ver serviços' }).click();
  const servico = page.getByRole('article', { name: 'Torre A · Kit torre A' });
  await servico.locator('summary').filter({ hasText: 'Materiais e continuidade' }).click();
  await expect(servico).toContainText('Registro: necessário 2 un; disponibilidade desconhecida');
  await expect(servico).not.toContainText('Déficit de capacidade');
  await page.getByLabel('Planta selecionada').selectOption('torre-b');
  await expect(page.getByRole('tab', { name: /^Kit torre A/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum Kit cadastrado' })).toBeVisible();
});
