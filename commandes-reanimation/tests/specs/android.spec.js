const { test } = require('@playwright/test');
const { url, suivreErreurs, ouvrir, carte, saisir, expect } = require('./outils');

/* Pont natif simulé : mêmes méthodes que MainActivity.Pont. */
async function simulerAndroid(page, dossier = 'Commandes'){
  await page.addInitScript(d => {
    window.__fichiers = [];
    window.__ouverts = [];
    window.__impressions = [];
    window.AndroidBridge = {
      getDirectory: () => d,
      chooseDirectory: () => setTimeout(() => window.dispatchEvent(new CustomEvent('androiddossier', { detail: 'Commandes' })), 10),
      writeFile: (module, categorie, nom, base64) => { window.__fichiers.push({ module, categorie, nom, taille: base64.length }); return `${d}/${module}/${categorie}/${nom}`; },
      openFile: (module, categorie, nom) => { window.__ouverts.push(nom); return 'ok'; },
      printPage: titre => { window.__impressions.push(titre); setTimeout(() => window.dispatchEvent(new CustomEvent('androidprintfinished', { detail: titre })), 20); },
      close: () => { window.__ferme = true; },
    };
  }, dossier);
}

test('Android : impression, archivage, publication et édition de secours', async ({ page }) => {
  const erreurs = suivreErreurs(page);
  await simulerAndroid(page);
  await ouvrir(page, 'solutes');
  await expect(page.locator('#btnCamera')).toBeVisible();
  await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 1);
  await page.fill('#signature', 'Tablette');
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('.toast')).toContainText('historique', { timeout: 15000 });
  expect(await page.evaluate(() => window.__impressions.length)).toBe(1);
  await page.waitForTimeout(2000);
  const fichiers = await page.evaluate(() => window.__fichiers.map(f => `${f.module}/${f.categorie}/${f.nom.replace(/_\d{8}_\d{6}/, '')}`));
  expect(fichiers).toEqual(expect.arrayContaining(['Solutés/PDF/Commande_Solutes.pdf', 'Solutés/Application/donnees-solutes.js']));
  await page.click('#btnEditionSecours');
  await expect.poll(() => page.evaluate(() => window.__ouverts)).toEqual(['Commande_Solutes_Edition_secours.pdf']);
  expect(erreurs).toEqual([]);
});

test('Android : sans dossier choisi, le choix est proposé avant d’enregistrer', async ({ page }) => {
  await simulerAndroid(page, '');
  await ouvrir(page, 'aide_soignant');
  const resultat = page.evaluate(() => window.WindowsStorage.save('Sauvegardes', 'essai.json', new Blob(['{}'])).then(r => r.path, e => 'erreur: ' + e.message));
  await expect(page.locator('#confirmDlg')).toContainText('Choisir le dossier Commandes');
  await page.click('#dlgOk');
  await expect(resultat).resolves.toBe('/Magasin/Sauvegardes/essai.json');
});

test('Android : liste papier affichée dans la page dédiée, retour au module', async ({ page }) => {
  await simulerAndroid(page);
  await ouvrir(page, 'materiel_reanimation');
  await page.click('#btnModeDegrade');
  await page.click('#paperOpen');
  await page.waitForURL(/papier\.html/);
  await expect(page.locator('h1')).toContainText('Matériel');
  await page.click('.toolbar button');
  expect(await page.evaluate(() => window.__impressions.length)).toBe(1);
  await page.goBack();
  await page.waitForSelector('#list .item');
});

test('Android : bouton Retour ferme d’abord le panneau ouvert', async ({ page }) => {
  await simulerAndroid(page);
  await ouvrir(page, 'solutes');
  await page.click('#btnHistorique');
  expect(await page.evaluate(() => window.CommandesRetour())).toBe(true);
  await expect(page.locator('#histPanel')).toBeHidden();
});

test('Android : affichage simplifié, toutes les références d’emblée', async ({ page }) => {
  await simulerAndroid(page);
  await ouvrir(page, 'materiel_reanimation');
  await expect(page.locator('#filterSelectRow')).toBeHidden();
  await expect(page.locator('#btnSansDotation')).toBeHidden();
  await expect(page.locator('#vueSelecteur')).toBeHidden();
  await expect(page.locator('#vueCountTous')).toHaveText('319');
  await expect(page.locator('#list .item')).toHaveCount(319);
  // après une réinitialisation, toujours toutes les références
  await page.evaluate(() => remettreAZero());
  await expect(page.locator('#vueCountTous')).toHaveText('319');
  // le récapitulatif mène au premier non compté sans changer de vue
  await saisir(page, 'CATHETER HEMODIALYSE 15CM', 0);
  await page.fill('#signature', 'Mobile');
  await page.click('#btnPrint');
  await page.click('#confirmDlg [data-recap=prochain]');
  await expect(page.locator('#list .item')).toHaveCount(319);
  await expect(page.locator('#list .item input:focus')).toHaveCount(1);
});
