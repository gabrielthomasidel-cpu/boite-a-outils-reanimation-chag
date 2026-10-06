/* ============================================================
   Configuration commune des trois modules de commande
   ============================================================
   Toutes les différences entre Solutés, Matériel Pharmacie et Magasin sont
   décrites ici. Le code métier (js/core/*.js) et la mise en page
   (js/app-shell.js) sont partagés : une correction s'applique d'un coup aux
   trois modules.

   Les clés de stockage, les empreintes de mot de passe et les noms de
   fichiers reprennent exactement ceux de la version 2.6 : les comptages,
   catalogues modifiés et dossiers déjà mémorisés sont donc conservés.
   ============================================================ */
(function (global) {
  'use strict';

  const VERSION = '2.7.0';

  const MODULES = Object.freeze({
    solutes: Object.freeze({
      id: 'solutes',
      page: 'Commande_Solutes.html',
      titre: 'Commande de Solutés',
      court: 'Solutés',
      description: 'Comptage et commande des solutés de perfusion.',
      icone: 'img/icone-solutes.svg',
      dossierWindows: 'Solutés',
      cleStockage: 'commande-solutes:v1',
      baseDossier: 'commande-solutes-fs',
      prefixeReference: 'sol',
      codeBarres: true,
      type: true,
      laboratoire: false,
      nomPharmacieRequis: true,
      masquerSansDotation: false,
      doublerQuantiteSiRupture: false,
      impressionEnDeuxLots: false,
      rappelApresImpression: false,
      regroupementImpression: 'type',
      titreImpression: 'Commande de Solutés',
      racineFichiers: 'Commande_Solutes',
      racineCatalogue: 'Catalogue_Solutes',
      selMotDePasse: 'cs32',
      empreinteMotDePasse: 'c22f6253',
      couleur: '#2f6fb3'
    }),
    materiel_reanimation: Object.freeze({
      id: 'materiel_reanimation',
      page: 'Commande_Materiel_Reanimation.html',
      titre: 'Commande de Matériel Pharmacie',
      court: 'Matériel',
      description: 'Comptage du matériel ; les articles sans dotation sont masqués par défaut et affichables au besoin.',
      icone: 'img/icone-materiel.svg',
      dossierWindows: 'Pharmacie',
      cleStockage: 'commande-materiel-reanimation:v1',
      baseDossier: 'commande-materiel-fs',
      prefixeReference: '',
      codeBarres: false,
      type: true,
      laboratoire: true,
      nomPharmacieRequis: true,
      masquerSansDotation: true,
      doublerQuantiteSiRupture: true,
      impressionEnDeuxLots: true,
      rappelApresImpression: true,
      regroupementImpression: 'type',
      titreImpression: 'Commande de dispositifs médicaux',
      titreImpressionHorsStock: 'Commande de Matériel Pharmacie — Hors Stock',
      racineFichiers: 'Commande_Materiel_Reanimation',
      racineCatalogue: 'Catalogue_Materiel_Reanimation',
      selMotDePasse: 'cmr32',
      empreinteMotDePasse: '8a8077b3',
      couleur: '#b03a48'
    }),
    aide_soignant: Object.freeze({
      id: 'aide_soignant',
      page: 'Commande_Aide_Soignant.html',
      titre: 'Commande Magasin',
      court: 'Magasin',
      description: 'Comptage et commande des produits d’hôtellerie, de lingerie et de soins.',
      icone: 'img/icone-aide-soignant.svg',
      dossierWindows: 'Magasin',
      cleStockage: 'commande-aide-soignant:v1',
      baseDossier: 'commande-aide-soignant-fs',
      prefixeReference: '',
      codeBarres: false,
      type: false,
      laboratoire: false,
      nomPharmacieRequis: false,
      masquerSansDotation: false,
      doublerQuantiteSiRupture: false,
      impressionEnDeuxLots: false,
      rappelApresImpression: false,
      regroupementImpression: 'localisation',
      titreImpression: 'Commande Magasin',
      racineFichiers: 'Commande_Aide_Soignant',
      racineCatalogue: 'Catalogue_Aide_Soignant',
      selMotDePasse: 'cmr32',
      empreinteMotDePasse: '8a8077b3',
      couleur: '#2f8a5b'
    })
  });

  const ORDRE = Object.freeze(['solutes', 'materiel_reanimation', 'aide_soignant']);

  /* Dossier partagé du poste, créé par le lanceur Windows. Il peut être
     redéfini avant le chargement de ce fichier (tests automatisés). */
  /* Sous Android, l'APK sert les fichiers du dossier choisi sur l'appareil
     à cette adresse ; sous Windows, lecture directe dans C:\commandes. */
  const BASE_ANDROID = 'https://appassets.androidplatform.net/poste/';

  function dossierPoste(module) {
    const base = global.COMMANDES_DOSSIER_POSTE || (global.AndroidBridge ? BASE_ANDROID : 'file:///C:/commandes/');
    return base + encodeURIComponent(module.dossierWindows) + '/Application/';
  }

  function fichierPoste(id) { return 'donnees-' + id + '.js'; }

  /* Charge, s'il existe, le fichier de données publié sur le poste
     (catalogue modifié, historique, mot de passe). Un fichier absent ne
     produit qu'une erreur réseau sans conséquence : le catalogue livré
     prend alors le relais. L'écriture synchrone garantit que les données
     sont disponibles avant le démarrage du module. */
  function chargerDonneesPoste(id) {
    const module = MODULES[id];
    if (!module) return;
    if (global.location.protocol !== 'file:' && !global.COMMANDES_DOSSIER_POSTE && !global.AndroidBridge) return;
    const url = dossierPoste(module) + fichierPoste(id) + '?t=' + Date.now();
    global.document.write('<script src="' + url + '" onerror="void 0"><\/script>');
  }

  /* Libellé du dossier de données affiché à l'utilisateur. */
  function libelleDossier(module, sousDossier) {
    const parties = [module.dossierWindows].concat(sousDossier ? [sousDossier] : []);
    return global.AndroidBridge
      ? 'le dossier Commandes de l’appareil/' + parties.join('/')
      : 'C:\\commandes\\' + parties.join('\\');
  }

  function lienModule(id) {
    const module = MODULES[id];
    const hash = global.WindowsStorage && global.WindowsStorage.hash ? global.WindowsStorage.hash : '';
    return (module ? module.page : 'index.html') + hash;
  }

  global.CommandesModules = Object.freeze({
    VERSION,
    MODULES,
    ORDRE,
    get: id => MODULES[id],
    dossierPoste,
    fichierPoste,
    chargerDonneesPoste,
    lienModule,
    libelleDossier,
    cleResume: id => 'commandes-resume:' + id,
    cleHistorique: id => 'commandes-historique:' + id,
    CLE_SIGNATAIRES: 'commandes-signataires',
    CLE_CASSE: 'commandes-casse-noms'
  });
})(window);
