const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { url, suivreErreurs, simulerImpression, ouvrir, carte, saisir, dossierTemporaire, expect } = require('./outils');

async function imprimer(page){
  await page.click('#btnPrint');
  await expect(page.locator('#confirmDlg')).toBeVisible();
  await page.click('#dlgOk');
}

test.describe('Impression et historique', () => {
  test('cycle complet : récapitulatif, historique, remise à zéro, accueil', async ({ page }) => {
    const erreurs = suivreErreurs(page);
    await simulerImpression(page);
    await ouvrir(page, 'solutes');
    await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 2);
    await saisir(page, 'GLUCOSE 5% 100ML POCHE', 80);
    await saisir(page, 'MANNITOL 20% 500ML POCHE', 0);

    await page.click('#btnPrint');
    await expect(page.locator('.toast')).toContainText('Rempli par');
    await page.fill('#signature', 'Martin Infirmier');

    await page.click('#btnPrint');
    const dlg = page.locator('#confirmDlg');
    await expect(dlg).toContainText('2 article(s) à commander');
    await expect(dlg).toContainText('ne sont pas comptés');
    await expect(dlg).toContainText('quantité(s) inhabituelle(s)');
    await page.click('#dlgOk');

    await expect(page.locator('.toast')).toContainText('historique', { timeout: 15000 });
    expect(await page.evaluate(() => window.__impressions)).toBe(1);
    await expect(page.locator('#vueCountACommander')).toHaveText('0');
    await expect(page.locator('#signature')).toHaveValue('');

    const histo = await page.evaluate(() => historiqueCommandes());
    expect(histo).toHaveLength(1);
    expect(histo[0].signature).toBe('Martin Infirmier');
    expect(histo[0].lignes.map(l => [l.ref, l.commande])).toEqual(expect.arrayContaining([['3171', 4]]));

    // Signataire mémorisé et proposé
    expect(await page.locator('#signatureList option').first().getAttribute('value')).toBe('Martin Infirmier');

    // Panneau historique + synthèse
    await page.click('#btnHistorique');
    await expect(page.locator('#histPanel')).toBeVisible();
    await expect(page.locator('.hist-commande').first()).toContainText('Martin Infirmier');
    await page.click('#histOnglets [data-hist=synthese]');
    await expect(page.locator('.hist-table')).toContainText('3171');
    await page.keyboard.press('Escape');
    await expect(page.locator('#histPanel')).toBeHidden();

    // Accueil : dernière commande affichée
    await page.goto(url('index.html'));
    await expect(page.locator('.app-card').first()).toContainText('Dernière commande');
    expect(erreurs).toEqual([]);
  });

  test('Matériel : deux travaux d’impression séparés', async ({ page }) => {
    await simulerImpression(page);
    await ouvrir(page, 'materiel_reanimation');
    const horsStock = await page.evaluate(() => items.find(i => isHorsStock(i) && i.dotation > 0).denom);
    await saisir(page, 'CATHETER HEMODIALYSE 15CM', 0);
    await page.fill('#search', horsStock);
    await page.waitForTimeout(200);
    await saisir(page, horsStock, 0);
    await page.fill('#signature', 'Durand');
    await page.click('#btnPrint');
    await expect(page.locator('#confirmDlg')).toContainText('Deux validations');
    await page.click('#dlgOk');
    await expect(page.locator('#postPrintDlg')).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => window.__impressions)).toBe(2);
    await page.click('#postPrintStay');
    expect(await page.evaluate(() => historiqueCommandes().length)).toBe(1);
  });

  test('accueil : comptage en cours affiché par module', async ({ page }) => {
    await ouvrir(page, 'aide_soignant');
    await saisir(page, 'Alèses paquet de 60', 0);
    await page.fill('#signature', 'Léa');
    await page.waitForTimeout(500);
    await page.goto(url('index.html'));
    const magasin = page.locator('.app-card', { hasText: 'Commande Magasin' });
    await expect(magasin).toContainText('En cours');
    await expect(magasin).toContainText('1 / 80 comptés');
    await expect(magasin).toContainText('par Léa');
    await expect(page.locator('#homeResume')).toContainText('1 comptage en cours');
  });
});

