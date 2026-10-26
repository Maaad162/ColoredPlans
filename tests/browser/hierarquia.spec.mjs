import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocFromServer, getDocs, query, where } from 'firebase/firestore';
import { seedTestUsers, TEST_ACCOUNTS, SEED_PASSWORD, SEED_PROJECT_ID, SEED_SPACE_ID, SEED_OBRA_ID, SEED_LIRIOS_OBRA_ID } from '../../scripts/seed-test-users.mjs';

let ambiente;
const conta = nivel => TEST_ACCOUNTS.find(item => item.nivel === nivel);
const painel = page => page.getByRole('region', { name: 'Unidade selecionada' });
const mapaPath = `usuarios/${SEED_SPACE_ID}/obras/${SEED_OBRA_ID}/mapas/mapa-teste`;
const obraSelect = page => page.getByLabel('Obra selecionada');
const bancoDev = () => ambiente.authenticatedContext(conta('dev').uid).firestore();

async function login(page, usuario) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /cadastr|criar conta|sign up/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /cadastr|criar conta|sign up/i })).toHaveCount(0);
  await page.getByLabel('E-mail', { exact: true }).fill(usuario.email);
  await page.getByLabel('Senha', { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function abrirObra(page) {
  await expect(obraSelect(page).locator(`option[value="${SEED_OBRA_ID}"]`)).toHaveText('Jardim das Tulipas I');
  await obraSelect(page).selectOption(SEED_OBRA_ID);
  await expect(page.getByRole('tab', { name: /Pintura de teste/ })).toBeVisible();
  await page.getByRole('tab', { name: /Pintura de teste/ }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
}

async function selecionar(page) {
  await page.getByLabel('Buscar número da unidade').fill('1');
  await page.getByRole('button', { name: 'Bloco 01 · Unidade 001', exact: true }).click();
}

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Testes exigem Auth e Firestore Emulator.');
  ambiente = await initializeTestEnvironment({ projectId: SEED_PROJECT_ID });
});
test.afterAll(async () => { await ambiente.cleanup(); });
test.beforeEach(async () => {
  await ambiente.clearFirestore();
  await seedTestUsers();
});

for (const [nivel, nome, apontar, gerenciar, todas] of [
  ['tecnico', 'Técnico', true, true, false],
  ['engenheiro', 'Engenheiro', false, true, false],
  ['coordenador', 'Coordenador', false, false, false],
  ['gestor', 'Gestor', false, false, true],
  ['dev', 'DEV', true, true, true],
]) {
  test(`hierarquia: login ${nome}, escopo real, ações e visão geral`, async ({ page }) => {
    const erros = [];
    page.on('pageerror', erro => erros.push(erro.message));
    await login(page, conta(nivel));
    await abrirObra(page);
    await expect(page.getByText(nome, { exact: true })).toBeVisible();
    const ids = await obraSelect(page).locator('option').evaluateAll(opcoes => opcoes.map(opcao => opcao.value));
    expect(ids).toEqual(todas ? expect.arrayContaining([SEED_OBRA_ID, SEED_LIRIOS_OBRA_ID, 'obra-teste-b']) : expect.arrayContaining([SEED_OBRA_ID, SEED_LIRIOS_OBRA_ID]));
    if (!todas) expect(ids).not.toContain('obra-teste-b');
    await expect(page.getByRole('button', { name: 'Nova aba', exact: true })).toHaveCount(gerenciar ? 1 : 0);
    await expect(page.getByRole('button', { name: 'Cores e legendas', exact: true })).toHaveCount(nivel === 'dev' ? 1 : 0);
    await expect(page.getByRole('button', { name: 'Central de Kits', exact: true })).toHaveCount(['engenheiro', 'coordenador', 'dev'].includes(nivel) ? 1 : 0);
    if (nivel === 'engenheiro') {
      for (const mapa of ['Pintura de teste', 'Estoque de teste']) {
        await expect(page.getByRole('tab', { name: new RegExp(mapa) })).toBeVisible();
        await expect(page.getByRole('button', { name: `Renomear ${mapa}`, exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: `Apagar aba ${mapa}`, exact: true })).toHaveCount(0);
      }
      await expect(page.getByLabel('Equipe do serviço')).toBeDisabled();
    }
    await selecionar(page);
    await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveCount(apontar ? 1 : 0);
    if (apontar) await expect(painel(page).getByRole('button', { name: 'Salvar contexto', exact: true })).toBeEnabled();
    else {
      await expect(painel(page).getByRole('button', { name: 'Salvar contexto', exact: true })).toBeDisabled();
      await expect(painel(page).getByLabel('Observação operacional')).toHaveAttribute('readonly', '');
      await expect(painel(page).getByRole('button', { name: 'Limpar marcação', exact: true })).toBeDisabled();
    }
    await page.getByRole('button', { name: 'Visão geral da obra', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Visão geral da obra' })).toContainText('Pintura de teste');
    await page.getByRole('button', { name: 'Voltar à planta', exact: true }).click();
    if (gerenciar) {
      await page.getByRole('button', { name: 'Nova aba', exact: true }).click();
      await page.getByLabel('Nome do serviço').fill(`Serviço ${nome}`);
      await page.getByRole('button', { name: 'Criar aba', exact: true }).click();
      await expect(page.getByRole('tab', { name: new RegExp(`Serviço ${nome}`) })).toBeVisible();
      await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
      if (nivel === 'engenheiro') {
        await expect(page.getByRole('button', { name: `Renomear Serviço ${nome}`, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: `Apagar aba Serviço ${nome}`, exact: true })).toBeVisible();
        await selecionar(page);
        await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveCount(0);
      }
    }
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    expect(erros).toEqual([]);
  });
}

test('hierarquia: apontamento compartilhado em tempo real, autoria e seed idempotente', async ({ page, browser, baseURL }) => {
  const contextos = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })]);
  try {
    const [engenheiro, coordenador] = await Promise.all(contextos.map(contexto => contexto.newPage()));
    await Promise.all([login(page, conta('tecnico')), login(engenheiro, conta('engenheiro')), login(coordenador, conta('coordenador'))]);
    await Promise.all([page, engenheiro, coordenador].map(abrirObra));
    await Promise.all([page, engenheiro, coordenador].map(selecionar));
    await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
    await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
    await expect(painel(engenheiro).locator('.unidade-detalhes__status')).toContainText('Concluído');
    await expect(painel(coordenador).locator('.unidade-detalhes__status')).toContainText('Concluído');
    await painel(page).getByLabel('Responsável/equipe').fill('Equipe de teste compartilhado');
    await painel(page).getByLabel('Observação operacional').fill('Conferido pelo Técnico de teste.');
    await painel(page).getByRole('button', { name: 'Salvar contexto', exact: true }).click();
    await expect(painel(coordenador).getByLabel('Observação operacional')).toHaveValue('Conferido pelo Técnico de teste.');
    await page.getByRole('button', { name: 'Histórico desta unidade', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Pendente → Concluído');
    await expect(page.getByRole('dialog')).toContainText('Por você');
    const historico = await getDocs(query(collection(bancoDev(), `usuarios/${SEED_SPACE_ID}/obras/${SEED_OBRA_ID}/historico`), where('userId', '==', SEED_SPACE_ID), where('obraId', '==', SEED_OBRA_ID)));
    expect(historico.docs.some(item => item.data().autorId === conta('tecnico').uid)).toBe(true);
    const antes = await getDocFromServer(doc(bancoDev(), mapaPath));
    expect(antes.data().marcacoes['bloco-01-001']).toBe('concluido');
    const resultado = await seedTestUsers();
    expect(resultado.contas.map(item => item.uid)).toEqual(TEST_ACCOUNTS.map(item => item.uid));
    expect((await getDocFromServer(doc(bancoDev(), mapaPath))).data()).toEqual(antes.data());
    await expect(painel(coordenador).getByLabel('Observação operacional')).toHaveValue('Conferido pelo Técnico de teste.');
  } finally {
    await Promise.all(contextos.map(contexto => contexto.close()));
  }
});

for (const [nivel, setor] of [['tecnico', 'estoque'], ['engenheiro', 'apontamento'], ['coordenador', 'apontamento']]) {
test(`hierarquia: ${nivel} (${setor}) cria Kit real no espaço compartilhado`, async ({ page }) => {
  const usuario = TEST_ACCOUNTS.find(item => item.nivel === nivel && item.tipoConta === setor);
  await login(page, usuario);
  await abrirObra(page);
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  await page.getByRole('button', { name: '+ Criar Kit', exact: true }).click();
  await page.getByLabel('Nome do Kit').fill('Kit de colaboração');
  await page.getByLabel('Descrição', { exact: true }).fill('Tinta');
  await page.getByRole('button', { name: 'Salvar Kit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kit de colaboração', exact: true })).toBeVisible();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const kits = await getDocs(query(collection(bancoDev(), `usuarios/${SEED_SPACE_ID}/kits`), where('userId', '==', SEED_SPACE_ID), where('obraId', '==', SEED_OBRA_ID)));
  const kit = kits.docs.find(item => item.data().nome === 'Kit de colaboração');
  expect(kit).toBeDefined();
  expect(kit.data().atualizadoPor).toBe(usuario.uid);
  const mapaKit = await getDocFromServer(doc(bancoDev(), `usuarios/${SEED_SPACE_ID}/obras/${SEED_OBRA_ID}/mapas/${kit.data().mapaId}`));
  expect(mapaKit.data().kitId).toBe(kit.id);
  expect(mapaKit.data().userId).toBe(SEED_SPACE_ID);
});
}

