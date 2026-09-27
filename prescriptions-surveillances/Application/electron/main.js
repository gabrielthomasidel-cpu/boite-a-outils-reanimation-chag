const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// L'API File System Access (showDirectoryPicker) est refusee sur file:// :
// on sert la page depuis 127.0.0.1, qui est un contexte securise.
// Dernier filet : une exception qui n'a trouve personne pour l'attraper ne doit
// pas faire disparaitre la fenetre au milieu d'une prescription. On la note dans
// le journal du poste de travail et l'application continue — la page, elle, sait
// deja refuser de se fermer tant qu'une saisie n'est pas ecrite.
function noterIncident(quoi, e) {
  try {
    const ligne = new Date().toISOString() + ' ' + quoi + ' : '
      + (e && e.stack ? e.stack : String(e)) + '\n';
    fs.appendFileSync(path.join(app.getPath('userData'), 'incidents.log'), ligne);
  } catch (ignore) { /* le journal n'est pas une raison de tomber non plus */ }
}
process.on('uncaughtException', (e) => noterIncident('exception non traitee', e));
process.on('unhandledRejection', (e) => noterIncident('promesse rejetee', e));

const APP_DIR = path.join(__dirname, 'app');
const STATE_FILE = path.join(app.getPath('userData'), 'fenetre.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

// Le port doit rester identique d'un lancement a l'autre : Chromium range
// l'autorisation du dossier des patients dans l'IndexedDB de l'origine, et
// http://127.0.0.1:<port> change d'origine des que le port change. Avec un port
// tire au hasard, le dossier etait a redesigner a chaque ouverture.
const PORT_FIXE = 47026;

function demarrerServeur() {
  return new Promise((resolve, reject) => {
    const serveur = http.createServer((req, res) => {
      // Une URL mal formee — /%ZZ — fait lever URIError a decodeURIComponent.
      // Sans ce filet, l'exception remontait au processus principal et pouvait
      // fermer l'application : elle vaut maintenant une reponse 400.
      let rel;
      try {
        rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Requete invalide');
        return;
      }
      if (rel === '/') rel = '/index.html';
      const fichier = path.join(APP_DIR, path.normalize(rel).replace(/^[\\/]+/, ''));
      // « est-il dans le dossier de l'application ? » se demande au systeme de
      // fichiers, pas a un prefixe de chaine : un dossier voisin nomme
      // « app-autre » commence lui aussi par « app ».
      const dedans = path.relative(APP_DIR, fichier);
      if (dedans && (dedans === '..' || dedans.startsWith('..' + path.sep) || path.isAbsolute(dedans))) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(fichier, (err, data) => {
        if (err) { res.writeHead(404).end('Introuvable'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    });
    serveur.once('error', (err) => {
      // port occupe par un autre logiciel : on repart sur un port libre, quitte a
      // perdre la permanence de l'autorisation pour cette seance
      if (err.code === 'EADDRINUSE') serveur.listen(0, '127.0.0.1');
      else reject(err);
    });
    serveur.on('listening', () => resolve(serveur.address().port));
    serveur.listen(PORT_FIXE, '127.0.0.1');
  });
}

// ---------------------------------------------------------------------------
// Apercu avant impression
// ---------------------------------------------------------------------------
// Electron n'a pas l'apercu de Chrome : webContents.print() ouvre directement la
// boite de dialogue de Windows. On produit donc le PDF avec le meme moteur que
// l'impression (printToPDF applique la feuille de style @media print), et on
// l'ouvre dans une fenetre : c'est le visualiseur PDF de Chromium, avec son
// propre bouton d'impression.
let fenetreApercu = null;
// la fenetre de l'application, pour la ramener devant quand la page pose une
// question : l'apercu est une fenetre a part, et il passe volontiers au-dessus
let fenetrePrincipale = null;

function nettoyerApercus(dossier) {
  try {
    fs.readdirSync(dossier)
      .filter((f) => /^apercu-(prescription-\d+\.pdf|source-\d+\.html)$/.test(f))
      .forEach((f) => { try { fs.unlinkSync(path.join(dossier, f)); } catch (e) {} });
  } catch (e) { /* sans importance */ }
}

// L'observation medicale vit dans un cadre, et printToPDF ne rend que le cadre
// principal. La page nous transmet donc son document d'impression deja mis en
// pages ; on le rend dans une fenetre invisible, le temps d'en tirer le PDF.
async function contenuAPeindre(webContents, options) {
  if (!options.html) return { source: webContents, fermer: () => {} };

  const page = path.join(app.getPath('temp'), 'apercu-source-' + Date.now() + '.html');
  fs.writeFileSync(page, options.html, 'utf8');
  const invisible = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false }
  });
  await invisible.loadFile(page);
  await new Promise((r) => setTimeout(r, 500));   // laisser la mise en pages se poser
  return {
    source: invisible.webContents,
    fermer: () => {
      try { invisible.destroy(); } catch (e) {}
      try { fs.unlinkSync(page); } catch (e) {}
    }
  };
}

// Meme rendu que l'apercu, mais le PDF est rendu a la page : elle l'ecrit
// elle-meme dans le dossier des patients, ou seule elle a l'autorisation.
async function pdfDuDocument(webContents, options) {
  const rendu = await contenuAPeindre(webContents, options);
  try {
    return await rendu.source.printToPDF({
      landscape: options.paysage !== false,
      pageSize: options.format || 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      scale: 1,
      preferCSSPageSize: true
    });
  } finally {
    rendu.fermer();
  }
}

// ---------------------------------------------------------------------------
// Impression sur papier : A3, paysage, recto verso bord court
// ---------------------------------------------------------------------------
// Ce qu'Electron ne sait pas faire, mesure a l'appui. Sur une vraie imprimante,
// file d'impression suspendue, en lisant le DEVMODE du travail remis au
// spouleur : l'orientation paysage est bien transmise, le FORMAT ne l'est
// jamais — Electron ne charge pas les capacites de l'imprimante, Chromium n'a
// rien a quoi comparer la demande et garde le format par defaut de l'appareil —,
// et le RECTO VERSO ne l'est plus depuis Electron 44, qui le remplace par du
// recto simple.
//
// La 2.8.2 contournait cela en ecrivant les reglages dans les preferences de
// l'imprimante juste avant le travail, puis en les remettant : un script
// PowerShell, une preference du poste modifiee quelques secondes, et un
// marqueur pour reparer si l'application etait interrompue en plein envoi.
//
// Depuis la 2.8.3, plus rien de tout cela. L'application rend ses deux feuilles
// en PDF exact — c'est deja ce qu'elle fait pour son apercu — et le confie a
// « l'imprimeur », un petit executable a nous qui pose le format, l'orientation
// et la reliure dans le DEVMODE DU TRAVAIL. Aucun reglage du poste n'est
// touche, rien n'est a remettre, et la version d'Electron n'entre plus en
// ligne de compte. Verifie : le travail arrive au pilote en A3 (8), paysage (2),
// DMDUP_HORIZONTAL (3).

// Le rendu du PDF : chaque page est tramee a cette definition. 300 points par
// pouce font 4961 pixels pour une A3 — exactement la definition du fond scanne
// que la feuille porte deja.
const PPP_IMPRESSION = 300;

function cheminDeLImprimeur() {
  // empaquetee, l'application porte l'imprimeur dans ses ressources ; en
  // developpement, il est a cote des sources
  const empaquete = path.join(process.resourcesPath || '', 'imprimeur', 'ImprimerPdf.exe');
  if (fs.existsSync(empaquete)) return empaquete;
  const local = path.join(__dirname, 'imprimeur', 'ImprimerPdf.exe');
  return fs.existsSync(local) ? local : null;
}

function lancerLImprimeur(args) {
  return new Promise((resolve) => {
    const exe = cheminDeLImprimeur();
    if (!exe) { resolve({ code: -1, sortie: 'imprimeur absent' }); return; }
    try {
      execFile(exe, args, { windowsHide: true, timeout: 120000 }, (err, stdout) => {
        resolve({
          code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
          sortie: String(stdout || '').trim() || (err && err.message) || ''
        });
      });
    } catch (e) {
      resolve({ code: -1, sortie: e && e.message ? e.message : String(e) });
    }
  });
}

async function imprimerLeDocument(webContents, options) {
  if (!cheminDeLImprimeur()) {
    // Sans l'imprimeur, le document partirait au format que l'imprimante
    // applique d'elle-meme. La page decide : renoncer, ou imprimer quand meme.
    if (!options.forcer) return { abouti: false, raison: 'imprimeur', trace: 'imprimeur introuvable' };
    return await imprimerParElectron(webContents, options);
  }

  const rendu = await contenuAPeindre(webContents, options);
  const pdf = path.join(app.getPath('temp'), 'prescription-impression-' + Date.now() + '.pdf');
  try {
    const octets = await rendu.source.printToPDF({
      landscape: options.paysage !== false,
      pageSize: options.format || 'A3',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      scale: 1,
      preferCSSPageSize: true
    });
    fs.writeFileSync(pdf, octets);
  } finally {
    rendu.fermer();
  }

  try {
    const args = ['--pdf', pdf,
      '--format', options.format || 'A3',
      options.paysage !== false ? '--paysage' : '--portrait',
      '--rectoverso', options.rectoVerso === 'long' ? 'long' : (options.rectoVerso ? 'court' : 'non'),
      '--exemplaires', String(Math.max(1, Math.min(9, parseInt(options.exemplaires, 10) || 1))),
      '--ppp', String(PPP_IMPRESSION),
      '--titre', String(options.titre || 'Prescription et Surveillance')];
    if (options.imprimante) args.push('--imprimante', String(options.imprimante));
    /* « 3-7 », « 2,4-6 », ou rien pour tout le document : l'observation
       medicale s'imprime parfois en entier, parfois a partir d'une section. */
    if (options.pages) args.push('--pages', String(options.pages));
    const r = await lancerLImprimeur(args);
    if (r.code !== 0 || !/^OK /m.test(r.sortie)) {
      return { abouti: false, raison: 'imprimeur', trace: r.sortie };
    }
    return { abouti: true, raison: '', trace: r.sortie };
  } finally {
    // le PDF ne sert plus : il portait le dossier d'un patient
    try { fs.unlinkSync(pdf); } catch (e) {}
  }
}

// Repli, quand l'imprimeur manque et que le service choisit d'imprimer quand
// meme : l'impression d'Electron, avec ses limites connues.
async function imprimerParElectron(webContents, options) {
  const rendu = await contenuAPeindre(webContents, options);
  try {
    const reglages = {
      silent: true,
      printBackground: true,
      pageSize: options.format || 'A3',
      landscape: options.paysage !== false,
      duplexMode: options.rectoVerso === 'long' ? 'longEdge'
        : (options.rectoVerso ? 'shortEdge' : 'simplex'),
      margins: { marginType: 'none' },
      copies: Math.max(1, Math.min(9, parseInt(options.exemplaires, 10) || 1))
    };
    if (options.imprimante) reglages.deviceName = String(options.imprimante);
    const resultat = await new Promise((resolve) => {
      try {
        rendu.source.print(reglages, (abouti, raison) => {
          resolve({ abouti: !!abouti, raison: String(raison || ''), parElectron: true });
        });
      } catch (e) {
        resolve({ abouti: false, raison: e && e.message ? e.message : String(e) });
      }
    });
    // le travail est remis au spouleur, pas encore parti : on laisse le temps
    await new Promise((r) => setTimeout(r, 2500));
    return resultat;
  } finally {
    rendu.fermer();
  }
}

// les imprimantes du poste de travail, pour les faire choisir dans la page
async function listerLesImprimantes(webContents) {
  try {
    const liste = await webContents.getPrintersAsync();
    return liste.map((p) => ({ nom: p.name, defaut: !!p.isDefault, etat: p.status }));
  } catch (e) {
    return [];
  }
}

async function apercuAvantImpression(webContents, options) {
  const rendu = await contenuAPeindre(webContents, options);
  const pdf = await rendu.source.printToPDF({
    landscape: options.paysage !== false,
    pageSize: options.format || 'A3',
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    scale: 1,
    preferCSSPageSize: true
  });
  rendu.fermer();

  const dossier = app.getPath('temp');
  nettoyerApercus(dossier);
  const fichier = path.join(dossier, 'apercu-prescription-' + Date.now() + '.pdf');
  fs.writeFileSync(fichier, pdf);

  if (!fenetreApercu || fenetreApercu.isDestroyed()) {
    fenetreApercu = new BrowserWindow({
      width: 1280,
      height: 900,
      title: 'Aperçu avant impression',
      autoHideMenuBar: true,
      backgroundColor: '#525659',
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { plugins: true, contextIsolation: true, nodeIntegration: false }
    });
    // le visualiseur PDF impose le titre du document : on garde le notre
    fenetreApercu.on('page-title-updated', (e) => e.preventDefault());
    fenetreApercu.on('closed', () => { fenetreApercu = null; });
  }
  // Le visualiseur PDF de Chromium abandonne parfois la navigation quand on lui
  // remet un autre document dans la meme fenetre (ERR_ABORTED). La fenetre
  // restait alors sur l'apercu precedent : on demandait l'observation medicale
  // et l'on revoyait les feuilles de prescription. On la vide d'abord — ce qui
  // libere aussi le fichier precedent — et un abandon n'est pas un echec.
  const charger = async (url) => {
    try { await fenetreApercu.loadURL(url); }
    catch (e) { if (!/ERR_ABORTED/.test(String((e && e.message) || e))) throw e; }
  };
  await charger('about:blank');
  await charger('file:///' + fichier.replace(/\\/g, '/'));
  const titre = options.titre || (String(options.format) === 'A4'
    ? 'Aperçu — observation médicale' : 'Aperçu — feuilles de prescription');
  fenetreApercu.setTitle(titre);
  fenetreApercu.focus();
  return fichier;
}

function lireEtat() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}

function ecrireEtat(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch (e) { /* sans importance */ }
}

// Electron n'a pas de menu contextuel par defaut : le clic droit ne faisait
// donc rien, ni dans les feuilles ni dans l'observation. On le construit, avec
// les seules actions d'edition — elles s'appliquent au cadre qui a le focus,
// l'observation comprise.
// La page nous dit, juste avant l'ouverture du menu, si le clic vise un champ
// de saisie — cellule des feuilles, ou champ de l'observation, qu'elle relaie —,
// s'il est en gras ou en italique, et quelle base l'alimente. L'information ne
// sert qu'une fois : un clic droit ailleurs ne doit pas heriter de la precedente.
let CELLULE_VISEE = null;
ipcMain.on('cellule-visee', (evenement, info) => {
  CELLULE_VISEE = info || null;
});

function menuContextuel(win) {
  win.webContents.on('context-menu', (evenement, parametres) => {
    const flags = parametres.editFlags || {};
    const visee = CELLULE_VISEE;
    CELLULE_VISEE = null;
    const modele = [];

    if (parametres.isEditable) {
      modele.push(
        { label: 'Annuler', role: 'undo', enabled: !!flags.canUndo },
        { label: 'Rétablir', role: 'redo', enabled: !!flags.canRedo },
        { type: 'separator' },
        { label: 'Couper', role: 'cut', enabled: !!flags.canCut },
        { label: 'Copier', role: 'copy', enabled: !!flags.canCopy },
        { label: 'Coller', role: 'paste', enabled: !!flags.canPaste },
        { label: 'Coller sans mise en forme', role: 'pasteAndMatchStyle', enabled: !!flags.canPaste },
        { type: 'separator' },
        { label: 'Tout sélectionner', role: 'selectAll', enabled: !!flags.canSelectAll }
      );
      if (visee) {
        // Ctrl + B et Ctrl + I sont traites par la page, partout : l'accelerateur
        // n'est ici qu'un rappel, jamais enregistre aupres du systeme
        modele.push(
          { type: 'separator' },
          {
            label: 'Gras',
            type: 'checkbox',
            checked: !!visee.gras,
            accelerator: 'CmdOrCtrl+B',
            registerAccelerator: false,
            click: () => win.webContents.send('basculer-style', 'gras')
          },
          {
            label: 'Italique',
            type: 'checkbox',
            checked: !!visee.italique,
            accelerator: 'CmdOrCtrl+I',
            registerAccelerator: false,
            click: () => win.webContents.send('basculer-style', 'italique')
          }
        );
        if (visee.base) {
          modele.push(
            { type: 'separator' },
            {
              label: 'Ajouter à la base ' + visee.base,
              click: () => win.webContents.send('verser-dans-la-base')
            }
          );
        }
      }
    } else if (parametres.selectionText && parametres.selectionText.trim()) {
      modele.push(
        { label: 'Copier', role: 'copy', enabled: !!flags.canCopy },
        { type: 'separator' },
        { label: 'Tout sélectionner', role: 'selectAll', enabled: !!flags.canSelectAll }
      );
    }

    if (!modele.length) return;
    Menu.buildFromTemplate(modele).popup({ window: win });
  });
}

// ---- fermeture : c'est la page qui decide ----------------------------------
// La croix de la fenetre, Alt+F4 et le menu Fichier > Quitter ne ferment plus
// l'application d'eux-memes. Ils demandent a la page d'enregistrer ; elle ne
// rappelle « fermer-application » qu'une fois tout ecrit dans le dossier des
// patients. Un dossier injoignable empeche donc la fermeture, au lieu d'emporter
// la derniere saisie avec la fenetre.
let fermetureAutorisee = false;
let attenteDeLaPage = null;

function demanderFermeture(win) {
  if (fermetureAutorisee || !win || win.isDestroyed()) return;
  try { win.webContents.send('demande-fermeture'); } catch (_) {}
  clearTimeout(attenteDeLaPage);
  // Si la page ne repond pas — script fige, page blanche —, personne ne doit
  // etre condamne a tuer l'application par le gestionnaire des taches.
  attenteDeLaPage = setTimeout(async () => {
    attenteDeLaPage = null;
    if (fermetureAutorisee || win.isDestroyed()) return;
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Fermeture',
      message: "L'application n'a pas confirme l'enregistrement.",
      detail: "Elle ne repond pas. Fermer maintenant peut faire perdre la derniere saisie, "
            + "qui ne serait alors conservee que sur ce poste de travail.",
      buttons: ['Attendre encore', 'Fermer quand meme'],
      defaultId: 0,
      cancelId: 0
    });
    if (r.response === 1) { fermetureAutorisee = true; win.destroy(); }
  }, 5000);
}

