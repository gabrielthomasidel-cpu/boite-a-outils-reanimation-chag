const { test } = require('@playwright/test');
const { ouvrir, expect } = require('./outils');

test('Magasin : champ Localisation magasin, commande A pair, A impair… puis vides, puis Cuisine', async ({ page }) => {
  await ouvrir(page, 'aide_soignant');
  await expect(page.locator('label', { has: page.locator('#fType') })).toContainText('Localisation magasin');
  await expect(page.locator('#typeFilter option').first()).toHaveText('Toutes les localisations magasin');
  const ordre = await page.evaluate(() => {
    const avecDotation = items.filter(it => it.dotation > 0).slice(0, 9);
    ['Cuisine', 'B impair', '', 'A impair', 'B pair', 'A pair', 'A10', 'A2', 'F'].forEach((t, i) => { avecDotation[i].type = t; avecDotation[i].inventaire = 0; });
    return lotsDemandes('tous')[0].liste.filter(it => avecDotation.includes(it)).map(it => libelleGroupeImpression(it, 'type'));
  });
  expect(ordre).toEqual(['A pair', 'A impair', 'A2', 'A10', 'B pair', 'B impair', 'F', 'Sans localisation magasin', 'Cuisine']);
  expect(await page.evaluate(() => NOTE_NORMAL)).toContain('LOCALISATION MAGASIN');
});

test('Magasin : catalogue livré en localisations pair / impair', async ({ page }) => {
  await ouvrir(page, 'aide_soignant');
  const types = await page.evaluate(() => [...new Set(CATALOGUE.map(it => it.type))]);
  expect(types).toContain('A pair');
  expect(types).toContain('B impair');
  expect(types.some(t => /\d/.test(t))).toBe(false);
});

test('Magasin : localisation magasin absente de l’écran de comptage, tri conservé', async ({ page }) => {
  await ouvrir(page, 'aide_soignant');
  await expect(page.locator('#list .subgroup-title')).toHaveCount(0);
  await expect(page.locator('#typeFilter')).toBeHidden();
  const texte = await page.locator('#list').innerText();
  expect(texte).not.toMatch(/\b[A-I] (pair|impair)\b/);
  // Dans une zone, les articles restent rangés par localisation magasin.
  const ordreRespecte = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#list .item')].map(e => Number(e.dataset.id));
    const liste = ids.map(id => items.find(it => it.id === id));
    return liste.every((it, i) => i === 0 || liste[i - 1].loc !== it.loc || cmpLocalisationMagasin(liste[i - 1].type, it.type) <= 0);
  });
  expect(ordreRespecte).toBe(true);
});