test('hierarquia: DEV revoga e restaura obra em sessão ativa sem alterar nível', async ({ page, browser, baseURL }) => {
  const contexto = await browser.newContext({ baseURL });
  try {
    const tecnico = await contexto.newPage();
    await Promise.all([login(page, conta('dev')), login(tecnico, conta('tecnico'))]);
    await Promise.all([abrirObra(page), abrirObra(tecnico)]);
    await expect(tecnico.getByRole('button', { name: 'Gerenciar acessos', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Gerenciar acessos', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Gerenciar acessos' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: `Editar ${conta('dev').email}`, exact: true })).toHaveCount(0);
    await modal.getByRole('button', { name: `Editar ${conta('tecnico').email}`, exact: true }).click();
    await expect(modal.getByRole('combobox', { name: /nível/i })).toHaveCount(0);
    await modal.getByRole('checkbox', { name: 'Jardim das Tulipas I', exact: true }).uncheck();
    await modal.getByRole('checkbox', { name: 'Lírios do Vale II', exact: true }).uncheck();
    await modal.getByRole('button', { name: 'Salvar acessos', exact: true }).click();
    await expect.poll(async () => (await getDocFromServer(doc(bancoDev(), `usuarios/${conta('tecnico').uid}`))).data().obraIds).toEqual([]);
    await expect(tecnico.getByText('Nenhuma obra disponível. Solicite o provisionamento ao responsável técnico.', { exact: true })).toBeVisible();
    await expect(tecnico.getByRole('tab', { name: /Pintura de teste/ })).toHaveCount(0);
    await expect(obraSelect(tecnico).locator('option')).toHaveCount(0);

    await modal.getByRole('button', { name: `Editar ${conta('tecnico').email}`, exact: true }).click();
    await modal.getByRole('checkbox', { name: 'Jardim das Tulipas I', exact: true }).check();
    await modal.getByLabel('Setor', { exact: true }).selectOption('estoque');
    await modal.getByRole('button', { name: 'Salvar acessos', exact: true }).click();
    await abrirObra(tecnico);
    await expect(tecnico.getByText('Técnico', { exact: true })).toBeVisible();
    await expect(tecnico.getByText('Estoque', { exact: true })).toBeVisible();
    await expect(tecnico.getByRole('button', { name: 'Central de Kits', exact: true })).toBeVisible();
    const perfil = (await getDocFromServer(doc(bancoDev(), `usuarios/${conta('tecnico').uid}`))).data();
    expect(perfil.nivel).toBe('tecnico');
    expect(perfil.obraIds).toEqual([SEED_OBRA_ID]);
    expect(perfil.tipoConta).toBe('estoque');
    expect(perfil.espacoId).toBe(SEED_SPACE_ID);
  } finally {
    await contexto.close();
  }
});

