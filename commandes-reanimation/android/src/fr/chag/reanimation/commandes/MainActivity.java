package fr.chag.reanimation.commandes;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Commandes Réanimation — édition Android.
 *
 * Les pages web de l'application (identiques à l'édition Windows) sont
 * servies depuis les ressources de l'APK sous l'adresse sécurisée
 * https://appassets.androidplatform.net/web/ : stockage local persistant,
 * caméra autorisée (contexte sécurisé) et aucune sortie réseau.
 *
 * Le pont « AndroidBridge » remplace le lanceur Windows : il écrit les
 * fichiers dans un dossier choisi une fois pour toutes (équivalent de
 * C:\commandes, même arborescence Module/Catégorie), relit les données
 * publiées, imprime via le service d'impression Android et ouvre les PDF.
 */
public class MainActivity extends Activity {

    private static final String HOTE = "appassets.androidplatform.net";
    private static final String ACCUEIL = "https://" + HOTE + "/web/index.html";
    private static final String PREFS = "commandes";
    private static final String CLE_DOSSIER = "dossier";
    private static final int DEMANDE_DOSSIER = 41;
    private static final int DEMANDE_FICHIER = 42;
    private static final int DEMANDE_CAMERA = 43;
    private static final String[] MODULES = { "DM_Pharmacie", "Solutés", "Magasin" };

    private WebView webView;
    private final Handler principal = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> choixFichier;
    private PermissionRequest demandeCamera;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        getWindow().setStatusBarColor(Color.parseColor("#0f161c"));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0f161c"));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setTextZoom(100);
        s.setBuiltInZoomControls(false);

        webView.addJavascriptInterface(new Pont(), "AndroidBridge");
        webView.setWebViewClient(new ClientWeb());
        webView.setWebChromeClient(new ClientChrome());