test.describe('Catalogue', () => {
  test('contrôle d’intégrité : doublons et incohérences détectés', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const r = await page.evaluate(() => {
      const base = items.slice(0, 3).map(i => ({ ...i }));
      base[1].ref = base[0].ref;
      base[2].codeBarres = base[0].codeBarres;
      base[2].seuil = 99;
      return verifierCatalogue(base).map(c => [c.niveau, c.titre]);
    });
    const titres = r.map(x => x[1]).join(' | ');
    expect(titres).toContain('en double');
    expect(titres).toContain('Seuil supérieur ou égal à la dotation');
    expect(r.filter(x => x[0] === 'erreur').length).toBeGreaterThanOrEqual(2);
  });

  test('catalogue livré sans erreur bloquante', async ({ page }) => {
    for (const module of ['solutes', 'materiel_reanimation', 'aide_soignant']) {
      await ouvrir(page, module);
      const r = await page.evaluate(() => resumeConstats(verifierCatalogue(items)));
      expect.soft(r, module).toBeDefined();
    }
  });

  test('administration : mot de passe, ajout d’article, import contrôlé', async ({ page }) => {
    await ouvrir(page, 'aide_soignant');
    await page.evaluate(() => ecrireJsonLocal(`commande-${CSV_MODULE}:mot-de-passe`, { empreinte: hashPwd('secret123'), enregistreLe: new Date().toISOString() }));
    await page.click('#btnAdmin');
    await page.fill('#pwdInput', 'mauvais');
    await page.click('#pwdOk');
    await expect(page.locator('#pwdFeedback')).toHaveText('Mot de passe incorrect.');
    await page.fill('#pwdInput', 'secret123');
    await page.click('#pwdOk');
    await expect(page.locator('#adminPanel')).toBeVisible();

    await page.click('#adminAddBtn');
    await page.fill('#fRef', '1809');
    await page.fill('#fDenom', 'Doublon');
    await page.click('#itemFormSave');
    await expect(page.locator('#itemFormFeedback')).toContainText('déjà utilisée');
    await page.fill('#fRef', '77777');
    await page.fill('#fLoc', 'Office');
    await page.fill('#fDotation', '4');
    await page.click('#itemFormSave');
    await expect(page.locator('#adminCount')).toHaveText('81');

    const fichier = path.join(dossierTemporaire(), 'catalogue.json');
    fs.writeFileSync(fichier, JSON.stringify({ format: 'catalogue', version: '1', module: 'aide_soignant',
      items: [{ ref: '1', denom: 'A', loc: 'X', dotation: 2 }, { ref: '1', denom: 'B', loc: 'X', dotation: 3 }] }));
    await page.click('#adminImportBtn');
    await page.click('#formatOk');
    await page.setInputFiles('#adminImportFile', fichier);
    await expect(page.locator('#confirmDlg')).toContainText('Référence 1 en double');
    await expect(page.locator('#dlgOk')).toHaveText('Importer malgré les erreurs');
    await page.click('#dlgCancel');
    await expect(page.locator('#adminCount')).toHaveText('81');
  });
});

test.describe('Données du poste (C:\\commandes)', () => {
  function publier(dossier, module, dossierWindows, donnees){
    const rep = path.join(dossier, dossierWindows, 'Application');
    fs.mkdirSync(rep, { recursive: true });
    fs.writeFileSync(path.join(rep, `donnees-${module}.js`),
      `window.CommandesDonneesPoste = window.CommandesDonneesPoste || {};\nwindow.CommandesDonneesPoste[${JSON.stringify(module)}] = ${JSON.stringify(donnees)};\n`);
  }

  test('reprise automatique du catalogue, de l’historique et du mot de passe publiés', async ({ page }) => {
    const dossier = dossierTemporaire();
    await ouvrir(page, 'solutes');
    const base = await page.evaluate(() => ({ empreinte: EMPREINTE_LIVREE, articles: catalogueSansChampsRuntime(items) }));
    base.articles[0].dotation = 42;
    publier(dossier, 'solutes', 'Solutés', {
      format: 'donnees-poste', version: 1, module: 'solutes', enregistreLe: new Date().toISOString(),
      catalogue: { version: 1, enregistreLe: new Date().toISOString(), empreinteEmbarquee: base.empreinte, articles: base.articles },
      motDePasse: { empreinte: 'deadbeef', enregistreLe: new Date().toISOString() },
      historique: [{ id: 'h1', date: '2026-09-01T08:00:00.000Z', signature: 'Ancien poste', comptes: 1, total: 24, lignes: [{ ref: '3171', denom: 'X', commande: 3, dotation: 6, stock: 3 }] }]
    });
    const neuve = await page.context().browser().newPage();
    await ouvrir(neuve, 'solutes', { dossierPoste: 'file://' + dossier + '/' });
    expect(await neuve.evaluate(() => origineCatalogue)).toBe('poste-repris');
    expect(await neuve.evaluate(() => items[0].dotation)).toBe(42);
    expect(await neuve.evaluate(() => historiqueCommandes().map(h => h.signature))).toEqual(['Ancien poste']);
    expect(await neuve.evaluate(() => empreinteAdminActive())).toBe('deadbeef');
    await expect(neuve.locator('.toast')).toContainText('repris automatiquement');
    await neuve.close();
  });

  test('un catalogue publié pour une ancienne version livrée est ignoré', async ({ page }) => {
    const dossier = dossierTemporaire();
    publier(dossier, 'aide_soignant', 'Magasin', {
      module: 'aide_soignant', enregistreLe: new Date().toISOString(), historique: [],
      catalogue: { enregistreLe: new Date().toISOString(), empreinteEmbarquee: '1-ancien', articles: [{ ref: 'x', denom: 'x', loc: 'x', dotation: 1 }] }
    });
    await ouvrir(page, 'aide_soignant', { dossierPoste: 'file://' + dossier + '/' });
    expect(await page.evaluate(() => items.length)).toBe(80);
  });

  test('le fichier publié est un script relisible', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const script = await page.evaluate(() => scriptDonneesPoste(donneesPoste()));
    expect(script).toContain("window.CommandesDonneesPoste[\"solutes\"]");
    const contexte = { window: {} };
    new Function('window', script)(contexte.window);
    expect(contexte.window.CommandesDonneesPoste.solutes.module).toBe('solutes');
  });
});

