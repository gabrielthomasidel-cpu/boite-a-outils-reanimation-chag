const { test } = require('@playwright/test');
const { url, PAGES, suivreErreurs, ouvrir, carte, saisir, expect } = require('./outils');

test.describe('Chargement', () => {
  for (const page of ['index.html', ...Object.values(PAGES)]) {
    test(`${page} s'ouvre sans erreur JavaScript`, async ({ page: p }) => {
      const erreurs = suivreErreurs(p);
      await p.goto(url(page));
      await p.waitForTimeout(500);
      expect(erreurs).toEqual([]);
    });
  }

  test('les catalogues livrés gardent leur empreinte 2.6 (catalogues modifiés conservés)', async ({ page }) => {
    const attendu = { solutes: '24-lfxkfu', materiel_reanimation: '319-1216wn2', aide_soignant: '80-1cygemw' };
    for (const [module, empreinte] of Object.entries(attendu)) {
      await ouvrir(page, module);
      expect(await page.evaluate(() => EMPREINTE_LIVREE)).toBe(empreinte);
    }
  });
});

test.describe('Règles de calcul', () => {
  test('dotation, seuil, Hors Stock et saisie libre', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const r = await page.evaluate(() => {
      const a = (o) => ({ dotation: 4, seuil: null, qteCommande: null, type: '', loc: 'Z', inventaire: null, commandeLibre: null, ...o });
      return {
        nonCompte: commandeOf(a({})),
        complement: commandeOf(a({ inventaire: 1 })),
        plein: commandeOf(a({ inventaire: 4 })),
        auDessusSeuil: commandeOf(a({ seuil: 2, inventaire: 3 })),
        auSeuil: commandeOf(a({ seuil: 2, inventaire: 2 })),
        horsStock: commandeOf(a({ type: 'Hors Stock', dotation: 5, seuil: 1, inventaire: 1 })),
        imposee: commandeOf(a({ seuil: 2, qteCommande: 12, inventaire: 0 })),
        libre: commandeOf(a({ dotation: 0, commandeLibre: 7 })),
        borne: quantiteEntiere(123456),
      };
    });
    expect(r).toEqual({ nonCompte: 0, complement: 3, plein: 0, auDessusSeuil: 0, auSeuil: 2, horsStock: 5, imposee: 12, libre: 7, borne: 9999 });
  });

  test('Matériel : quantité imposée doublée en rupture complète', async ({ page }) => {
    await ouvrir(page, 'materiel_reanimation');
    const r = await page.evaluate(() => {
      const a = { dotation: 4, seuil: 2, qteCommande: 12, type: '', loc: 'Z', inventaire: 0, commandeLibre: null };
      return [commandeOf(a), commandeOf({ ...a, inventaire: 1 })];
    });
    expect(r).toEqual([24, 12]);
  });
});

