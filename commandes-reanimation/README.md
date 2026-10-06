# Commandes Réanimation

Application de comptage et de commande du service de réanimation : **Solutés**, **Matériel Pharmacie** et **Magasin**. Elle tourne hors connexion dans une fenêtre Microsoft Edge ouverte par un petit lanceur Windows.

Version actuelle : **2.7.0**. Le commit « import de la version Windows 2.6.2 » conserve la version d'origine pour comparaison.

## Organisation

```
web/                     application (ouverte en file:// par le lanceur)
  index.html             accueil : état des commandes en cours, listes papier
  Commande_*.html        une page courte par module (configuration + scripts)
  css/commandes.css      feuille de style unique, thèmes clair et sombre
  js/modules.js          configuration des trois modules et de leurs différences
  js/app-shell.js        structure d'écran commune et mode d'emploi
  js/core/donnees.js     références, formats JSON/CSV/XLSX, catalogue, contrôle d'intégrité,
                         publication des données du poste
  js/core/liste.js       règles de calcul, liste, vues, zones, scan, sauvegarde automatique
  js/core/impression.js  impression, PDF, étiquettes, historique
  js/core/interface.js   fenêtres, administration, historique, étiquettes
  js/core/demarrage.js   initialisation
  catalogues/*.js        catalogues livrés (données uniquement)
  img/                   icônes vectorielles
  vendor/                pdf-lib, SheetJS, encodeur QR
android/                 édition Android (APK autonome)
  src/…/MainActivity.java    WebView + pont natif (dossier, impression, caméra, PDF)
  AndroidManifest.xml, res/  manifeste et icônes
  vendor/                    lecteur caméra html5-qrcode (ajouté à l'APK seulement)
  construire-apk.sh          construction de dist/Commandes_Reanimation_<version>.apk
windows/
  CommandesReanimation.exe   lanceur (.NET Framework) : ouvre Edge et sert l'écriture dans C:\commandes
  lanceur/                   source C# du lanceur (Lanceur.cs, Lanceur.csproj)
  construire-lanceur.sh      construction de CommandesReanimation.exe (dotnet SDK)
  installateur.nsi           script de l'installateur NSIS
  construire-installateur.sh construction de dist/Commandes_Reanimation_Setup_<version>.exe
tests/                   tests automatisés (Playwright)
```

Toute différence de comportement entre modules passe par `js/modules.js` : le code métier est unique.

## Données

Dossiers des modules : `DM_Pharmacie`, `Solutés`, `Magasin` (l'ancien dossier `Pharmacie` est renommé automatiquement par le lanceur Windows et par l'APK). Fichiers produits : `Nature_Module_horodatage` — `Catalogue_DM_Pharmacie_…`, `Commande_Magasin_….pdf`, `Historique_Solutes_….csv`, `Etiquettes_DM_Pharmacie_…pdf`, `Donnees_Magasin.js`.

| Donnée | Emplacement |
|---|---|
| Comptage en cours, résumé pour l'accueil, signataires | stockage local du profil Edge (`%LOCALAPPDATA%\CommandesReanimationWin64\Profil`) |
| Catalogue modifié, historique (100 dernières commandes), mot de passe | stockage local **et** `C:\commandes\<Module>\Application\Donnees_<Module>.js` |
| PDF de commande, exports, étiquettes | `C:\commandes\<module>\{Archives, Sauvegardes, Etiquettes, Application}` |

Le fichier `Donnees_<Module>.js` (ancien nom `donnees-<id>.js`, toujours relu) est publié automatiquement par l'application (via le lanceur) et relu à chaque ouverture : la version la plus récente du catalogue l'emporte. Les données sont ainsi reprises sans manipulation après une réinstallation, un nouveau profil Edge ou sur un autre compte Windows du même poste. Un catalogue publié pour un ancien catalogue livré est ignoré, comme en 2.6.

Les clés de stockage, empreintes de catalogue et de mot de passe de la 2.6 sont inchangées : une mise à jour conserve les comptages et catalogues existants.

## Tests

```sh
cd tests
npm install
npx playwright install chromium   # ou CHROMIUM_PATH=/chemin/vers/chrome
npm test
```

Les 42 tests couvrent : chargement sans erreur, empreintes des catalogues, règles de calcul (seuil, Hors Stock, quantité imposée, doublement Matériel), « non compté » contre 0, garde-fous, vues, scan à la douchette, reprise du comptage, « Rempli par », cycle d'impression et historique, commandes d'essai, remise à zéro des statistiques, noms de dossiers et de fichiers, impression en deux travaux (Matériel), accueil, contrôle d'intégrité, administration et import contrôlé, reprise depuis `C:\commandes`, échanges du catalogue JSON/CSV, PDF, étiquettes et listes papier, et l'adaptation Android (pont natif simulé).

## Édition Android

Les mêmes pages web sont embarquées dans l'APK et servies à l'adresse sécurisée `https://appassets.androidplatform.net/web/` (stockage persistant, caméra autorisée, aucune sortie réseau). `web/js/android.js` adapte l'application au pont natif :

- un dossier choisi une fois sur l'appareil remplace `C:\commandes` (même arborescence `DM_Pharmacie|Solutés|Magasin/Application|Sauvegardes|Etiquettes|Archives`) ; les données publiées y sont relues à l'ouverture ;
- impression par le service d'impression Android (PDF ou imprimante) ;
- scan par la caméra (bouton à côté de la recherche et dans la fiche article), en plus de la douchette ;
- Édition de secours ouverte dans le lecteur PDF ; listes papier affichées dans `papier.html` ;
- bouton Retour : ferme la fenêtre ou le panneau ouvert, puis revient à l'accueil.

Construction (sans Gradle) :

```sh
sudo apt install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange apksigner zipalign default-jdk
android/construire-apk.sh
```

La clé de signature (`android/signature/`) n'est pas dans le dépôt. Conservez-la : Android n'accepte une mise à jour que si elle est signée avec la même clé.

## Construire l'installateur

```sh
sudo apt install nsis      # ou makensis sous Windows
windows/construire-installateur.sh
```

L'installateur n'est pas signé. Il s'installe sans droits administrateur dans `%LOCALAPPDATA%\Programs\CommandesReanimationWin64` avec la même clé de désinstallation que la 2.x : une version antérieure est mise à jour en place.