function menu(win) {
  return Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        // « Imprimer… » lancait la boite de dialogue sur la page telle qu'affichee,
        // en court-circuitant le document d'impression isole — et son raccourci
        // Ctrl+P privait la page du sien. L'impression passe desormais par la
        // fenetre d'impression, qui a son propre bouton.
        {
          label: 'Impression…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => win.webContents.send('demande-apercu')
        },
        { type: 'separator' },
        // meme chemin que la croix de la fenetre : la page enregistre, puis ferme
        { label: 'Quitter', accelerator: 'Alt+F4', click: () => demanderFermeture(win) }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { label: 'Annuler', role: 'undo' },
        { label: 'Rétablir', role: 'redo' },
        { type: 'separator' },
        { label: 'Couper', role: 'cut' },
        { label: 'Copier', role: 'copy' },
        { label: 'Coller', role: 'paste' },
        { label: 'Tout sélectionner', role: 'selectAll' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Zoom avant', role: 'zoomIn' },
        { label: 'Zoom arrière', role: 'zoomOut' },
        { label: 'Taille réelle', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Plein écran', role: 'togglefullscreen' },
        { label: 'Recharger', accelerator: 'F5', role: 'reload' },
        { label: 'Outils de développement', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    }
  ]);
}

async function creerFenetre() {
  const port = await demarrerServeur();
  const etat = lireEtat();

  const win = fenetrePrincipale = new BrowserWindow({
    width: etat.width || 1500,
    height: etat.height || 950,
    x: etat.x,
    y: etat.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#e8e8e8',
    title: 'Feuille de Prescription et de Surveillance',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(menu(win));
  menuContextuel(win);
  win.once('ready-to-show', () => { if (etat.maximized) win.maximize(); win.show(); });
  ['close', 'resize', 'move'].forEach(ev => win.on(ev, () => ecrireEtat(win)));

  // la croix de la fenetre ne ferme rien : elle demande a la page d'enregistrer
  win.on('close', (e) => {
    if (fermetureAutorisee) return;
    e.preventDefault();
    demanderFermeture(win);
  });

  // les liens externes partent dans le navigateur, jamais dans l'application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); shell.openExternal(url); }
  });

  win.loadURL(`http://127.0.0.1:${port}/index.html`);

  if (port !== PORT_FIXE) {
    win.once('ready-to-show', () => {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Port occupe',
        message: `Le port ${PORT_FIXE} est deja utilise par un autre logiciel.`,
        detail: "L'application fonctionne normalement, mais l'autorisation d'acces au dossier "
              + "des patients sera a redonner a la prochaine ouverture. Fermez le logiciel "
              + "concurrent, puis relancez, pour retrouver la permanence.",
        buttons: ['Continuer']
      });
    });
  }
}