        migrerAncienDossier();
        if (etat != null) webView.restoreState(etat);
        else webView.loadUrl(ACCUEIL);
    }

    @Override
    protected void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        webView.saveState(etat);
    }

    @Override
    protected void onPause() {
        // Laisse la page écrire sa sauvegarde automatique avant la mise en veille.
        webView.evaluateJavascript("window.dispatchEvent(new Event('pagehide'));", null);
        super.onPause();
    }

    /* Retour : ferme d'abord la fenêtre ou le panneau ouvert, puis revient à
       la page précédente, puis quitte. */
    @Override
    public boolean onKeyDown(int code, KeyEvent evenement) {
        if (code == KeyEvent.KEYCODE_BACK) {
            webView.evaluateJavascript("(window.CommandesRetour ? window.CommandesRetour() : false)", new ValueCallback<String>() {
                @Override public void onReceiveValue(String valeur) {
                    if ("true".equals(valeur)) return;
                    if (webView.canGoBack()) webView.goBack();
                    else finish();
                }
            });
            return true;
        }
        return super.onKeyDown(code, evenement);
    }

    /* ================= Pages embarquées ================= */
    private class ClientWeb extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView vue, WebResourceRequest requete) {
            Uri url = requete.getUrl();
            if (!HOTE.equals(url.getHost())) return reponse(403, "text/plain", null);
            String chemin = url.getPath() == null ? "" : url.getPath();
            try {
                if (chemin.startsWith("/web/")) {
                    InputStream flux = getAssets().open(chemin.substring(1), AssetManager.ACCESS_STREAMING);
                    return reponse(200, typeMime(chemin), flux);
                }
                if (chemin.startsWith("/poste/")) {
                    // /poste/<Module>/<Catégorie>/<fichier> : données publiées
                    String[] parties = chemin.substring(7).split("/");
                    if (parties.length == 3) {
                        byte[] contenu = lireFichier(parties[0], parties[1], parties[2]);
                        if (contenu != null) return reponse(200, typeMime(chemin), new ByteArrayInputStream(contenu));
                    }
                }
            } catch (IOException e) {
                // fichier absent : 404 ci-dessous
            }
            return reponse(404, "text/plain", null);
        }

        /* Variante appelée sur toutes les versions d'Android (la variante
           WebResourceRequest n'existe qu'à partir de l'API 24 et y renvoie). */
        @Override
        public boolean shouldOverrideUrlLoading(WebView vue, String adresse) {
            Uri url = Uri.parse(adresse);
            if (HOTE.equals(url.getHost())) return false;
            return true; // aucune navigation externe
        }
    }

    private static WebResourceResponse reponse(int statut, String mime, InputStream flux) {
        Map<String, String> entetes = new HashMap<String, String>();
        entetes.put("Cache-Control", "no-store");
        if (flux == null) flux = new ByteArrayInputStream(new byte[0]);
        return new WebResourceResponse(mime, "utf-8", statut, statut == 200 ? "OK" : "Not Found", entetes, flux);
    }

    private static String typeMime(String chemin) {
        String c = chemin.toLowerCase(Locale.ROOT);
        if (c.endsWith(".html")) return "text/html";
        if (c.endsWith(".js")) return "text/javascript";
        if (c.endsWith(".css")) return "text/css";
        if (c.endsWith(".svg")) return "image/svg+xml";
        if (c.endsWith(".png")) return "image/png";
        if (c.endsWith(".json")) return "application/json";
        if (c.endsWith(".pdf")) return "application/pdf";
        if (c.endsWith(".csv")) return "text/csv";
        if (c.endsWith(".txt")) return "text/plain";
        if (c.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return "application/octet-stream";
    }

    /* ================= Caméra et choix de fichier ================= */
    private class ClientChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest demande) {
            principal.post(new Runnable() {
                @Override public void run() {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        demande.grant(demande.getResources());
                    } else {
                        demandeCamera = demande;
                        requestPermissions(new String[] { Manifest.permission.CAMERA }, DEMANDE_CAMERA);
                    }
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView vue, ValueCallback<Uri[]> rappel, FileChooserParams parametres) {
            if (choixFichier != null) choixFichier.onReceiveValue(null);
            choixFichier = rappel;
            Intent intention = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intention.addCategory(Intent.CATEGORY_OPENABLE);
            intention.setType("*/*");
            try {
                startActivityForResult(intention, DEMANDE_FICHIER);
            } catch (Exception e) {
                choixFichier = null;
                return false;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] resultats) {
        if (code != DEMANDE_CAMERA || demandeCamera == null) return;
        if (resultats.length > 0 && resultats[0] == PackageManager.PERMISSION_GRANTED) demandeCamera.grant(demandeCamera.getResources());
        else demandeCamera.deny();
        demandeCamera = null;
    }

    @Override
    protected void onActivityResult(int code, int resultat, Intent donnees) {
        if (code == DEMANDE_FICHIER) {
            if (choixFichier != null) {
                Uri[] choix = null;
                if (resultat == RESULT_OK && donnees != null && donnees.getData() != null) choix = new Uri[] { donnees.getData() };
                choixFichier.onReceiveValue(choix);
                choixFichier = null;
            }
            return;
        }
        if (code == DEMANDE_DOSSIER) {
            String nom = "";
            if (resultat == RESULT_OK && donnees != null && donnees.getData() != null) {
                Uri arbre = donnees.getData();
                try {
                    getContentResolver().takePersistableUriPermission(arbre,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(CLE_DOSSIER, arbre.toString()).apply();
                    migrerAncienDossier();
                    for (String module : MODULES) {
                        for (String categorie : new String[] { "Application", "Sauvegardes", "Etiquettes", "Archives" }) {
                            dossier(arbre, module, categorie, true);
                        }
                    }
                    nom = nomDossier();
                } catch (Exception e) {
                    nom = "";
                }
            }
            evenement("androiddossier", nom);
            return;
        }
        super.onActivityResult(code, resultat, donnees);
    }

    private void evenement(final String type, final String detail) {
        principal.post(new Runnable() {
            @Override public void run() {
                String js = "window.dispatchEvent(new CustomEvent(" + jsTexte(type) + ",{detail:" + jsTexte(detail) + "}));";
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private static String jsTexte(String valeur) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : (valeur == null ? "" : valeur).toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /* ================= Dossier de l'application (Storage Access Framework) ================= */
    private Uri arbre() {
        String valeur = getSharedPreferences(PREFS, MODE_PRIVATE).getString(CLE_DOSSIER, null);
        return valeur == null ? null : Uri.parse(valeur);
    }

    private String nomDossier() {
        Uri a = arbre();
        if (a == null) return "";
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(a, DocumentsContract.getTreeDocumentId(a));
        Cursor c = null;
        try {
            c = getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            return "";
        } finally {
            if (c != null) c.close();
        }
        return "";
    }

    /**
     * Version 2.7 : le sous-dossier « Pharmacie » devient « DM_Pharmacie ».
     * Un dossier existant est renommé, sauf si le nouveau existe déjà.
     */
    private void migrerAncienDossier() {
        Uri a = arbre();
        if (a == null) return;
        try {
            String racine = DocumentsContract.getTreeDocumentId(a);
            String ancien = enfant(a, racine, "Pharmacie");
            if (ancien != null && enfant(a, racine, "DM_Pharmacie") == null) {
                DocumentsContract.renameDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(a, ancien), "DM_Pharmacie");
            }
        } catch (Exception e) {
            // Dossier en lecture seule ou indisponible : DM_Pharmacie sera créé à côté.
        }
    }

    /** Recherche un enfant par son nom ; renvoie son identifiant de document ou null. */
    private String enfant(Uri arbre, String parentId, String nom) {
        Uri enfants = DocumentsContract.buildChildDocumentsUriUsingTree(arbre, parentId);
        Cursor c = null;
        try {
            c = getContentResolver().query(enfants, new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            while (c != null && c.moveToNext()) {
                if (nom.equals(c.getString(1))) return c.getString(0);
            }
        } finally {
            if (c != null) c.close();
        }
        return null;
    }

    private String dossier(Uri arbre, String module, String categorie, boolean creer) throws IOException {
        ContentResolver r = getContentResolver();
        String racine = DocumentsContract.getTreeDocumentId(arbre);
        String idModule = enfant(arbre, racine, module);
        if (idModule == null) {
            if (!creer) return null;
            Uri u = DocumentsContract.createDocument(r, DocumentsContract.buildDocumentUriUsingTree(arbre, racine), DocumentsContract.Document.MIME_TYPE_DIR, module);
            if (u == null) throw new IOException("Création du dossier " + module + " impossible");
            idModule = DocumentsContract.getDocumentId(u);
        }
        String idCategorie = enfant(arbre, idModule, categorie);
        if (idCategorie == null) {
            if (!creer) return null;
            Uri u = DocumentsContract.createDocument(r, DocumentsContract.buildDocumentUriUsingTree(arbre, idModule), DocumentsContract.Document.MIME_TYPE_DIR, categorie);
            if (u == null) throw new IOException("Création du dossier " + categorie + " impossible");
            idCategorie = DocumentsContract.getDocumentId(u);
        }
        return idCategorie;
    }

    /** Même répartition que le lanceur Windows : tout dossier inconnu va dans Archives. */
    private static String categorie(String demandee) {
        if ("Application".equals(demandee) || demandee == null || demandee.isEmpty()) return "Application";
        if ("Sauvegardes".equals(demandee)) return "Sauvegardes";
        if ("Etiquettes".equals(demandee)) return "Etiquettes";
        return "Archives";
    }

    /** L'ancien nom « Pharmacie » reste accepté et désigne DM_Pharmacie. */
    private static String module(String module) {
        return "Pharmacie".equals(module) ? "DM_Pharmacie" : module;
    }

    private static boolean moduleValide(String module) {
        for (String m : MODULES) if (m.equals(module)) return true;
        return false;
    }

    private static boolean nomValide(String nom) {
        return nom != null && !nom.trim().isEmpty() && !nom.contains("/") && !nom.contains("\\")
            && !nom.contains("..") && !nom.endsWith(".") && !nom.endsWith(" ");
    }

    private byte[] lireFichier(String module, String categorie, String nom) {
        module = module(module);
        Uri a = arbre();
        if (a == null || !moduleValide(module) || !nomValide(nom)) return null;
        InputStream entree = null;
        try {
            String idDossier = dossier(a, module, categorie(categorie), false);
            if (idDossier == null) return null;
            String id = enfant(a, idDossier, nom);
            if (id == null) return null;
            entree = getContentResolver().openInputStream(DocumentsContract.buildDocumentUriUsingTree(a, id));
            if (entree == null) return null;
            ByteArrayOutputStream sortie = new ByteArrayOutputStream();
            byte[] tampon = new byte[16384];
            int n;
            while ((n = entree.read(tampon)) > 0) sortie.write(tampon, 0, n);
            return sortie.toByteArray();
        } catch (Exception e) {
            return null;
        } finally {
            if (entree != null) try { entree.close(); } catch (IOException ignore) {}
        }
    }

    private String ecrireFichier(String module, String categorieDemandee, String nom, byte[] contenu) throws IOException {
        module = module(module);
        Uri a = arbre();
        if (a == null) throw new IOException("aucun-dossier");
        if (!moduleValide(module)) throw new IOException("Module inconnu");
        if (!nomValide(nom)) throw new IOException("Nom de fichier invalide");
        ContentResolver r = getContentResolver();
        String categorie = categorie(categorieDemandee);
        String idDossier = dossier(a, module, categorie, true);
        String existant = enfant(a, idDossier, nom);
        Uri cible;
        if (existant != null) {
            // Comme sous Windows : la version remplacée est copiée dans Archives.
            byte[] ancien = lireFichier(module, categorie, nom);
            if (ancien != null) {
                String horodatage = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.ROOT).format(new Date());
                int point = nom.lastIndexOf('.');
                String archive = (point > 0 ? nom.substring(0, point) : nom) + "_" + horodatage + (point > 0 ? nom.substring(point) : "");
                String idArchives = dossier(a, module, "Archives", true);
                Uri u = DocumentsContract.createDocument(r, DocumentsContract.buildDocumentUriUsingTree(a, idArchives), typeMime(nom), archive);
                if (u != null) ecrireFlux(u, ancien);
            }
            cible = DocumentsContract.buildDocumentUriUsingTree(a, existant);
        } else {
            cible = DocumentsContract.createDocument(r, DocumentsContract.buildDocumentUriUsingTree(a, idDossier), typeMime(nom), nom);
            if (cible == null) throw new IOException("Création du fichier impossible");
        }
        ecrireFlux(cible, contenu);
        return nomDossier() + "/" + module + "/" + categorie + "/" + nom;
    }

    private void ecrireFlux(Uri cible, byte[] contenu) throws IOException {
        OutputStream sortie = getContentResolver().openOutputStream(cible, "wt");
        if (sortie == null) throw new IOException("Écriture impossible");
        try { sortie.write(contenu); } finally { sortie.close(); }
    }

    /* ================= Impression ================= */
    private void imprimer(final String titre) {
        principal.post(new Runnable() {
            @Override public void run() {
                PrintManager gestionnaire = (PrintManager) getSystemService(PRINT_SERVICE);
                final PrintDocumentAdapter base = webView.createPrintDocumentAdapter(titre);
                final PrintJob[] travail = new PrintJob[1];
                PrintDocumentAdapter adaptateur = new PrintDocumentAdapter() {
                    @Override public void onStart() { base.onStart(); }
                    @Override public void onLayout(PrintAttributes ancien, PrintAttributes nouveau, CancellationSignal annulation, LayoutResultCallback rappel, Bundle options) {
                        base.onLayout(ancien, nouveau, annulation, rappel, options);
                    }
                    @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal annulation, WriteResultCallback rappel) {
                        base.onWrite(pages, destination, annulation, rappel);
                    }
                    @Override public void onFinish() {
                        base.onFinish();
                        // L'état du travail indique si l'utilisateur a annulé.
                        principal.postDelayed(new Runnable() {
                            @Override public void run() {
                                PrintJob t = travail[0];
                                boolean annule = t != null && (t.isCancelled() || t.isFailed());
                                evenement(annule ? "androidprintcancelled" : "androidprintfinished", titre);
                            }
                        }, 400);
                    }
                };
                PrintAttributes attributs = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                    .build();
                travail[0] = gestionnaire.print(titre, adaptateur, attributs);
            }
        });
    }

    /* ================= Pont JavaScript ================= */
    private class Pont {
        @JavascriptInterface
        public String getDirectory() { return nomDossier(); }

        @JavascriptInterface
        public void chooseDirectory() {
            principal.post(new Runnable() {
                @Override public void run() {
                    Intent intention = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    intention.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        | Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    try { startActivityForResult(intention, DEMANDE_DOSSIER); }
                    catch (Exception e) { evenement("androiddossier", ""); }
                }
            });
        }

        /** Écrit un fichier ; renvoie le chemin, ou « ! » suivi du message d'erreur. */
        @JavascriptInterface
        public String writeFile(String module, String categorie, String nom, String base64) {
            try {
                return ecrireFichier(module, categorie, nom, Base64.decode(base64, Base64.DEFAULT));
            } catch (Exception e) {
                return "!" + (e.getMessage() == null ? "Écriture impossible" : e.getMessage());
            }
        }

        /** Ouvre un fichier du dossier dans l'application adaptée (lecteur PDF). */
        @JavascriptInterface
        public String openFile(String module, String categorie, String nom) {
            try {
                Uri a = arbre();
                if (a == null) return "!aucun-dossier";
                String idDossier = dossier(a, module, categorie(categorie), false);
                String id = idDossier == null ? null : enfant(a, idDossier, nom);
                if (id == null) return "!Fichier introuvable";
                final Intent intention = new Intent(Intent.ACTION_VIEW);
                intention.setDataAndType(DocumentsContract.buildDocumentUriUsingTree(a, id), typeMime(nom));
                intention.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                principal.post(new Runnable() {
                    @Override public void run() {
                        try { startActivity(intention); }
                        catch (Exception e) { Toast.makeText(MainActivity.this, "Aucune application ne peut ouvrir ce fichier.", Toast.LENGTH_LONG).show(); }
                    }
                });
                return "ok";
            } catch (Exception e) {
                return "!" + e.getMessage();
            }
        }

        @JavascriptInterface
        public void printPage(String titre) { imprimer(titre == null || titre.isEmpty() ? "Commandes Réanimation" : titre); }

        @JavascriptInterface
        public void close() {
            principal.post(new Runnable() { @Override public void run() { finish(); } });
        }
    }
}
