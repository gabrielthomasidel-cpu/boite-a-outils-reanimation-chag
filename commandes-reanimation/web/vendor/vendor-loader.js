/* ============================================================
   Chargement des bibliothèques lourdes
   ============================================================
   xlsx (881 Ko) et pdf-lib (525 Ko) ne sont pas chargés au démarrage.
   Chaque bibliothèque est récupérée à la première utilisation réelle.
   pdf-lib, nécessaire à chaque impression, est préchargé discrètement une
   fois la page affichée ; xlsx n'est chargé que pour un import ou un export
   au format Excel.

   Toutes les fonctions renvoient une promesse mémorisée : plusieurs appels
   simultanés ne déclenchent qu'un seul téléchargement.
   ============================================================ */
(function (global) {
  'use strict';

  var SOURCES = {
    xlsx: 'vendor/xlsx.full.min.js',
    pdflib: 'vendor/pdf-lib.min.js',
    scanner: 'vendor/html5-qrcode.min.js' // édition Android uniquement
  };

  var enCours = Object.create(null);

  function charger(nom) {
    var src = SOURCES[nom];
    if (!src) return Promise.reject(new Error('Composant inconnu : ' + nom));
    if (enCours[nom]) return enCours[nom];
    enCours[nom] = new Promise(function (resolve, reject) {
      var balise = document.createElement('script');
      balise.src = src;
      balise.async = false;
      balise.onload = function () { resolve(true); };
      balise.onerror = function () {
        delete enCours[nom];
        reject(new Error('Composant « ' + nom + ' » introuvable dans l’application.'));
      };
      (document.head || document.documentElement).appendChild(balise);
    });
    return enCours[nom];
  }

  /* Attend que la page soit affichée, puis un moment de repos du processeur. */
  var peinture = null;
  function apresPeinture() {
    if (peinture) return peinture;
    peinture = new Promise(function (resolve) {
      function auRepos() {
        if (typeof global.requestIdleCallback === 'function') {
          global.requestIdleCallback(function () { resolve(); }, { timeout: 1200 });
        } else {
          global.setTimeout(resolve, 200);
        }
      }
      if (document.readyState === 'complete') auRepos();
      else global.addEventListener('load', auRepos, { once: true });
    });
    return peinture;
  }

  global.chargerVendor = charger;

  global.chargerVendorApresPeinture = function (nom) {
    return apresPeinture().then(function () { return charger(nom); });
  };

  /* Préchargement en tâche de fond de pdf-lib. Un échec est ignoré : la
     demande explicite réessaiera et affichera alors un message. */
  apresPeinture().then(function () {
    return charger('pdflib').catch(function () { return null; });
  });
})(window);