test('hierarquia: Engenheiro supervisiona Técnico Estoque e consulta seu Kit sem ações de edição', async ({ page, browser, baseURL }) => {
  const contexto = await browser.newContext({ baseURL });
  try {
    const engenheiro = await contexto.newPage();
    const tecnico = TEST_ACCOUNTS.find(item => item.nivel === 'tecnico' && item.tipoConta === 'estoque');
    await Promise.all([login(page, tecnico), login(engenheiro, conta('engenheiro'))]);
    await Promise.all([abrirObra(page), abrirObra(engenheiro)]);
    await page.getByRole('tab', { name: /Estoque de teste/ }).click();
    await engenheiro.getByRole('tab', { name: /Estoque de teste/ }).click();
    await Promise.all([selecionar(page), selecionar(engenheiro)]);
    await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
    await expect(painel(engenheiro).locator('.unidade-detalhes__status')).toContainText('Concluído');
    await expect(engenheiro.getByRole('button', { name: 'Importar', exact: true })).toBeDisabled();
    await expect(engenheiro.getByRole('button', { name: /Limpar todas as marcações/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
    await page.getByRole('button', { name: '+ Criar Kit', exact: true }).click();
    await page.getByLabel('Nome do Kit').fill('Kit do Técnico Estoque');
    await page.getByLabel('Descrição', { exact: true }).fill('Material supervisionado');
    await page.getByRole('button', { name: 'Salvar Kit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kit do Técnico Estoque', exact: true })).toBeVisible();
    await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
    await engenheiro.getByRole('button', { name: 'Central de Kits', exact: true }).click();
    await expect(engenheiro.getByRole('heading', { name: 'Kit do Técnico Estoque', exact: true })).toBeVisible();
    await expect(engenheiro.getByRole('cell', { name: 'Material supervisionado', exact: true })).toBeVisible();
    for (const nome of ['Editar', 'Selecionar unidades', 'Excluir Kit']) {
      await expect(engenheiro.getByRole('button', { name: nome, exact: true })).toHaveCount(0);
    }
    await engenheiro.getByRole('button', { name: 'Abrir mapa', exact: true }).click();
    await expect(engenheiro.getByRole('tab', { name: /Kit do Técnico Estoque/ })).toHaveAttribute('aria-selected', 'true');
    await expect(engenheiro.getByLabel('Equipe do serviço')).toBeDisabled();
    await expect(engenheiro.getByRole('button', { name: 'Importar', exact: true })).toBeDisabled();
  } finally { await contexto.close(); }
});

test('hierarquia: conta pendente existe no Auth e aguarda provisionamento', async ({ page }) => {
  await login(page, TEST_ACCOUNTS.find(item => !item.nivel));
  await expect(page.getByRole('heading', { name: 'Conta aguardando liberação' })).toBeVisible();
  await expect(obraSelect(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Técnico|Engenheiro|Coordenador|Gestor|DEV/ })).toHaveCount(0);
});
