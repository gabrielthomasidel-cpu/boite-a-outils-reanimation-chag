// L'API File System Access ne divulgue jamais le chemin d'un dossier : c'est
// voulu, un site web n'a pas a savoir ou vivent vos fichiers. Dans l'application
// de bureau la question ne se pose pas, et Electron sait retrouver le chemin
// d'un fichier reel. On n'expose que le strict necessaire, rien d'autre.
const { contextBridge, webUtils, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('applicationBureau', {
  // Le nom de la machine. Il sert a dire, sur un autre poste, qui tient un
  // dossier patient ouvert : le verrou pose a cote du fichier le porte.
  // Rien d'autre du systeme ne sort par la.
  //
  // Le prechargement tourne en bac a sable : « os » n'y existe pas, et un
  // require manquant fait echouer TOUT le pont, silencieusement. Le nom vient
  // donc du processus principal.
  nomDuPoste: (function () {
    try { return ipcRenderer.sendSync('nom-du-poste') || 'poste inconnu'; }
    catch (e) { return 'poste inconnu'; }
  })(),

  cheminDuFichier: function (fichier) {
    try {
      return webUtils.getPathForFile(fichier) || '';
    } catch (e) {
      return '';
    }
  },

  // Apercu avant impression : Electron ouvre la boite de dialogue Windows sans
  // rendu prealable, contrairement au navigateur. On produit donc le PDF exact
  // de l'impression et on l'affiche dans une fenetre, d'ou l'on peut imprimer.
  apercuImpression: function (options) {
    return ipcRenderer.invoke('apercu-impression', options || {});
  },

  // Le PDF est renvoye a la page sous forme d'octets : c'est elle qui detient
  // l'autorisation d'ecrire dans le dossier des patients, pas le processus
  // principal. Rien n'est ecrit sur le disque a son insu.
  pdfImpression: function (options) {
    return ipcRenderer.invoke('pdf-impression', options || {});
  },

  // Imprimer sur papier. La boite de dialogue de Windows ne reprend pas les
  // reglages qu'on lui donne : le format, l'orientation et le recto-verso sont
  // poses par le processus principal, qui imprime lui-meme.
  imprimerDocument: function (options) {
    return ipcRenderer.invoke('imprimer-document', options || {});
  },

  // les imprimantes du poste, pour les faire choisir dans la page
  listeImprimantes: function () {
    return ipcRenderer.invoke('liste-imprimantes');
  },

  // ramener la fenetre de l'application devant avant de poser une question :
  // l'apercu avant impression est une fenetre a part et peut la recouvrir
  auPremierPlan: function () {
    return ipcRenderer.invoke('au-premier-plan');
  },

  // ouvrir un document remis par la page : il est ecrit dans un fichier
  // temporaire, puis confie au lecteur habituel de Windows
  ouvrirFichier: function (nom, octets) {
    return ipcRenderer.invoke('ouvrir-fichier', String(nom || ''), octets);
  },

  // Le menu du clic droit est dresse par le processus principal, qui ne sait
  // rien des cellules de la feuille. La page lui dit, juste avant, si la case
  // visee est en gras ou en italique et quelle base l'alimente : les entrees
  // « Gras » et « Italique » sont cochees en consequence, « Ajouter a la base »
  // n'apparait que la. L'observation passe par la page, qui relaie.
  signalerCelluleVisee: function (info) {
    ipcRenderer.send('cellule-visee', info || null);
  },

  surDemandeVersement: function (rappel) {
    ipcRenderer.on('verser-dans-la-base', function () { rappel(); });
  },

  // les entrees Gras et Italique du meme menu : la page bascule la case visee
  surDemandeStyle: function (rappel) {
    ipcRenderer.on('basculer-style', function (evenement, style) {
      rappel(style === 'gras' ? 'gras' : 'italique');
    });
  },

  // ouvrir un dossier dans l'explorateur de Windows
  ouvrirDossier: function (chemin) {
    return ipcRenderer.invoke('ouvrir-dossier', String(chemin || ''));
  },

  // le menu Fichier > Apercu avant impression passe par la page, qui sait dans
  // quel format imprimer selon l'ecran affiche
  surDemandeApercu: function (rappel) {
    ipcRenderer.on('demande-apercu', function () { rappel(); });
  },

  // La croix de la fenetre, Alt+F4 et le menu Fichier > Quitter ne ferment plus
  // l'application : ils previennent la page, qui enregistre. On accuse reception
  // aussitot, pour que le processus principal sache que la page repond et lui
  // laisse le temps qu'il faut.
  surDemandeFermeture: function (rappel) {
    ipcRenderer.on('demande-fermeture', function () {
      try { ipcRenderer.send('fermeture-en-cours'); } catch (e) {}
      rappel();
    });
  },

  // tout est enregistre : la page rend la main a Windows
  quitter: function () {
    return ipcRenderer.invoke('fermer-application');
  },

  // un enregistrement n'a pas abouti, ou l'utilisateur renonce : la fenetre reste
  fermetureAnnulee: function () {
    try { ipcRenderer.send('fermeture-annulee'); } catch (e) {}
  }
});