test.describe('Comptage', () => {
  test('« non compté » se distingue d’un stock compté à 0', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const c = carte(page, 'BICARBONATE 1,4% 500ML POCHE');
    await expect(c.locator('input')).toHaveValue('');
    await expect(c.locator('.commande-badge')).toHaveText('À compter');
    await expect(c).not.toHaveClass(/(^|\s)counted(\s|$)/);
    await c.locator('button[data-act=dec]').click();
    await expect(c.locator('input')).toHaveValue('0');
    await expect(c).toHaveClass(/(^|\s)counted(\s|$)/);
    await expect(c.locator('.commande-badge')).toHaveText('Commander 6');
    await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 6);
    await expect(c.locator('.commande-badge')).toHaveText('Stock OK');
  });

  test('garde-fou : quantité très supérieure à la dotation signalée', async ({ page }) => {
    await ouvrir(page, 'solutes');
    await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 60);
    const c = carte(page, 'BICARBONATE 1,4% 500ML POCHE');
    await expect(c).toHaveClass(/has-warning/);
    await expect(c.locator('.item-warning')).toContainText('60 en stock pour une dotation de 6');
    await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 5);
    await expect(c).not.toHaveClass(/has-warning/);
  });

  test('vues Tous / À compter / À commander et compteurs', async ({ page }) => {
    await ouvrir(page, 'solutes');
    await expect(page.locator('#vueCountACompter')).toHaveText('24');
    await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 2);
    await saisir(page, 'BICARBONATE 4,2% 250ML VERRE', 5);
    await expect(page.locator('#vueCountACompter')).toHaveText('22');
    await expect(page.locator('#vueCountACommander')).toHaveText('1');
    await page.click('#vueSelecteur [data-vue=aCommander]');
    await expect(page.locator('#list .item')).toHaveCount(1);
    await page.click('#vueSelecteur [data-vue=aCompter]');
    await expect(page.locator('#list .item')).toHaveCount(22);
    await page.click('#vueSelecteur [data-vue=tous]');
    await expect(page.locator('#list .item')).toHaveCount(24);
  });

  test('navigation par zone et prochain article à compter', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const chips = page.locator('#zoneNav .zone-chip');
    await expect(chips).toHaveCount(2);
    await chips.filter({ hasText: 'Salle Matériel' }).click();
    await page.waitForTimeout(600);
    const top = await page.locator('#list .group-title[data-loc="Salle Matériel"]').evaluate(e => e.getBoundingClientRect().top);
    expect(top).toBeLessThan(400);
    await page.click('#btnNextUncounted');
    const actif = await page.evaluate(() => document.activeElement.closest('.item') && document.activeElement.closest('.item').querySelector('.item-name').title);
    expect(actif).toBeTruthy();
  });

  test('Matériel : articles sans dotation masqués puis affichables', async ({ page }) => {
    await ouvrir(page, 'materiel_reanimation');
    await expect(page.locator('#btnSansDotation')).toHaveText('Afficher sans dotation (68)');
    await expect(page.locator('#vueCountTous')).toHaveText('251');
    await page.click('#btnSansDotation');
    await expect(page.locator('#vueCountTous')).toHaveText('319');
    await expect(page.locator('#btnSansDotation')).toHaveText('Masquer sans dotation (68)');
  });

  test('scan à la douchette : article trouvé puis référence inconnue', async ({ page }) => {
    await ouvrir(page, 'solutes');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.type('002417', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect(page.locator('#list .item')).toHaveCount(1);
    const focus = await page.evaluate(() => document.activeElement.closest('.item').querySelector('.item-name').title);
    expect(focus).toBe('BICARBONATE 4,2% 250ML VERRE');
    // La douchette protège la case pendant 320 ms contre une double fin de ligne.
    await page.waitForTimeout(400);
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(page.locator('#search')).toBeFocused();
    await page.keyboard.type('999999', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect(page.locator('.scan-error')).toContainText('Référence inconnue');
    expect(await page.evaluate(() => items.find(i => i.codeBarres === '002417').inventaire)).toBe(3);
  });

  test('le comptage est restauré après réouverture', async ({ page }) => {
    await ouvrir(page, 'aide_soignant');
    await saisir(page, 'Alèses paquet de 60', 1);
    await page.fill('#signature', 'Martin');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('#list .item');
    await expect(page.locator('#restoreBanner')).toHaveClass(/show/);
    await expect(carte(page, 'Alèses paquet de 60').locator('input')).toHaveValue('1');
    await expect(page.locator('#signature')).toHaveValue('Martin');
  });

  test('« Rempli par » signalé tant qu’il est vide', async ({ page }) => {
    await ouvrir(page, 'solutes');
    await expect(page.locator('#sigRow')).toHaveClass(/is-required/);
    await page.fill('#signature', 'Dupont');
    await expect(page.locator('#sigRow')).not.toHaveClass(/is-required/);
  });

  test('casse adaptée des noms, référence inchangée, bascule mémorisée', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const nom = carte(page, 'NACL 0,9% 250ML POCHE').locator('.item-name');
    await expect(nom).toHaveText('NaCl 0,9% 250 mL poche');
    await page.click('#btnCasse');
    await expect(nom).toHaveText('NACL 0,9% 250ML POCHE');
    await page.reload();
    await expect(carte(page, 'NACL 0,9% 250ML POCHE').locator('.item-name')).toHaveText('NACL 0,9% 250ML POCHE');
  });
});
