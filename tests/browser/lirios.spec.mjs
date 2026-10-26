import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDocFromServer, collection, getDocs, query, where } from 'firebase/firestore';
import { seedTestUsers, TEST_ACCOUNTS, SEED_PASSWORD, SEED_PROJECT_ID, SEED_SPACE_ID, SEED_OBRA_ID, SEED_LIRIOS_MAPA_ID } from '../../scripts/seed-test-users.mjs';
import { LIRIOS_OBRA_ID, LIRIOS_PLANTA_ID } from '../../src/data/liriosDoValeII.ts';

let ambiente;
const painel = page => page.getByRole('region', { name: /^(Unidade|Área comum) selecionada$/ });
const obraSelect = page => page.getByLabel('Obra selecionada');
const mapaPath = `usuarios/${SEED_SPACE_ID}/obras/${LIRIOS_OBRA_ID}/mapas/${SEED_LIRIOS_MAPA_ID}`;
const banco = () => ambiente.authenticatedContext('teste-dev').firestore();
test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Lírios exige ambos emuladores demo.');
  ambiente = await initializeTestEnvironment({ projectId: SEED_PROJECT_ID });
});
test.afterAll(async () => { await ambiente.cleanup(); });
test.beforeEach(async () => { await ambiente.clearFirestore(); await seedTestUsers(); });

async function login(page, nivel = 'tecnico') {
  const conta = TEST_ACCOUNTS.find(c => c.nivel === nivel && (nivel !== 'tecnico' || c.tipoConta === 'apontamento'));
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill(conta.email);
  await page.getByLabel('Senha', { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await obraSelect(page).selectOption(LIRIOS_OBRA_ID);
  await expect(page.getByRole('tab', { name: /Planejamento físico/ })).toBeVisible();
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(108);
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
}
const selecionar = async (page, id) => { await page.locator(`[data-unidade-id="${id}"]`).click(); };

for (const nivel of ['tecnico', 'engenheiro', 'coordenador', 'gestor', 'dev']) {
  test(`Lírios: login ${nivel} abre a geometria real sem alterar permissões`, async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await login(page, nivel);
    await expect(obraSelect(page).locator('option:checked')).toHaveText('Lírios do Vale II');
    await expect(page.locator('.planta-svg .bloco')).toHaveCount(8);
    await expect(page.locator('.planta-svg [data-unidade-id^="area-"]')).toHaveCount(8);
    await expect(page.locator('.planta-svg [data-unidade-id^="area-bicicletario-"]')).toHaveCount(4);
    if (nivel === 'tecnico') await page.locator('.planta-svg').screenshot({ path: '.firebase/lirios-mapa.png' });
    await selecionar(page, 'area-parque-infantil');
    await expect(painel(page)).toContainText('Parque infantil');
    await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveCount(['tecnico', 'dev'].includes(nivel) ? 1 : 0);
    if (!['gestor', 'dev'].includes(nivel)) await expect(obraSelect(page).locator('option[value="obra-teste-b"]')).toHaveCount(0);
  });
}

test('Lírios: moradia e equipamento recebem marcação/contexto persistidos, com exportação e isolamento', async ({ page, browser, baseURL }) => {
  await login(page);
  await selecionar(page, 'bloco-08-108');
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await page.getByLabel('Bloco ou área', { exact: true }).selectOption('areas-comuns');
  await selecionar(page, 'area-bicicletario-leste');
  await painel(page).getByRole('button', { name: 'Concluído', exact: true }).click();
  await painel(page).getByLabel('Observação operacional').fill('Bicicletário conferido pelo teste');
  await painel(page).getByRole('button', { name: 'Salvar contexto', exact: true }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(108);
  await selecionar(page, 'area-bicicletario-leste');
  await expect(painel(page).getByLabel('Observação operacional')).toHaveValue('Bicicletário conferido pelo teste');
  await expect(painel(page).getByRole('button', { name: 'Concluído', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const remote = (await getDocFromServer(doc(banco(), mapaPath))).data();
  expect(remote.plantaId).toBe(LIRIOS_PLANTA_ID);
  expect(remote.marcacoes['bloco-08-108']).toBe('concluido');
  expect(remote.marcacoes['area-bicicletario-leste']).toBe('concluido');
  const baixar = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const stream = await (await baixar).createReadStream();
  let conteudo = ''; for await (const chunk of stream) conteudo += chunk.toString();
  const arquivo = JSON.parse(conteudo);
  expect(arquivo.contexto.definicao.areasComuns).toHaveLength(8);
  expect(arquivo.unidades).toHaveLength(108);
  await obraSelect(page).selectOption(SEED_OBRA_ID);
  await expect(page.getByRole('tab', { name: /Pintura de teste/ })).toBeVisible();
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(100);
  await expect(page.locator('.planta-svg [data-unidade-id^="area-"]')).toHaveCount(0);
  // The administrative seed restores test passwords; verify preservation with a fresh real login.
  await seedTestUsers();
  const sessaoNova = await browser.newContext({ baseURL });
  try {
    const paginaNova = await sessaoNova.newPage();
    await login(paginaNova);
    await selecionar(paginaNova, 'area-bicicletario-leste');
    await expect(painel(paginaNova).getByLabel('Observação operacional')).toHaveValue('Bicicletário conferido pelo teste');
    await expect(painel(paginaNova).getByRole('button', { name: 'Concluído', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await selecionar(paginaNova, 'bloco-08-108');
    await expect(painel(paginaNova).getByRole('button', { name: 'Concluído', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await sessaoNova.close();
  }
});

test('Lírios: DEV aplica Kit em área comum com vínculo real e sem confundir com moradia', async ({ page }) => {
  await login(page, 'dev');
  await page.getByRole('button', { name: 'Central de Kits', exact: true }).click();
  await page.getByRole('button', { name: '+ Criar Kit', exact: true }).click();
  await page.getByLabel('Nome do Kit').fill('Kit áreas comuns');
  await page.getByLabel('Descrição', { exact: true }).fill('Pintura');
  await page.getByRole('button', { name: 'Salvar Kit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kit áreas comuns', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Selecionar unidades/i }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Parque infantil', exact: true }).check();
  await page.getByRole('button', { name: /Salvar 1 unidade/ }).click();
  await expect(page.getByText('Sincronizado', { exact: true })).toBeVisible();
  const docs = await getDocs(query(collection(banco(), `usuarios/${SEED_SPACE_ID}/kits`), where('userId', '==', SEED_SPACE_ID), where('obraId', '==', LIRIOS_OBRA_ID)));
  const kit = docs.docs.find(d => d.data().nome === 'Kit áreas comuns').data();
  expect(kit.plantaId).toBe(LIRIOS_PLANTA_ID);
  expect(kit.unidadeIds).toEqual(['area-parque-infantil']);
});
