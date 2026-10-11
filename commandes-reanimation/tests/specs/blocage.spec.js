const { test } = require('@playwright/test');
const { ouvrir, saisir, expect } = require('./outils');

async function preparer(page){
  await ouvrir(page, 'solutes');
  await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 1);
  await page.fill('#signature', 'Durand');
}

test('impression refusée par le navigateur : comptage conservé, bouton réutilisable', async ({ page }) => {
  // window.print() ignoré (aucun beforeprint) : cas d'une annulation récente
  await page.addInitScript(() => { window.__appels = 0; window.print = () => { window.__appels++; }; });
  await preparer(page);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('.toast')).toContainText('comptage est conservé', { timeout: 30000 });
  expect(await page.evaluate(() => items.find(i => i.ref === 'sol3171').inventaire)).toBe(1);
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(0);
  await expect(page.locator('#btnPrint')).toBeEnabled();
  // le bouton répond de nouveau immédiatement
  await page.click('#btnPrint');
  await expect(page.locator('#confirmDlg')).toBeVisible();
});

test('copie de secours impossible : la commande reste possible après confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => { dispatchEvent(new Event('beforeprint')); dispatchEvent(new Event('afterprint')); };
    window.addEventListener('DOMContentLoaded', () => { window.chargerVendor = () => Promise.reject(new Error('pdf-lib absent')); });
  });
  await preparer(page);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('#confirmDlg')).toContainText('copie de secours', { timeout: 15000 });
  await page.click('#dlgOk');
  await expect(page.locator('#confirmDlg')).toContainText('bien été imprimée', { timeout: 15000 });
  await page.click('#dlgOk');
  await expect.poll(() => page.evaluate(() => historiqueCommandes().length)).toBe(1);
});

test('stockage qui ne répond pas : pas de bouton grisé indéfiniment', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => { dispatchEvent(new Event('beforeprint')); dispatchEvent(new Event('afterprint')); };
    window.addEventListener('DOMContentLoaded', () => {
      window.secoursCommande.save = () => new Promise(() => {}); // ne répond jamais
      window.__DELAI_SECOURS_MS = 1500;
    });
  });
  await preparer(page);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('#confirmDlg')).toContainText('copie de secours', { timeout: 15000 });
  await page.click('#dlgCancel');
  await expect(page.locator('#btnPrint')).toBeEnabled();
});

test('annulation de la fenêtre d’impression : « Non » conserve le comptage', async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { dispatchEvent(new Event('beforeprint')); dispatchEvent(new Event('afterprint')); }; });
  await preparer(page);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('#confirmDlg')).toContainText('bien été imprimée', { timeout: 15000 });
  await page.click('#dlgCancel');
  expect(await page.evaluate(() => items.find(i => i.ref === 'sol3171').inventaire)).toBe(1);
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(0);
  await expect(page.locator('#signature')).toHaveValue('Durand');
});

test('Android : séquence sans retour du service d’impression, déblocage proposé', async ({ page }) => {
  await page.addInitScript(() => {
    window.AndroidBridge = { getDirectory: () => 'C', chooseDirectory(){}, writeFile: (m, c, n) => n, openFile: () => 'ok', close(){}, printPage(){} };
    window.__DELAI_SEQUENCE_MS = 1000;
  });
  await preparer(page);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await page.waitForTimeout(1500);
  await page.click('#btnPrint');
  await expect(page.locator('#confirmDlg')).toContainText('ne s’est pas terminée');
  await page.click('#dlgOk');
  await expect(page.locator('#confirmDlg')).toContainText('Passer la commande');
});

test('libellé « Commander » sur les trois modules', async ({ page }) => {
  for (const m of ['solutes', 'materiel_reanimation', 'aide_soignant']) {
    await ouvrir(page, m);
    await expect(page.locator('#btnPrint')).toHaveText('Commander');
  }
});
