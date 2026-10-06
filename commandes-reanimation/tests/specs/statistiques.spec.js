const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { simulerImpression, ouvrir, saisir, dossierTemporaire, expect } = require('./outils');

async function imprimerAvec(page, signature){
  await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 1);
  await page.fill('#signature', signature);
  await page.click('#btnPrint');
  await page.click('#dlgOk');
  await expect(page.locator('.toast')).toContainText('Les compteurs sont remis à zéro', { timeout: 15000 });
  await page.waitForTimeout(300);
}

test('commande signée « essai » : imprimée mais hors historique, statistiques et signataires', async ({ page }) => {
  await simulerImpression(page);
  await ouvrir(page, 'solutes');
  await saisir(page, 'BICARBONATE 1,4% 500ML POCHE', 1);
  await page.fill('#signature', 'Essai Martin');
  await page.click('#btnPrint');
  await expect(page.locator('#confirmDlg')).toContainText('Commande d’essai');
  await page.click('#dlgOk');
  await expect(page.locator('.toast')).toContainText('non enregistrée dans l’historique', { timeout: 15000 });
  expect(await page.evaluate(() => window.__impressions)).toBe(1);
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(0);
  expect(await page.evaluate(() => signataires())).toEqual([]);

  await imprimerAvec(page, 'Durand');
  expect(await page.evaluate(() => historiqueCommandes().map(h => h.signature))).toEqual(['Durand']);
  // « Essaim » ou « Pessaint » ne sont pas des essais
  expect(await page.evaluate(() => [estCommandeEssai('ESSAI'), estCommandeEssai('essais formation'), estCommandeEssai('Pessaint'), estCommandeEssai('Essaim')])).toEqual([true, true, false, false]);
});

test('anciennes commandes d’essai ignorées à la lecture de l’historique', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('commandes-historique:solutes', JSON.stringify([
    { id: 'a', date: '2026-09-01T08:00:00.000Z', signature: 'essai', lignes: [] },
    { id: 'b', date: '2026-09-02T08:00:00.000Z', signature: 'Léa', lignes: [] },
  ])));
  await ouvrir(page, 'solutes');
  expect(await page.evaluate(() => historiqueCommandes().map(h => h.id))).toEqual(['b']);
});

test('administrateur : remise à zéro des statistiques, sans retour par la publication du poste', async ({ page }) => {
  await simulerImpression(page);
  const dossier = dossierTemporaire();
  const rep = path.join(dossier, 'Solutés', 'Application');
  fs.mkdirSync(rep, { recursive: true });
  // Une publication plus ancienne contient encore une commande
  fs.writeFileSync(path.join(rep, 'donnees-solutes.js'), `window.CommandesDonneesPoste={solutes:${JSON.stringify({
    module: 'solutes', enregistreLe: '2026-09-01T00:00:00.000Z',
    historique: [{ id: 'ancienne', date: '2026-09-01T08:00:00.000Z', signature: 'Ancien', lignes: [] }]
  })}};`);
  await ouvrir(page, 'solutes', { dossierPoste: 'file://' + dossier + '/' });
  await imprimerAvec(page, 'Durand');
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(2);

  await page.evaluate(() => { adminUnlocked = true; openAdminPanel(); });
  await page.click('#adminRazHistorique');
  await expect(page.locator('#confirmDlg')).toContainText('2 commande(s)');
  await page.click('#dlgOk');
  await expect(page.locator('.toast')).toContainText('remises à zéro');
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(0);
  expect(await page.evaluate(() => donneesPoste().historiqueRemisAZeroLe)).toBeTruthy();

  // Réouverture : la publication ancienne ne réintroduit pas la commande effacée
  await page.reload();
  await page.waitForSelector('#list .item');
  expect(await page.evaluate(() => historiqueCommandes().length)).toBe(0);
  // et une nouvelle commande est de nouveau enregistrée
  await imprimerAvec(page, 'Léa');
  expect(await page.evaluate(() => historiqueCommandes().map(h => h.signature))).toEqual(['Léa']);
});