app.setAppUserModelId('fr.prescription.reanimation');

// une seule instance : un second lancement ramene la fenetre existante
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    // acces au dossier des patients (showDirectoryPicker / showSaveFilePicker)
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(true));
    session.defaultSession.setPermissionCheckHandler(() => true);

    // le nom de la machine, demande par le prechargement des son chargement
    ipcMain.on('nom-du-poste', (evenement) => {
      try { evenement.returnValue = os.hostname() || ''; } catch (e) { evenement.returnValue = ''; }
    });

    ipcMain.handle('apercu-impression', (evenement, options) =>
      apercuAvantImpression(evenement.sender, options || {}));

    // La page va poser une question — l'imprimante, le medecin, ce qu'il faut
    // imprimer de l'observation. Si l'apercu est devant, la boite s'ouvrirait
    // derriere lui et le bouton semblerait ne rien faire.
    ipcMain.handle('au-premier-plan', () => {
      try {
        if (!fenetrePrincipale || fenetrePrincipale.isDestroyed()) return false;
        if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
        fenetrePrincipale.show();
        fenetrePrincipale.focus();
        return true;
      } catch (e) { return false; }
    });

    // ouvrir un document que la page nous remet : elle seule a l'autorisation de
    // lire le dossier des patients, mais elle ne connait pas son chemin reel.
    // On ecrit donc les octets dans un fichier temporaire, et Windows l'ouvre.
    ipcMain.handle('ouvrir-fichier', async (evenement, nom, octets) => {
      try {
        const propre = String(nom || 'document.pdf').replace(/[^A-Za-z0-9_.-]+/g, '-');
        const dossier = path.join(app.getPath('temp'), 'observations-prescription');
        fs.mkdirSync(dossier, { recursive: true });
        const fichier = path.join(dossier, propre);
        fs.writeFileSync(fichier, Buffer.from(octets));
        return (await shell.openPath(fichier)) || '';
      } catch (e) {
        return e && e.message ? e.message : String(e);
      }
    });

    // ouvrir un dossier du disque dans l'explorateur — celui des observations,
    // que l'on va consulter pour une reimpression
    ipcMain.handle('ouvrir-dossier', async (evenement, chemin) => {
      if (!chemin) return 'chemin inconnu';
      try { return (await shell.openPath(String(chemin))) || ''; }
      catch (e) { return e && e.message ? e.message : String(e); }
    });

    ipcMain.handle('pdf-impression', (evenement, options) =>
      pdfDuDocument(evenement.sender, options || {}));

    // l'impression sur papier, reglages compris
    ipcMain.handle('imprimer-document', (evenement, options) =>
      imprimerLeDocument(evenement.sender, options || {}));

    ipcMain.handle('liste-imprimantes', (evenement) =>
      listerLesImprimantes(evenement.sender));

    // la page a bien recu la demande de fermeture : on lui laisse le temps
    ipcMain.on('fermeture-en-cours', () => { clearTimeout(attenteDeLaPage); attenteDeLaPage = null; });
    // elle l'annule — un enregistrement n'a pas abouti, ou l'utilisateur renonce
    ipcMain.on('fermeture-annulee', () => { clearTimeout(attenteDeLaPage); attenteDeLaPage = null; });
    // tout est ecrit : cette fois, on ferme pour de bon
    ipcMain.handle('fermer-application', () => {
      clearTimeout(attenteDeLaPage);
      attenteDeLaPage = null;
      fermetureAutorisee = true;
      app.quit();
      return true;
    });
    creerFenetre();
  });

  app.on('window-all-closed', () => app.quit());
}
