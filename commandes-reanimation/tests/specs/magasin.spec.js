const { test } = require('@playwright/test');
const { ouvrir, expect } = require('./outils');

test('Magasin : champ Localisation magasin, commande triée en ordre alphabétique et numérique', async ({ page }) => {
  await ouvrir(page, 'aide_soignant');
  await expect(page.locator('label', { has: page.locator('#fType') })).toContainText('Localisation magasin');
  await expect(page.locator('#typeFilter option').first()).toHaveText('Toutes les localisations magasin');
  const ordre = await page.evaluate(() => {
    const avecDotation = items.filter(it => it.dotation > 0).slice(0, 5);
    ['B1', 'A10', '', 'A2', 'a3'].forEach((t, i) => { avecDotation[i].type = t; avecDotation[i].inventaire = 0; });
    return lotsDemandes('tous')[0].liste.filter(it => avecDotation.includes(it)).map(it => libelleGroupeImpression(it, 'type'));
  });
  expect(ordre).toEqual(['A2', 'a3', 'A10', 'B1', 'Sans localisation magasin']);
  const note = await page.evaluate(() => NOTE_NORMAL);
  expect(note).toContain('LOCALISATION MAGASIN');
});