test.describe('Échanges de fichiers', () => {
  test('catalogue CSV : aller-retour sans perte', async ({ page }) => {
    await ouvrir(page, 'solutes');
    const r = await page.evaluate(() => {
      const csv = csvDocument(CATALOG_HEADERS, catalogRows(new Date().toISOString()));
      const catalogue = catalogueFromTable(tabularRowsFor(csv, 'csv', 'catalogue'));
      return { nb: catalogue.length, code: catalogue.find(a => a.ref === 'sol242').codeBarres };
    });
    expect(r).toEqual({ nb: 24, code: '0000242' });
  });

  test('administration : plus de boutons Charger / Enregistrer la commande', async ({ page }) => {
    await ouvrir(page, 'solutes');
    await page.evaluate(() => { adminUnlocked = true; openAdminPanel(); });
    await expect(page.locator('#adminPanel')).toBeVisible();
    await expect(page.locator('#btnLoad, #btnSave, #fileInput')).toHaveCount(0);
    await expect(page.locator('#adminPanel .admin-panel-footer')).not.toContainText('la commande');
  });
});

test.describe('Noms de dossiers et de fichiers', () => {
  test('convention Nature_Module_horodatage pour chaque module', async ({ page }) => {
    const attendu = {
      solutes: ['Solutés', 'Commande_Solutes', 'Catalogue_Solutes', 'Donnees_Solutes.js'],
      materiel_reanimation: ['DM_Pharmacie', 'Commande_DM_Pharmacie', 'Catalogue_DM_Pharmacie', 'Donnees_DM_Pharmacie.js'],
      aide_soignant: ['Magasin', 'Commande_Magasin', 'Catalogue_Magasin', 'Donnees_Magasin.js'],
    };
    for (const [module, [dossier, commande, catalogue, donnees]] of Object.entries(attendu)) {
      await ouvrir(page, module);
      const r = await page.evaluate(() => [MODULE.dossierWindows, MODULE.racineFichiers, PORTABLE_MODULE_CONFIG.catalogStem, window.CommandesModules.fichierPoste(CSV_MODULE)]);
      expect(r).toEqual([dossier, commande, catalogue, donnees]);
    }
  });

  test('Matériel : enregistrements dans DM_Pharmacie avec les nouveaux noms', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fichiers = [];
      window.AndroidBridge = {
        getDirectory: () => 'Commandes', chooseDirectory(){}, openFile: () => 'ok', close(){},
        writeFile: (m, c, n) => { window.__fichiers.push(`${m}/${c}/${n}`); return n; },
        printPage: t => setTimeout(() => dispatchEvent(new CustomEvent('androidprintfinished')), 20),
      };
    });
    await ouvrir(page, 'materiel_reanimation');
    await page.evaluate(async () => { await exportCatalogue('json'); await publierDonneesPoste(); });
    const f = await page.evaluate(() => window.__fichiers.map(x => x.replace(/_\d{8}_\d{6}/, '_HORODATAGE')));
    expect(f).toEqual(['DM_Pharmacie/Application/Catalogue_DM_Pharmacie_HORODATAGE.json', 'DM_Pharmacie/Application/Donnees_DM_Pharmacie.js']);
  });

  test('données publiées : nouveau nom prioritaire, ancien nom toujours relu', async ({ page }) => {
    const dossier = dossierTemporaire();
    const rep = path.join(dossier, 'Magasin', 'Application');
    fs.mkdirSync(rep, { recursive: true });
    const ecrire = (nom, signature) => fs.writeFileSync(path.join(rep, nom),
      `window.CommandesDonneesPoste=window.CommandesDonneesPoste||{};window.CommandesDonneesPoste.aide_soignant=${JSON.stringify({ module: 'aide_soignant', historique: [{ id: signature, date: '2026-09-01T08:00:00.000Z', signature, lignes: [] }] })};`);
    ecrire('donnees-aide_soignant.js', 'Ancien nom');
    await ouvrir(page, 'aide_soignant', { dossierPoste: 'file://' + dossier + '/' });
    expect(await page.evaluate(() => historiqueCommandes().map(h => h.signature))).toEqual(['Ancien nom']);
    ecrire('Donnees_Magasin.js', 'Nouveau nom');
    const p2 = await page.context().newPage();
    await p2.addInitScript(() => localStorage.clear());
    await ouvrir(p2, 'aide_soignant', { dossierPoste: 'file://' + dossier + '/' });
    expect(await p2.evaluate(() => DONNEES_POSTE.historique[0].signature)).toBe('Nouveau nom');
  });
});
