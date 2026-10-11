const path = require('path');
const fs = require('fs');
const os = require('os');
const { expect } = require('@playwright/test');

const WEB = path.resolve(__dirname, '../../web');
const url = page => 'file://' + path.join(WEB, page);

const PAGES = {
  solutes: 'Commande_Solutes.html',
  materiel_reanimation: 'Commande_Materiel_Reanimation.html',
  aide_soignant: 'Commande_Aide_Soignant.html',
};

/* Erreurs JavaScript de la page, hors fichier optionnel C:\commandes absent. */
function suivreErreurs(page){
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => {
    if(m.type() === 'error' && !/commandes|ERR_FILE_NOT_FOUND|Failed to load resource/i.test(m.text())) erreurs.push(m.text());
  });
  return erreurs;
}

/* Impression simulée : la fenêtre d'impression se « ferme » aussitôt. */
async function simulerImpression(page){
  await page.addInitScript(() => {
    window.__impressions = 0;
    // Comme Edge : window.print() bloque jusqu'à la fermeture de la fenêtre d'impression.
    window.print = () => { window.__impressions++; window.dispatchEvent(new Event('beforeprint')); window.dispatchEvent(new Event('afterprint')); };
  });
}

/* Répond « Oui » à « Commande imprimée ? » (poste Windows). */
async function confirmerImpression(page){
  await expect(page.locator('#confirmDlg')).toContainText('bien été imprimée', { timeout: 15000 });
  await page.click('#dlgOk');
}

async function ouvrir(page, module, options = {}){
  if(options.dossierPoste) await page.addInitScript(d => { window.COMMANDES_DOSSIER_POSTE = d; }, options.dossierPoste);
  await page.goto(url(PAGES[module] || module));
  await page.waitForFunction(() => document.querySelector('#list .item, #list .empty-state, .app-card'));
}

function carte(page, denom){
  return page.locator('#list .item', { has: page.locator(`.item-name[title="${denom}"]`) });
}

async function saisir(page, denom, valeur){
  const champ = carte(page, denom).locator('input[type=number]');
  await champ.fill(String(valeur));
  await champ.dispatchEvent('change');
}

function dossierTemporaire(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'commandes-'));
}

module.exports = { WEB, url, PAGES, suivreErreurs, simulerImpression, confirmerImpression, ouvrir, carte, saisir, dossierTemporaire, expect };
