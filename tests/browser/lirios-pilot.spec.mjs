import { test, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, collection, getDocs, query, where } from 'firebase/firestore';
import { seedLiriosPilot, TEST_ACCOUNTS, SEED_PASSWORD, SEED_MAPA_ID } from '../../scripts/seed-lirios-piloto.mjs';
import { LIRIOS_OBRA_ID, LIRIOS_PLANTA_ID } from '../../src/data/liriosDoValeII.ts';

let environment;
const stock = TEST_ACCOUNTS.find(a=>a.tipoConta==='estoque');
const pointing = TEST_ACCOUNTS.find(a=>a.tipoConta==='apontamento');
const db = (account=stock)=>environment.authenticatedContext(account.uid).firestore();
const mapPath = (account=stock)=>`usuarios/${account.uid}/obras/${LIRIOS_OBRA_ID}/mapas/${SEED_MAPA_ID}`;
const panel = page=>page.getByRole('region',{name:/^(Unidade|Área comum) selecionada$/});
async function select(page,id) { await page.locator(`[data-unidade-id="${id}"]`).click(); }
async function login(page,account=stock) {
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill(account.email);
  await page.getByLabel('Senha',{exact:true}).fill(SEED_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByLabel('Obra selecionada').selectOption(LIRIOS_OBRA_ID);
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(108);
}
test.beforeAll(async()=>{
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Both emulators required');
  environment=await initializeTestEnvironment({projectId:'demo-coloredplans'});
});
test.afterAll(async()=>{await environment.cleanup();});
test.beforeEach(async({page})=>{
  await environment.clearFirestore();
  await seedLiriosPilot();
  await environment.withSecurityRulesDisabled(async context=>{
    const uid=stock.uid, store=context.firestore();
    await setDoc(doc(store,`usuarios/${uid}/obras/obra-principal`),{schemaVersion:1,userId:uid,nome:'Jardim das Tulipas I'});
    await setDoc(doc(store,`usuarios/${uid}/obras/obra-principal/mapas/jardim`),{schemaVersion:1,userId:uid,obraId:'obra-principal',nome:'Mapa Jardim',tipo:'manual',kitUnidadeIds:[],marcacoes:{}});
  });
  page.on('pageerror',error=>{throw error;});
});
for (const account of TEST_ACCOUNTS) test(`piloto: login legado ${account.tipoConta}, geometria e ausência de gestão hierárquica`,async({page})=>{
  await login(page,account);
  await expect(page.locator('.bloco')).toHaveCount(8);
  await expect(page.locator('[data-unidade-id^="area-"]')).toHaveCount(8);
  await expect(page.locator('[data-unidade-id^="area-bicicletario-"]')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Gerenciar acessos',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Central de Kits',exact:true})).toHaveCount(account.tipoConta==='estoque'?1:0);
  const profile=(await getDocFromServer(doc(db(account),`usuarios/${account.uid}`))).data();
  expect(profile.schemaVersion).toBe(1);
  for (const field of ['nivel','superiorId','espacoId','obraIds']) expect(profile[field]).toBeUndefined();
  await select(page,'bloco-08-108');
  await expect(panel(page)).toBeVisible();
  await page.getByLabel('Bloco ou área',{exact:true}).selectOption('areas-comuns');
  await select(page,'area-bicicletario-leste');
  await expect(panel(page)).toContainText('Bicicletário');
  if(account===stock) {
    await page.getByLabel('Bloco ou área',{exact:true}).selectOption('todos');
    await page.setViewportSize({width:1700,height:1100});
    await page.locator('.planta-svg').screenshot({path:'.firebase/lirios-piloto.png'});
  }
});
test('piloto: marcação/contexto/exportação persistem e seed não regrava trabalho nem Jardim',async({page,browser,baseURL})=>{
  await login(page);
  await select(page,'bloco-08-108');
  await panel(page).getByRole('button',{name:'Concluído',exact:true}).click();
  await page.getByLabel('Bloco ou área',{exact:true}).selectOption('areas-comuns');
  await select(page,'area-bicicletario-leste');
  await panel(page).getByRole('button',{name:'Concluído',exact:true}).click();
  await panel(page).getByLabel('Observação operacional').fill('Piloto legado conferido');
  await panel(page).getByRole('button',{name:'Salvar contexto',exact:true}).click();
  await expect(page.getByText('Sincronizado',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(108);
  await select(page,'area-bicicletario-leste');
  await expect(panel(page).getByLabel('Observação operacional')).toHaveValue('Piloto legado conferido');
  const remote=(await getDocFromServer(doc(db(),mapPath()))).data();
  expect(remote.plantaId).toBe(LIRIOS_PLANTA_ID);
  expect(remote.marcacoes['area-bicicletario-leste']).toBe('concluido');
  expect(remote.marcacoes['bloco-08-108']).toBe('concluido');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'JSON',exact:true}).click();
  const stream=await(await downloadPromise).createReadStream();
  let raw=''; for await(const chunk of stream)raw+=chunk.toString();
  const exported=JSON.parse(raw);
  expect(exported.unidades).toHaveLength(108);
  expect(exported.contexto.definicao.areasComuns).toHaveLength(8);
  await page.getByLabel('Obra selecionada').selectOption('obra-principal');
  await expect(page.locator('.planta-svg [data-unidade-id]')).toHaveCount(100);
  await expect(page.locator('[data-unidade-id^="area-"]')).toHaveCount(0);
  const reseed=await seedLiriosPilot();
  expect(reseed.documentosGravados).toBe(0);
  const fresh=await browser.newContext({baseURL});
  try {
    const again=await fresh.newPage(); await login(again);
    await select(again,'area-bicicletario-leste');
    await expect(panel(again).getByLabel('Observação operacional')).toHaveValue('Piloto legado conferido');
    await expect(panel(again).getByRole('button',{name:'Concluído',exact:true})).toHaveAttribute('aria-pressed','true');
  }finally{await fresh.close();}
});
test('piloto: Kits em área comum respeitam setor e isolamento real entre UIDs',async({page})=>{
  await login(page);
  await page.getByRole('button',{name:'Central de Kits',exact:true}).click();
  await page.getByRole('button',{name:'+ Criar Kit',exact:true}).click();
  await page.getByLabel('Nome do Kit').fill('Kit piloto comum');
  await page.getByLabel('Descrição',{exact:true}).fill('Pintura');
  await page.getByRole('button',{name:'Salvar Kit',exact:true}).click();
  await page.getByRole('button',{name:/Selecionar unidades/i}).click();
  await page.getByRole('dialog').getByRole('checkbox',{name:'Parque infantil',exact:true}).check();
  await page.getByRole('button',{name:/Salvar 1 unidade/}).click();
  await expect(page.getByText('Sincronizado',{exact:true})).toBeVisible();
  const kits=await getDocs(query(collection(db(),`usuarios/${stock.uid}/kits`),where('userId','==',stock.uid),where('obraId','==',LIRIOS_OBRA_ID)));
  const kit=kits.docs.find(d=>d.data().nome==='Kit piloto comum');
  expect(kit.data().unidadeIds).toEqual(['area-parque-infantil']);
  expect(kit.data().plantaId).toBe(LIRIOS_PLANTA_ID);
  await expect(getDocFromServer(doc(db(pointing),kit.ref.path))).rejects.toMatchObject({code:'permission-denied'});
  await expect(getDocFromServer(doc(db(pointing),mapPath(stock)))).rejects.toMatchObject({code:'permission-denied'});
  const own=(await getDocFromServer(doc(db(pointing),mapPath(pointing)))).data();
  expect(own.marcacoes).toEqual({});
  await expect(setDoc(doc(db(pointing),`usuarios/${pointing.uid}`),{schemaVersion:1,userId:pointing.uid,email:pointing.email,tipoConta:'estoque'})).rejects.toMatchObject({code:'permission-denied'});
});
