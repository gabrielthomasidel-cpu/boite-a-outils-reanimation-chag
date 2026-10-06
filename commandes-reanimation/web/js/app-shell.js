/* ============================================================
   Structure d'écran commune aux trois modules
   ============================================================
   Construit l'en-tête, les filtres, la liste, la barre d'actions, les
   fenêtres et le mode d'emploi à partir de la configuration du module
   (js/modules.js). Appelé tout en haut de <body>, avant les scripts
   métier : ceux-ci trouvent donc la page complète dès leur chargement.
   ============================================================ */
(function (global) {
  'use strict';

  const ICONES = {
    accueil: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    aide: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    historique: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',
    reglages: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    menu: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    imprimer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>',
    papier: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12h6M9 15.5h6"/>',
    secours: '<path d="M12 3.5 20.5 19h-17z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>',
    reinitialiser: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
    debut: '<path d="M12 5v14M5 12l7-7 7 7"/>',
    suivant: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  function icone(nom, taille) {
    const t = taille || 20;
    return `<svg class="ico" viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nom] || ''}</svg>`;
  }

  function onglets(module) {
    const M = global.CommandesModules;
    const liens = M.ORDRE.map(id => {
      const m = M.get(id);
      const actif = id === module.id;
      return `<a class="tab${actif ? ' is-active' : ''}" href="${m.page}" data-module="${id}"${actif ? ' aria-current="page"' : ''}>`
        + `<img src="${m.icone}" alt="" width="20" height="20">${m.court}</a>`;
    }).join('');
    return `<nav class="tabs" aria-label="Modules de commande">
      <a class="tab tab-home" href="index.html" data-module="" title="Accueil — menu des applications">${icone('accueil', 18)}<span>Accueil</span></a>
      ${liens}
    </nav>`;
  }

  function outils() {
    return `<div class="header-tools" id="headerTools">
      <button type="button" class="tool-btn tool-menu" id="btnMenu" aria-expanded="false" aria-controls="headerToolsList" title="Autres actions">${icone('menu')}<span class="tool-label">Menu</span></button>
      <div class="header-tools-list" id="headerToolsList">
        <button type="button" class="tool-btn" id="btnHistorique" title="Historique des commandes">${icone('historique')}<span class="tool-label">Historique des commandes</span></button>
        <button type="button" class="tool-btn" id="btnAide" title="Mode d'emploi" aria-label="Ouvrir le mode d'emploi">${icone('aide')}<span class="tool-label">Mode d'emploi</span></button>
        <button type="button" class="tool-btn" id="btnAdmin" title="Gestion du catalogue (administrateur)" aria-label="Ouvrir la gestion du catalogue">${icone('reglages')}<span class="tool-label">Gestion du catalogue</span></button>
        <button type="button" class="tool-btn" id="btnCasse" aria-pressed="true" title="Noms en casse adaptée">
          <svg class="ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><text x="2" y="17" font-size="13" font-weight="700" font-family="Segoe UI,Arial,sans-serif" fill="currentColor">Aa</text></svg>
          <span class="tool-label">Noms en casse adaptée</span></button>
      </div>
    </div>`;
  }

  function enTete(module) {
    return `<header class="masthead">
  <div class="masthead-row">
    <img class="app-logo" src="${module.icone}" alt="" width="44" height="44">
    <div class="masthead-title">
      <span class="eyebrow">Service Réanimation</span>
      <h1>${module.titre}</h1>
    </div>
    <div class="meta" id="todayMeta"></div>
    ${outils()}
  </div>
  <div class="masthead-row masthead-row-2">
    ${onglets(module)}
    <div class="sig-row" id="sigRow">
      <label for="signature">Rempli par <span class="sig-requis">obligatoire pour imprimer</span></label>
      <input type="text" id="signature" placeholder="Nom, prénom" autocomplete="off" autocapitalize="words" enterkeyhint="done" list="signatureList">
      <datalist id="signatureList"></datalist>
    </div>
  </div>
</header>`;
  }

  function filtres(module) {
    const sansDotation = module.masquerSansDotation
      ? `<button type="button" class="chip" id="btnSansDotation" aria-pressed="false" title="Afficher temporairement les articles dont la dotation est nulle ou vide">Afficher sans dotation</button>`
      : '';
    return `<div class="restore-banner" id="restoreBanner" role="status">
  <span class="grow" id="restoreText"></span>
  <button type="button" id="restoreDismiss">Continuer</button>
  <button type="button" id="restoreClear">Repartir de zéro</button>
</div>

<div class="filter-row">
  <div class="filter-line filter-search">
    <input type="search" id="search" placeholder="Rechercher un article, une référence…" aria-label="Rechercher un article"
           autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
           inputmode="search" enterkeyhint="search">
    <div class="segmented" role="radiogroup" aria-label="Articles affichés" id="vueSelecteur">
      <button type="button" role="radio" data-vue="tous" aria-checked="true">Tous <span class="seg-count" id="vueCountTous"></span></button>
      <button type="button" role="radio" data-vue="aCompter" aria-checked="false">À compter <span class="seg-count" id="vueCountACompter"></span></button>
      <button type="button" role="radio" data-vue="aCommander" aria-checked="false">À commander <span class="seg-count" id="vueCountACommander"></span></button>
    </div>
    ${sansDotation}
  </div>
  <div class="filter-line" id="filterSelectRow">
    <select id="locFilter" aria-label="Filtrer par zone"><option value="">Toutes les zones</option></select>
    <select id="typeFilter" aria-label="Filtrer par type"${module.type ? '' : ' hidden'}><option value="">Tous les types</option></select>
  </div>
  <div class="summary-bar">
    <span id="sumCounted">0 / 0 comptés</span>
    <span class="track"><span class="fill" id="sumFill"></span></span>
    <span class="to-order none" id="sumOrder">0 à commander</span>
  </div>
</div>`;
  }

  function barreActions() {
    return `<div class="action-bar">
  <button type="button" id="btnReset" class="danger ghost" title="Effacer tous les comptages pour démarrer un nouveau cycle">${icone('reinitialiser', 18)}<span>Réinitialiser</span></button>
  <span class="action-spacer"></span>
  <button type="button" id="btnNextUncounted" title="Aller au prochain article non compté">${icone('suivant', 18)}<span>Prochain à compter</span></button>
  <button type="button" id="btnEditionSecours" title="Rouvrir le dernier PDF de commande conservé sur cet appareil">${icone('secours', 18)}<span>Édition de secours</span></button>
  <button type="button" id="btnPrint" class="primary">${icone('imprimer', 18)}<span>Imprimer</span></button>
</div>`;
  }

  function fenetres(module) {
    const codeBarres = module.codeBarres;
    const champReference = codeBarres
      ? `<label class="full">Référence commande
        <input type="text" id="fRef" autocomplete="off" autocapitalize="off" spellcheck="false">
        <small class="form-hint">Référence pharmacie imprimée sur la commande. Le préfixe interne « ${module.prefixeReference} » est géré automatiquement et n'est jamais imprimé.</small>
      </label>
      <label class="full">Code-barres (scan)
        <input type="text" id="fCodeBarres" autocomplete="off" autocapitalize="off" spellcheck="false">
        <small class="form-hint">Douchette : placez le curseur dans ce champ puis scannez. Ce code sert à retrouver l'article pendant le comptage et figure sur l'étiquette.</small>
      </label>`
      : `<label class="full">Référence
        <input type="text" id="fRef" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <small class="form-hint">Identifiant pharmacie, encodé dans le QR de l'étiquette. Douchette : scannez directement dans ce champ.</small>
      </label>`;
    const champType = module.type
      ? '<label>Type <input type="text" id="fType" list="typeList"></label>'
      : '<input type="hidden" id="fType" value="">';
    const champLabo = module.laboratoire
      ? `<label class="full">Laboratoire <input type="text" id="fLaboratoire" list="laboratoireList" placeholder="facultatif">
        <small class="form-hint">Regroupe et trie la commande Hors Stock. Les laboratoires non renseignés apparaissent en dernier.</small>
      </label>` : '';
    const doublement = module.doublerQuantiteSiRupture ? ' Si le stock saisi est égal à 0, elle est automatiquement doublée.' : '';
    const postImpression = module.rappelApresImpression ? `
<dialog id="postPrintDlg" class="post-print-warning" aria-labelledby="postPrintTitle" aria-describedby="postPrintMessage">
  <div class="dlg-body">
    <h2 id="postPrintTitle">Rappel après impression</h2>
    <p class="post-print-alert" id="postPrintMessage">La commande Hors stock ne doit pas être solidarisée avec la commande de dispositifs médicaux.</p>
    <p class="post-print-note" id="postPrintNote">La fermeture attend la fin des sauvegardes programmées.</p>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="postPrintStay">Rester dans l'application</button>
      <button type="button" class="primary" id="postPrintClose">J’ai compris — sauvegarder et quitter</button>
    </div>
  </div>
</dialog>` : '';

    return `
<dialog id="confirmDlg" aria-labelledby="dlgTitle">
  <div class="dlg-body">
    <h2 id="dlgTitle">Confirmer</h2>
    <div id="dlgText" class="dlg-text"></div>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="dlgCancel">Annuler</button>
      <button type="button" class="primary" id="dlgOk">Confirmer</button>
    </div>
  </div>
</dialog>
${postImpression}
<dialog id="formatDlg" aria-labelledby="formatDlgTitle">
  <div class="dlg-body">
    <h2 id="formatDlgTitle">Choisir le format</h2>
    <p id="formatDlgText">JSON est le format recommandé pour une sauvegarde complète.</p>
    <div class="form-grid">
      <label class="full">Format du fichier
        <select id="formatSelect">
          <option value="json" selected>JSON — sauvegarde complète (recommandé)</option>
          <option value="csv">CSV — échange universel</option>
          <option value="xlsx">XLSX — Excel / LibreOffice</option>
        </select>
      </label>
    </div>
    <p id="formatHelp"></p>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="formatCancel">Annuler</button>
      <button type="button" class="primary" id="formatOk">Continuer</button>
    </div>
  </div>
</dialog>

<dialog id="folderDlg" aria-labelledby="folderDlgTitle">
  <div class="dlg-body">
    <h2 id="folderDlgTitle">Dossier de destination</h2>
    <p id="folderStatus"></p>
    <p class="folder-path" id="folderPath"></p>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="folderClose">Fermer</button>
      <button type="button" class="primary" id="folderChoose">Choisir un dossier</button>
    </div>
    <div class="dlg-actions">
      <button type="button" class="ghost is-hidden" id="folderForget">Ne plus enregistrer dans un dossier</button>
    </div>
  </div>
</dialog>

<dialog id="pwdDlg" aria-labelledby="pwdDlgTitle">
  <div class="dlg-body">
    <h2 id="pwdDlgTitle">Gestion du catalogue</h2>
    <p>Accès protégé. Merci de saisir le mot de passe administrateur.</p>
    <div class="form-grid">
      <label class="full">Mot de passe
        <input type="password" id="pwdInput" autocomplete="current-password" autocapitalize="off" spellcheck="false" enterkeyhint="go">
      </label>
    </div>
    <p class="form-feedback" id="pwdFeedback" role="alert" aria-live="assertive"></p>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="pwdCancel">Annuler</button>
      <button type="button" class="primary" id="pwdOk">Valider</button>
    </div>
  </div>
</dialog>

<dialog id="itemFormDlg" class="dialog-wide" aria-labelledby="itemFormTitle">
  <div class="dlg-body">
    <h2 id="itemFormTitle">Ajouter un article</h2>
    <div class="form-grid">
      ${champReference}
      <label class="full">Dénomination <input type="text" id="fDenom"></label>
      <label class="full">Nom Pharmacie <input type="text" id="fNom"></label>
      <label>Dotation <input type="number" id="fDotation" min="0" step="1" inputmode="numeric"></label>
      <label>Localisation <input type="text" id="fLoc" list="locList"></label>
      ${champType}
      ${champLabo}
      <label class="full">Seuil de déclenchement <input type="number" id="fSeuil" min="0" step="1" inputmode="numeric" placeholder="laisser vide = calcul habituel">
        <small class="form-hint">Facultatif : aucune commande tant que le stock reste au-dessus du seuil. Au seuil ou en dessous, on commande le complément pour revenir à la dotation${module.type ? ' — ou la dotation entière pour un article Hors Stock' : ''}. Ce réglage n'apparaît jamais sur la page de comptage.</small>
      </label>
      <label class="full">Quantité à commander <input type="number" id="fQte" min="0" step="1" inputmode="numeric" placeholder="laisser vide = calcul automatique">
        <small class="form-hint">N'agit que si un seuil est renseigné : une fois le seuil atteint, cette quantité est commandée telle quelle.${doublement} La dotation ne sert alors que d'indication.</small>
      </label>
    </div>
    <datalist id="locList"></datalist>
    <datalist id="typeList"></datalist>
    <datalist id="laboratoireList"></datalist>
    <p class="form-feedback" id="itemFormFeedback" role="status" aria-live="polite"></p>
    <div class="dlg-actions">
      <button type="button" class="ghost" id="itemFormCancel">Annuler</button>
      <button type="button" class="primary" id="itemFormSave">Enregistrer</button>
    </div>
  </div>
</dialog>

<dialog id="integriteDlg" class="dialog-wide" aria-labelledby="integriteTitle">
  <div class="dlg-body">
    <h2 id="integriteTitle">Contrôle du catalogue</h2>
    <div id="integriteContenu"></div>
    <div class="dlg-actions">
      <button type="button" class="primary" id="integriteClose">Fermer</button>
    </div>
  </div>
</dialog>`;
  }

  /* ---------- Mode d'emploi ---------- */
  function qr(code, nom, desc, etape) {
    return `<div class="qr-carte">${etape ? `<span class="qr-etape">${etape}</span>` : ''}
          <div class="qr-config" data-code="${code}"></div>
          <div class="qr-nom">${nom}</div>
          <div class="qr-desc">${desc}</div>
        </div>`;
  }

  function aide(module) {
    const M = module;
    const reglagePrudent = 'Réglage à utiliser uniquement si adapté à votre douchette et à la configuration Windows. Consultez sa notice et testez une référence connue.';
    const horsStock = M.type ? `
    <h3>4. Articles « Hors Stock »</h3>
    <p>Ils apparaissent <b>en rouge</b>. Certains disposent d'un seuil réglé par l'administrateur : tant que le stock reste au-dessus, rien n'est commandé ; dès qu'il descend au seuil, la quantité prévue est commandée.${M.doublerQuantiteSiRupture ? ' Lorsqu’une quantité fixe est configurée, elle est doublée si le stock saisi est égal à 0.' : ''} Comptez normalement, vous n'avez rien de particulier à faire.</p>`
      : `
    <h3>4. Articles sans dotation</h3>
    <p>Pour un article à dotation nulle, saisissez directement la quantité à commander. Le catalogue Magasin n'utilise pas de champ Type : la localisation organise le parcours et l'impression.</p>`;
    const sansDotation = M.masquerSansDotation
      ? '<p><b>Articles sans dotation</b> — ils sont masqués au démarrage pour alléger le comptage. Le bouton <b>Afficher sans dotation</b> les fait apparaître ; il devient <b>Masquer sans dotation</b> lorsqu’ils sont visibles.</p>' : '';
    const impression = M.impressionEnDeuxLots
      ? '<p><b>Imprimer</b> lance deux travaux distincts et successifs : les dispositifs médicaux d’abord, puis le Hors Stock regroupé par laboratoire. Validez chaque fenêtre d’impression ; les compteurs ne sont remis à zéro qu’après la fin des deux travaux. Un rappel final indique de ne pas solidariser les deux commandes.</p>'
      : `<p><b>Imprimer</b> — le document ne reprend que les articles à commander, ${M.regroupementImpression === 'localisation' ? 'classés par localisation puis désignation' : 'triés par type ; les articles Hors Stock sortent sur une feuille séparée'}.</p>`;
    const etiquettes = M.codeBarres
      ? `<h3>Étiquettes code-barres</h3>
      <p>Bouton <b>Étiquettes code-barres</b> : le Code 128 contient le code-barres de l'article ; la référence de commande figure en petit. Formats <b>Standard 27 étiquettes</b> (3 × 9) ou <b>Avery plastifié</b> (L7060, 21 étiquettes de 63,5 × 38,1 mm).</p>`
      : `<h3>Étiquettes QR</h3>
      <p>Bouton <b>Étiquettes QR</b> : le QR ne contient que la référence. Formats <b>Standard 27 étiquettes</b> (3 × 9) ou <b>Avery plastifié</b> (L7060, 21 étiquettes de 63,5 × 38,1 mm).</p>`;
    const tableChamps = `
      <table class="aide-table"><tbody>
        ${M.codeBarres
          ? `<tr><td><b>Référence commande</b></td><td>Identifiant pharmacie, précédé de « ${M.prefixeReference} » uniquement dans la base. Le préfixe est retiré sur la commande imprimée.</td></tr>
        <tr><td><b>Code-barres</b></td><td>Code lu pendant le comptage et imprimé en Code 128 sur les étiquettes, sans préfixe.</td></tr>`
          : '<tr><td><b>Référence</b></td><td>Identifiant pharmacie, encodé dans le QR. Vous pouvez la saisir ou la scanner dans la fiche.</td></tr>'}
        <tr><td><b>Dénomination</b></td><td>Nom utilisé pendant le comptage et sur les étiquettes.</td></tr>
        <tr><td><b>Nom Pharmacie</b></td><td>Nom repris sur la commande destinée à la pharmacie.</td></tr>
        <tr><td><b>Localisation</b></td><td>Zone de rangement : détermine l'ordre de parcours.</td></tr>
        ${M.type ? '<tr><td><b>Type</b></td><td>Détermine le tri à l\'impression. Saisir « Hors Stock » bascule l\'article en rouge et sur une commande séparée.</td></tr>' : ''}
        ${M.laboratoire ? '<tr><td><b>Laboratoire</b></td><td>Facultatif. Regroupe et trie la commande Hors Stock ; les valeurs non renseignées sont placées à la fin.</td></tr>' : ''}
        <tr><td><b>Dotation</b></td><td>Stock cible. À 0, l'article passe en saisie libre${M.masquerSansDotation ? ' et reste masqué par défaut' : ''}.</td></tr>
        <tr><td><b>Seuil</b></td><td>Facultatif, sur tout article (voir ci-dessous).</td></tr>
        <tr><td><b>Quantité à commander</b></td><td>Facultatif. Impose la quantité dès le seuil atteint${M.doublerQuantiteSiRupture ? ' ; elle est doublée lorsque le stock saisi est égal à 0' : ''}.</td></tr>
      </tbody></table>`;

    return `<div class="admin-panel hidden" id="aidePanel" role="dialog" aria-modal="true" aria-labelledby="aidePanelTitle">
  <div class="admin-panel-header">
    <h2 id="aidePanelTitle">Mode d'emploi — ${M.court}</h2>
    <button type="button" id="aideClose" title="Fermer" aria-label="Fermer le mode d'emploi">✕</button>
  </div>
  <div class="aide-contenu">
    <p class="aide-chapeau">Version Windows ${global.CommandesModules.VERSION}, ouverte dans une fenêtre dédiée Microsoft Edge. Catalogues et bibliothèques sont intégrés : l'application fonctionne hors connexion.</p>

    <h3>1. Avant de commencer</h3>
    <p>Renseignez votre nom dans <b>Rempli par</b>. Il figure sur la commande ; sans lui, l'impression est refusée. Les derniers noms saisis sur ce poste sont proposés dans la liste.</p>

    <h3>2. Compter le stock</h3>
    <p><b>Avec la douchette</b> — scannez l'étiquette du casier : l'article s'affiche seul, le curseur se place dans la case quantité. Tapez le nombre d'unités en stock, appuyez sur <b>Entrée</b>, puis scannez le suivant.</p>
    <p class="aide-cycle">scan → chiffre → Entrée → scan</p>
    <p>USB ou Bluetooth : l'application accepte comme fin de scan Entrée, Entrée du pavé numérique, Tabulation et les doubles fins de ligne USB.</p>
    <p><b>À la main</b> — tapez un nom ou une référence dans la recherche, puis saisissez la quantité au clavier ou avec <b>−</b> et <b>+</b>. La molette ne modifie jamais une quantité.</p>
    <p><b>Case vide = non compté.</b> Une case vide (tiret) signifie que l'article n'a pas encore été compté. Tapez <b>0</b> si le casier est vide : l'article est alors compté, et commandé si besoin.</p>

    <h3>3. Lire les pastilles</h3>
    <table class="aide-table"><tbody>
      <tr><td><span class="commande-badge uncounted">À compter</span></td><td>Stock pas encore saisi. L'article ne sera pas commandé tant qu'il n'est pas compté.</td></tr>
      <tr><td><span class="commande-badge zero">Stock OK</span></td><td>Compté, stock suffisant : rien à commander.</td></tr>
      <tr><td><span class="commande-badge some">Commander 5</span></td><td>Compté, il manque 5 unités.</td></tr>
      <tr><td><span class="commande-badge uncounted">Sans dotation</span></td><td>Pas de dotation définie : indiquez la quantité voulue, ou laissez vide.</td></tr>
      <tr><td><span class="commande-badge zero">Aucune commande</span></td><td>Article sans dotation, pour lequel vous avez mis 0.</td></tr>
      <tr><td><span class="item-warning-inline">⚠ À vérifier</span></td><td>Quantité inhabituelle (par exemple plus de trois fois la dotation) : probable erreur de frappe. Elle est rappelée avant l'impression.</td></tr>
    </tbody></table>
    ${horsStock}

    <h3>5. Se repérer</h3>
    <p>La barre d'avancement indique les articles comptés et le nombre à commander. Le sélecteur <b>Tous / À compter / À commander</b> filtre la liste ; les compteurs indiquent combien d'articles chaque vue contient. Dans la liste, chaque zone indique combien de ses articles sont comptés ; une zone terminée est cochée. Le bouton <b>Prochain à compter</b> amène au premier article non compté.</p>
    ${sansDotation}
    <p>Un scan reste prioritaire : l'article recherché s'affiche même s'il ne fait pas partie de la vue en cours.</p>

    <h3>6. Terminer la commande</h3>
    ${impression}
    <p>Avant l'impression, une fenêtre récapitule le nombre d'articles commandés, ceux qui ne sont pas comptés et les quantités inhabituelles.</p>
    <p>Une copie PDF datée est conservée dans <b>${global.CommandesModules.libelleDossier(M, 'Archives')}</b> avant l'ouverture de l'impression ; la commande est aussi ajoutée à l'<b>historique</b>.</p>
    <p class="aide-alerte">Une fois l'impression terminée, <b>les compteurs sont remis à zéro</b> et le champ « Rempli par » est vidé : le cycle est clos.</p>

    <h3>7. Historique</h3>
    <p>Le bouton <b>Historique</b> de l'en-tête liste les commandes imprimées (date, auteur, articles et quantités) et propose une <b>synthèse</b> : articles commandés le plus souvent, quantité moyenne, et signalement des articles commandés à presque chaque cycle — un indice pour revoir leur dotation. L'historique peut être exporté en CSV.</p>
    <p><b>Commandes d'essai</b> — pour un essai ou une formation, indiquez <b>essai</b> dans « Rempli par » (par exemple « Essai Martin »). La commande s'imprime normalement mais n'est enregistrée ni dans l'historique ni dans les statistiques, et n'apparaît pas sur l'accueil.</p>

    <h3>8. Interrompre et reprendre</h3>
    <p>Le comptage est conservé automatiquement. À la réouverture, un bandeau propose <b>Continuer</b> ou <b>Repartir de zéro</b>. L'écran d'accueil affiche l'état de chaque commande en cours. Le bouton <b>Réinitialiser</b> efface tous les comptages pour un nouveau cycle.</p>

    <h3>9. En cas de souci</h3>
    <table class="aide-table"><tbody>
      <tr><td><b>« Référence inconnue »</b></td><td>L'étiquette ne correspond à aucun article : elle est peut-être périmée. Signalez-la à l'administrateur.</td></tr>
      <tr><td>Le scan tape des symboles</td><td>Le clavier de la douchette ne correspond pas à celui de Windows : scannez le code « Clavier français » ci-dessous.</td></tr>
      <tr><td>Rien ne se passe au scan</td><td>Vérifiez qu'un suffixe Entrée ou Tabulation est activé sur la douchette.</td></tr>
    </tbody></table>
    <p>Le bandeau rouge efface l'article précédent : c'est volontaire, pour éviter de saisir une quantité sur le mauvais article.</p>
    <div class="qr-grille qr-grille-solo">
      ${qr('%%SpecCode42', 'Clavier français', reglagePrudent)}
    </div>

    <h3>Édition de secours et mode dégradé</h3>
    <p><b>Édition de secours</b> rouvre le dernier PDF de commande de ce module dans une fenêtre Edge dédiée, pour le réimprimer. Elle ne valide pas de nouvelle commande et ne modifie pas le comptage.</p>
    <p><b>Liste papier</b> ouvre une liste vierge A4 à remplir à la main (stock compté, à commander, visa). Rééditez-la après toute modification du catalogue. Des listes PDF prêtes à imprimer figurent aussi sur l'écran d'accueil.</p>

    <h3>Affichage</h3>
    <p>Le bouton soleil / lune change l'affichage clair ou sombre. Le bouton <b>Aa</b> bascule les noms d'articles entre la casse adaptée (lecture plus rapide) et la casse d'origine du catalogue ; la référence et les documents imprimés restent toujours identiques au catalogue. Ces choix sont mémorisés sur le poste.</p>

    <section id="aideAdmin" class="is-hidden">
      <h2 class="aide-section-admin">Partie administrateur</h2>

      <h3>Modifier le catalogue</h3>
      <p>Icône <b>⚙</b>, puis mot de passe. Chaque article dispose d'un bouton de modification et d'un bouton de suppression ; <b>+ Ajouter un article</b> crée une fiche.</p>
      ${tableChamps}

      <h3>Le seuil de déclenchement</h3>
      <p>Applicable à <b>n'importe quel article</b> ayant une dotation. Tant que le stock reste <b>au-dessus</b> du seuil, rien n'est commandé. Au <b>seuil ou en dessous</b> :</p>
      <table class="aide-table"><tbody>
        <tr><td><b>Quantité à commander renseignée</b></td><td>Cette quantité${M.doublerQuantiteSiRupture ? ', doublée lorsque le stock saisi est égal à 0' : ', telle quelle'}. La dotation ne sert plus que d'indication.</td></tr>
        <tr><td><b>Sinon, articles courants</b></td><td>Le complément pour revenir à la dotation, soit <i>dotation moins stock</i>.</td></tr>
        ${M.type ? '<tr><td><b>Sinon, articles Hors Stock</b></td><td>La dotation entière, quel que soit le stock restant.</td></tr>' : ''}
      </tbody></table>
      <p><i>Article courant, dotation 4, seuil 2 : à 3 en stock, rien ; à 2 en stock, commande de 2 ; à 1 en stock, commande de 3.</i></p>

      <h3>Remettre à zéro les statistiques</h3>
      <p>Le bouton <b>Remettre à zéro les statistiques</b> de la gestion du catalogue efface l'historique des commandes de ce module, donc la synthèse par article et la « dernière commande » de l'accueil. Exportez l'historique en CSV avant si vous souhaitez en garder une trace. La remise à zéro est publiée sur le poste : les commandes effacées ne reviennent pas depuis un autre compte Windows.</p>

      <h3>Contrôle du catalogue</h3>
      <p>Le bouton <b>Contrôler le catalogue</b> détecte les références ou codes-barres en double, les dénominations vides, les seuils incohérents et les champs manquants. Le même contrôle est présenté avant chaque import : un catalogue comportant des erreurs ne s'importe qu'après confirmation explicite.</p>

      <h3 class="aide-important">Conservation et partage du catalogue</h3>
      <p>Chaque ajout ou correction est enregistré sur ce poste, puis <b>publié automatiquement</b> dans <b>${global.CommandesModules.libelleDossier(M, 'Application')}/donnees-${M.id}.js</b> (la version précédente est copiée dans Archives). Ce fichier est relu à chaque ouverture : il est partagé entre les comptes Windows du poste, conserve aussi l'historique et le mot de passe, et permet une <b>reprise automatique</b> après une réinstallation, un changement de profil ou une mise à jour. La version la plus récente l'emporte.</p>
      <p>Pour transférer le catalogue vers un autre poste, utilisez <b>Exporter la base</b> (JSON recommandé, CSV ou XLSX) puis <b>Importer la base</b> sur le poste de destination, ou copiez le fichier <code>donnees-${M.id}.js</code> dans le même dossier du poste de destination.</p>

      <h3>Dossier de sauvegarde automatique</h3>
      <p>Les fichiers sont enregistrés dans ${global.CommandesModules.libelleDossier(M)} : <b>Application</b> (données publiées et exports de catalogue), <b>Sauvegardes</b> (commandes enregistrées), <b>Etiquettes</b> (planches), <b>Archives</b> (PDF de commande et anciennes versions remplacées).</p>

      ${etiquettes}
      <p>Le bouton ouvre d'abord une <b>liste à cocher</b> : n'imprimez que les étiquettes voulues. Raccourcis <b>Tout cocher</b>, <b>Tout décocher</b> et <b>Cocher la sélection affichée</b>. Imprimez à 100 %, sans ajustement à la page ; testez d'abord sur feuille ordinaire.</p>

      <h3>Échanger la base</h3>
      <p><b>Exporter / Importer la base</b> concernent le catalogue. JSON est proposé par défaut, CSV et XLSX au choix. Un import conserve les comptages en cours lorsque la référence existe encore. Le comptage en cours, lui, est conservé automatiquement sur le poste.</p>

      <h3>Régler la douchette (Eyoyo EY-034)</h3>
      <p>Les codes ci-dessous se scannent <b>directement sur cet écran</b>. Scannez les vignettes de <b>1</b> à <b>9</b>, dans l'ordre. Rien ne s'écrit à l'écran : ces codes s'adressent au lecteur.</p>
      <p class="aide-alerte">Les étapes 7, 8 et 9 vont ensemble (préfixe Entrée) : scannez-les à la suite. Si vous êtes interrompu, reprenez à l'étape 7.</p>
      <div class="qr-grille">
        ${qr('%%SpecCode10', 'Mode normal', 'Le lecteur transmet aussitôt, au lieu de stocker en mémoire.', 1)}
        ${qr('CODTWO1', 'Activer les codes 2D', 'Autorise la lecture des QR.', 2)}
        ${qr('%%SpecCode9C', 'Suffixe Entrée', 'Une Entrée après le code : l\'application saute sur l\'article scanné.', 3)}
        ${qr('%%SpecCode96', 'Volume moyen', 'Bip audible sans être sonore.', 4)}
        ${qr('%%SpecCode77', 'Vibration activée', 'Le lecteur vibre à chaque lecture.', 5)}
        ${qr('%%SpecCode33', 'Veille après 5 minutes', 'La gâchette réveille le lecteur.', 6)}
        ${qr('%%SpecCode9A', 'Ajouter un préfixe', 'Ouvre la programmation du préfixe. Enchaînez sur 8 puis 9.', 7)}
        ${qr('%%0D', 'Caractère Entrée', 'Le préfixe choisi : une Entrée envoyée <i>avant</i> la référence.', 8)}
        ${qr('%%ExitSet', 'Enregistrer et quitter', 'Valide le préfixe.', 9)}
      </div>
      <p><b>À quoi sert ce préfixe ?</b> L'Entrée envoyée avant la référence referme d'abord la case quantité ; la référence arrive ensuite dans la recherche. Vous pouvez scanner sans surveiller le curseur.</p>
      <h4 class="aide-sous-titre">Clavier et liaison</h4>
      <div class="qr-grille">
        ${qr('%%SpecCode42', 'Clavier français', '<b>Pour PC Windows.</b> Sans lui, un scan de <code>15700</code> produit <code>&amp;5700</code>.')}
        ${qr('%%SpecCode40', 'Clavier américain', reglagePrudent)}
        ${qr('%%SpecCodeAA', 'Appairage Bluetooth', reglagePrudent)}
        ${qr('%%SpecCodeA8', 'Liaison sans fil 2,4 GHz', 'Pour poste fixe avec le petit récepteur USB. À scanner en premier.')}
        ${qr('%%SpecCode99', 'Associer au récepteur', 'À scanner juste après le précédent, récepteur branché.')}
      </div>
      <h4 class="aide-sous-titre">En cas de problème</h4>
      <div class="qr-grille">
        ${qr('%%SpecCode93', 'Réglages d\'usine', 'Repart de zéro. Refaites ensuite la séquence des 9 codes, puis le clavier.')}
        ${qr('%%SpecCode15', 'Niveau de batterie', 'Le lecteur écrit sa charge. Placez d\'abord le curseur dans « Rempli par ».')}
        ${qr('%%SpecCodeB2', 'Transmission lente', reglagePrudent)}
        ${qr('%%SpecCode36', 'Ne jamais s\'éteindre', 'Pour un inventaire complet sans mise en veille.')}
      </div>

      <h3>Changer le mot de passe</h3>
      <p>Seule une <b>empreinte</b> du mot de passe est conservée. Le nouveau mot de passe est publié avec les données du poste (C:\\commandes) : il reste valable après fermeture et pour les autres comptes Windows du poste.</p>
      <div class="aide-outil">
        <label>Nouveau mot de passe <input type="password" id="pwdNew" autocomplete="new-password"></label>
        <label>Confirmation <input type="password" id="pwdNew2" autocomplete="new-password"></label>
        <button type="button" id="pwdApply">Appliquer</button>
        <p class="aide-outil-etat" id="pwdState">Six caractères minimum.</p>
      </div>
      <p class="aide-alerte">Cette protection écarte les curieux ; elle ne chiffre pas les données et ne résiste pas à quelqu'un sachant lire le code.</p>
    </section>

    <h3>Avertissement et sécurité</h3>
    <p>Cette application est un outil de comptage et de préparation des commandes. Elle ne fournit aucune recommandation de prescription, de posologie ou de prise en charge. Les quantités proposées doivent être contrôlées par le professionnel responsable selon les procédures du service avant transmission.</p>
    <ul>
      <li>Vérifiez les références, noms pharmacie, unités, stocks, dotations et quantités. Après un scan ou un import, contrôlez le résultat ; une référence incorrecte ou un catalogue ancien peut fausser la commande.</li>
      <li>En cas d’écart ou de panne, suspendez la transmission, vérifiez le stock et utilisez les listes papier à jour. Évitez les doubles commandes lors de la reprise.</li>
      <li>Exportez régulièrement une sauvegarde JSON dans un dossier autorisé par le service. Le stockage local ne remplace pas une sauvegarde.</li>
      <li>Ne saisissez aucune donnée de patient ni information clinique confidentielle. Verrouillez votre session Windows et limitez l’accès aux fichiers et sauvegardes.</li>
      <li>Utilisez un installateur provenant du responsable du service ; ne désactivez pas les protections du poste pour exécuter l’application.</li>
    </ul>
    <p class="aide-signature">Conception, développement et rédaction : <b>Gabriel THOMAS</b>. Aide Windows ${global.CommandesModules.VERSION}.</p>
  </div>
</div>`;
  }

  function panneaux(module) {
    const libelleEtiquettes = module.codeBarres ? 'Étiquettes code-barres' : 'Étiquettes QR';
    return `
<div class="admin-panel hidden" id="etiqPanel" role="dialog" aria-modal="true" aria-labelledby="etiqPanelTitle">
  <div class="admin-panel-header">
    <h2 id="etiqPanelTitle">Choisir les ${libelleEtiquettes.toLowerCase()} à imprimer</h2>
    <button type="button" id="etiqClose" title="Fermer" aria-label="Fermer le choix des étiquettes">✕</button>
  </div>
  <div class="admin-panel-toolbar">
    <input type="search" id="etiqSearch" placeholder="Rechercher un article, une référence…" aria-label="Rechercher un article"
           autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    <select id="etiqLoc" aria-label="Filtrer par zone"><option value="">Toutes les zones</option></select>
    <select id="etiqFormat" aria-label="Format de la planche d'étiquettes">
      <option value="standard-27">Standard 27 étiquettes</option>
      <option value="avery-plastifie">Avery plastifié</option>
    </select>
  </div>
  <div class="admin-note" id="etiqFormatNote">A4 — 3 colonnes × 9 lignes — 27 étiquettes par page</div>
  <div class="etiq-actions">
    <button type="button" id="etiqAll">Tout cocher</button>
    <button type="button" id="etiqNone">Tout décocher</button>
    <button type="button" id="etiqVisible">Cocher la sélection affichée</button>
  </div>
  <div class="admin-note" id="etiqNote"></div>
  <div class="admin-list" id="etiqList"></div>
  <div class="admin-panel-footer">
    <button type="button" id="etiqGenerate">Enregistrer le PDF</button>
    <button type="button" id="etiqPrint" class="primary-wide">Imprimer directement</button>
  </div>
</div>

<div class="admin-panel hidden" id="histPanel" role="dialog" aria-modal="true" aria-labelledby="histPanelTitle">
  <div class="admin-panel-header">
    <h2 id="histPanelTitle">Historique des commandes — ${module.court}</h2>
    <button type="button" id="histClose" title="Fermer" aria-label="Fermer l'historique">✕</button>
  </div>
  <div class="admin-panel-toolbar">
    <div class="segmented" role="tablist" aria-label="Affichage de l'historique" id="histOnglets">
      <button type="button" role="tab" data-hist="commandes" aria-selected="true">Commandes</button>
      <button type="button" role="tab" data-hist="synthese" aria-selected="false">Synthèse par article</button>
    </div>
    <select id="histPeriode" aria-label="Période analysée">
      <option value="5">5 dernières commandes</option>
      <option value="10" selected>10 dernières commandes</option>
      <option value="25">25 dernières commandes</option>
      <option value="0">Toutes les commandes</option>
    </select>
    <button type="button" id="histExport">Exporter en CSV</button>
  </div>
  <div class="hist-contenu" id="histContenu"></div>
</div>

<div class="admin-panel hidden" id="adminPanel" role="dialog" aria-modal="true" aria-labelledby="adminPanelTitle">
  <div class="admin-panel-header">
    <h2 id="adminPanelTitle">Gestion du catalogue — ${module.court}</h2>
    <button type="button" id="adminClose" title="Fermer" aria-label="Fermer la gestion du catalogue">✕</button>
  </div>
  <div class="admin-warning" id="adminPublication">Les ajouts et modifications sont enregistrés sur ce poste et publiés automatiquement dans ${global.CommandesModules.libelleDossier(module, 'Application')}.</div>
  <div class="admin-panel-toolbar">
    <input type="search" id="adminSearch" placeholder="Rechercher un article, une référence…" aria-label="Rechercher dans le catalogue"
           autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    <button type="button" id="adminAddBtn">+ Ajouter un article</button>
  </div>
  <div class="admin-note"><span id="adminCount"></span> article(s) dans le catalogue.</div>
  <div class="admin-list" id="adminList"></div>
  <div class="admin-panel-footer">
    <button type="button" id="adminCheck" title="Rechercher doublons, champs manquants et réglages incohérents">Contrôler le catalogue <span class="badge-count" id="adminCheckCount"></span></button>
    <button type="button" id="adminLabels">${libelleEtiquettes}</button>
    <button type="button" id="btnAideAdmin">Mode d'emploi</button>
    <button type="button" id="adminPublish" class="primary-wide" title="Publier immédiatement le catalogue sur le poste (C:\\commandes)">Publier sur le poste</button>
    <button type="button" id="adminExport" title="Exporter le catalogue en JSON, CSV ou XLSX">Exporter la base</button>
    <button type="button" id="adminImportBtn" title="Importer le catalogue depuis JSON, CSV ou XLSX">Importer la base</button>
    <button type="button" id="adminRazHistorique" class="danger" title="Effacer l'historique et les statistiques de commande de ce module">Remettre à zéro les statistiques</button>
    <input type="file" id="adminImportFile" accept=".json,application/json">
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>`;
  }

  function monter(id) {
    const module = global.CommandesModules.get(id);
    if (!module) throw new Error('Module inconnu : ' + id);
    global.MODULE = module;
    global.document.documentElement.dataset.module = id;
    global.document.body.insertAdjacentHTML('afterbegin',
      enTete(module) + filtres(module)
      + '<main id="list" aria-live="off"></main>'
      + '<div id="printArea"><div id="printSheets"></div></div>'
      + barreActions() + fenetres(module) + aide(module) + panneaux(module));
  }

  global.CommandesShell = Object.freeze({ monter, icone });
})(window);
