const { test } = require('@playwright/test');
const { url, suivreErreurs, ouvrir, expect } = require('./outils');

test('mode d’emploi intégré : version, images, sommaire et retour', async ({ page }) => {
  const erreurs = suivreErreurs(page);
  await page.goto(url('index.html'));
  await page.click('a.lien-mode-emploi');
  await expect(page.locator('.aide-texte h2').first()).toHaveText('1. Présentation');
  const version = await page.evaluate(() => document.querySelector('meta[name="application-version"]').content);
  await expect(page.locator('.masthead .eyebrow')).toContainText(version);
  const images = await page.locator('.aide-texte img').evaluateAll(imgs => Promise.all(imgs.map(i => {
    i.loading = 'eager';
    return i.complete ? i.naturalWidth : new Promise(r => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); });
  })));
  expect(images.length).toBeGreaterThan(20);
  expect(images.filter(l => !l)).toHaveLength(0);
  expect(await page.locator('.aide-sommaire a').count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator('.aide-texte')).toContainText('Cliquez sur Commander');
  await page.click('#aideRetour');
  await expect(page).toHaveURL(/index\.html/);
  expect(erreurs).toEqual([]);
});

test('mode d’emploi depuis l’aide d’un module : retour au module', async ({ page }) => {
  await ouvrir(page, 'materiel_reanimation');
  await page.click('#btnAide');
  await page.click('#aidePanel a.lien-aide');
  await expect(page.locator('.aide-texte')).toBeVisible();
  await page.click('#aideRetour');
  await expect(page).toHaveURL(/Commande_Materiel_Reanimation\.html/);
  await expect(page.locator('#list .item').first()).toBeVisible();
});
