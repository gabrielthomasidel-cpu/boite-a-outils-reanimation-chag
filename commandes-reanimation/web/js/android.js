/* ============================================================
   Édition Android : adaptation au pont natif « AndroidBridge »
   ============================================================
   Sans effet hors de l'APK. Dans l'APK, remplace le lanceur Windows :
   - enregistrement des fichiers dans le dossier « Commandes » choisi une
     fois sur la tablette (même arborescence que C:\commandes) ;
   - impression par le service Android (événements androidprintfinished /
     androidprintcancelled attendus par le code d'impression) ;
   - bouton Retour, fermeture de l'application ;
   - lecture des codes par la caméra (en plus de la douchette).
   Chargé juste après windows-storage.js et avant app-controls.js.
   ============================================================ */
(function (global) {
  'use strict';
  const pont = global.AndroidBridge;
  if (!pont) return;

  global.document.documentElement.classList.add('android');
  global.__androidPrintManaged = true;

  const chemin = decodeURIComponent(global.location.pathname || '');
  const module = chemin.includes('Commande_Solutes') ? 'Solutés'
    : chemin.includes('Commande_Aide_Soignant') ? 'Magasin'
    : chemin.includes('Commande_Materiel') ? 'DM_Pharmacie' : '';

  /* ---------- dossier de l'application ---------- */
  function dossierChoisi(){ try { return pont.getDirectory() || ''; } catch (e) { return ''; } }

  let choixEnCours = null;
  function choisirDossier(){
    if (choixEnCours) return choixEnCours;
    choixEnCours = new Promise(resolve => {
      const fin = e => { global.removeEventListener('androiddossier', fin); choixEnCours = null; resolve(e.detail || ''); };
      global.addEventListener('androiddossier', fin);
      pont.chooseDirectory();
    });
    return choixEnCours;
  }

  async function assurerDossier(){
    if (dossierChoisi()) return true;
    const ok = typeof global.confirmDialog === 'function'
      ? await global.confirmDialog('Choisir le dossier Commandes',
          'Choisissez une seule fois le dossier où ranger les commandes, PDF, étiquettes et données publiées (par exemple « Documents/Commandes »). Les sous-dossiers DM_Pharmacie, Solutés et Magasin y seront créés.',
          'Choisir le dossier')
      : true;
    if (!ok) return false;
    return Boolean(await choisirDossier());
  }

  function base64De(blob){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error || new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(blob);
    });
  }

  async function enregistrer(categorie, nom, blob){
    if (!module) throw new Error('Enregistrement disponible depuis un module de commande.');
    if (!await assurerDossier()) throw new Error('Aucun dossier choisi : fichier non enregistré.');
    const resultat = pont.writeFile(module, categorie || 'Application', nom, await base64De(blob));
    if (String(resultat).startsWith('!')) {
      const message = String(resultat).slice(1);
      throw new Error(message === 'aucun-dossier' ? 'Aucun dossier choisi.' : message);
    }
    return { path: resultat, downloaded: false };
  }

  /* Même interface que l'objet du lanceur Windows : le code métier
     l'utilise sans distinction de plateforme. */
  global.WindowsStorage = {
    hash: '',
    android: true,
    save: enregistrer,
    openLastPdf: async () => { throw new Error('Aucun PDF de secours pour ce module.'); },
    async ouvrirPdf(blob, nom){
      await enregistrer('Archives', nom, blob);
      const r = pont.openFile(module, 'Archives', nom);
      if (String(r).startsWith('!')) throw new Error(String(r).slice(1));
    },
    dossier: dossierChoisi,
    choisirDossier
  };
  /* Le hash sert de témoin « stockage disponible » au code métier ; aucun
     fragment n'est ajouté aux liens dans l'APK. */
  Object.defineProperty(global.WindowsStorage, 'hash', { get: () => '#android', enumerable: true });
  global.document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && a.hash === '#android') a.hash = '';
  });

  global.CommandesApplication = { close: () => { pont.close(); return true; } };

  /* ---------- impression ---------- */
  global.print = function(){
    global.dispatchEvent(new Event('beforeprint'));
    pont.printPage(global.__printJobTitle || global.document.title || 'Commandes Réanimation');
  };
  global.addEventListener('androidprintfinished', () => global.dispatchEvent(new Event('afterprint')));
  global.addEventListener('androidprintcancelled', () => global.dispatchEvent(new Event('afterprint')));

  /* ---------- listes papier (mode dégradé) ----------
     Une WebView n'ouvre pas de seconde fenêtre : le document composé par
     mode-degrade.js est affiché dans papier.html, puis imprimé par Android.
     Le bouton Retour ramène au module ; le comptage est conservé. */
  global.open = function(url){
    if (url && url !== 'about:blank') return null;
    let html = '';
    const fenetre = {
      closed: false,
      opener: null,
      focus(){},
      close(){ fenetre.closed = true; },
      location: { replace(){} },
      document: {
        title: '',
        body: { textContent: '' },
        open(){ html = ''; },
        write(texte){ html += texte; },
        close(){
          try { global.sessionStorage.setItem('commandes-papier', html); } catch (e) {}
          if (global.persistState) try { global.persistState(); } catch (e) {}
          global.location.href = 'papier.html';
        }
      }
    };
    return fenetre;
  };

  /* ---------- bouton Retour ---------- */
  global.CommandesRetour = function(){
    const doc = global.document;
    const dialogue = doc.querySelector('dialog[open]');
    if (dialogue) { dialogue.close(); return true; }
    const menu = doc.querySelector('.header-tools.is-open');
    if (menu) { menu.classList.remove('is-open'); return true; }
    const panneau = [...doc.querySelectorAll('.admin-panel:not(.hidden)')].pop();
    if (panneau) { const fermer = panneau.querySelector('.admin-panel-header button'); if (fermer) fermer.click(); return true; }
    if (module) { global.location.href = 'index.html'; return true; }
    return false;
  };

  /* ---------- lecture par la caméra ---------- */
  const CAMERA = '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  let lecteur = null;

  function dialogueCamera(){
    let dlg = global.document.getElementById('cameraDlg');
    if (dlg) return dlg;
    dlg = global.document.createElement('dialog');
    dlg.id = 'cameraDlg';
    dlg.className = 'camera-dialog';
    dlg.setAttribute('aria-labelledby', 'cameraTitre');
    dlg.innerHTML = '<div class="dlg-body"><h2 id="cameraTitre">Scanner avec la caméra</h2>'
      + '<p id="cameraAide">Placez le code-barres ou le QR de l’étiquette dans le cadre.</p>'
      + '<div id="cameraLecteur" class="camera-lecteur"></div>'
      + '<p class="form-feedback" id="cameraErreur" role="alert"></p>'
      + '<div class="dlg-actions"><button type="button" class="primary" id="cameraFermer">Fermer</button></div></div>';
    global.document.body.appendChild(dlg);
    dlg.querySelector('#cameraFermer').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', arreterCamera);
    return dlg;
  }

  async function arreterCamera(){
    const l = lecteur;
    lecteur = null;
    if (!l) return;
    try { await l.stop(); } catch (e) {}
    try { l.clear(); } catch (e) {}
  }

  async function scanner(surCode){
    const dlg = dialogueCamera();
    const erreur = dlg.querySelector('#cameraErreur');
    erreur.textContent = '';
    erreur.className = 'form-feedback';
    if (!dlg.open) dlg.showModal();
    try {
      await global.chargerVendor('scanner');
      await arreterCamera();
      const H = global.Html5QrcodeSupportedFormats;
      lecteur = new global.Html5Qrcode('cameraLecteur', {
        verbose: false,
        formatsToSupport: [H.QR_CODE, H.CODE_128, H.CODE_39, H.EAN_13, H.EAN_8, H.DATA_MATRIX]
      });
      let lu = false;
      await lecteur.start({ facingMode: 'environment' },
        { fps: 10, qrbox: (l, h) => ({ width: Math.round(Math.min(l, h) * 0.8), height: Math.round(Math.min(l, h) * 0.55) }) },
        texte => {
          if (lu) return;
          lu = true;
          if (global.navigator.vibrate) global.navigator.vibrate(80);
          dlg.close();
          setTimeout(() => surCode(String(texte).trim()), 60);
        },
        () => {});
    } catch (e) {
      erreur.textContent = 'Caméra indisponible : ' + (e && e.message ? e.message : e) + '. Autorisez la caméra pour Commandes Réa dans les réglages Android.';
      erreur.className = 'form-feedback error';
    }
  }

  function boutonCamera(id, titre, surCode){
    const b = global.document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'chip camera-btn';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.innerHTML = CAMERA;
    b.addEventListener('click', () => scanner(surCode));
    return b;
  }

  global.document.addEventListener('DOMContentLoaded', () => {
    const recherche = global.document.getElementById('search');
    if (recherche && typeof global.allerVersCode === 'function') {
      recherche.insertAdjacentElement('afterend', boutonCamera('btnCamera', 'Scanner un article avec la caméra', code => global.allerVersCode(code)));
    }
    const champ = global.document.getElementById('fCodeBarres') || global.document.getElementById('fRef');
    if (champ && typeof global.appliquerCodeScanne === 'function') {
      const ligne = global.document.createElement('span');
      ligne.className = 'camera-ligne';
      champ.replaceWith(ligne);
      ligne.append(champ, boutonCamera('btnCameraFiche', 'Lire le code avec la caméra', code => global.appliquerCodeScanne(champ.id, code)));
    }
  });
})(window);
