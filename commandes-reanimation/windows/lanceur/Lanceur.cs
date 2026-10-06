// Commandes Réanimation — lanceur Windows.
//
// Ouvre les pages web de l'application dans une fenêtre Microsoft Edge dédiée
// (profil propre à l'application) et sert, sur la boucle locale uniquement,
// l'enregistrement des fichiers dans C:\commandes. Chaque requête doit porter
// le jeton aléatoire transmis à la page au démarrage.
//
// Source reconstituée à partir de la version 2.6.2, puis modifiée en 2.7.0 :
// le dossier « Pharmacie » devient « DM_Pharmacie » (un dossier existant est
// renommé automatiquement) et les PDF de commande suivent la convention
// Commande_<Module>_<horodatage>.pdf.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Lanceur
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string accueil = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html");
            if (!File.Exists(accueil))
                throw new Exception("Les fichiers de l'application sont absents. Réinstallez l'application.");

            string edge = null;
            foreach (string racine in new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) })
            {
                string chemin = Path.Combine(racine, "Microsoft", "Edge", "Application", "msedge.exe");
                if (File.Exists(chemin)) { edge = chemin; break; }
            }
            if (edge == null)
                throw new Exception("Microsoft Edge est requis. Installez Microsoft Edge, puis relancez l'application.");

            if (args.Length == 1 && args[0] == "--self-test") return 0;

            string profil = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CommandesReanimationWin64", "Profil");
            Directory.CreateDirectory(profil);
            var serveur = new ServeurStockage("C:\\commandes");
            var demarrage = new ProcessStartInfo(edge,
                "--user-data-dir=\"" + profil + "\" --app=\"" + new Uri(accueil).AbsoluteUri
                + "#storage=" + serveur.Port + ":" + serveur.Jeton + "\"");
            demarrage.UseShellExecute = false;
            Process.Start(demarrage);
            serveur.Executer();
            return 0;
        }
        catch (Exception ex)
        {
            if (args.Length == 0)
                MessageBox.Show(ex.Message, "Commandes Réanimation", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

internal sealed class ServeurStockage
{
    private static readonly string[] Modules = { "DM_Pharmacie", "Solutés", "Magasin" };
    private static readonly string[] Categories = { "Application", "Archives", "Sauvegardes", "Etiquettes" };

    private readonly TcpListener ecoute = new TcpListener(IPAddress.Loopback, 0);
    private readonly string racine;

    public readonly string Jeton = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    public int Port { get { return ((IPEndPoint)ecoute.LocalEndpoint).Port; } }

    public ServeurStockage(string chemin)
    {
        racine = Path.GetFullPath(chemin);
        MigrerAncienDossier();
        foreach (string module in Modules)
            foreach (string categorie in Categories)
                Directory.CreateDirectory(Path.Combine(racine, module, categorie));
        ecoute.Start();
    }

    /// <summary>
    /// Versions 2.6 et antérieures : C:\commandes\Pharmacie est renommé en
    /// DM_Pharmacie. Si les deux existent, l'ancien est laissé en place.
    /// </summary>
    private void MigrerAncienDossier()
    {
        try
        {
            string ancien = Path.Combine(racine, "Pharmacie");
            string nouveau = Path.Combine(racine, "DM_Pharmacie");
            if (Directory.Exists(ancien) && !Directory.Exists(nouveau)
                && (File.GetAttributes(ancien) & FileAttributes.ReparsePoint) == 0)
                Directory.Move(ancien, nouveau);
        }
        catch
        {
            // Dossier ouvert ou verrouillé : DM_Pharmacie est créé à côté.
        }
    }

    /// <summary>Nom de module autorisé ; l'ancien nom « Pharmacie » reste accepté.</summary>
    private static string Module(string module)
    {
        if (module == "Pharmacie") return "DM_Pharmacie";
        if (Array.IndexOf(Modules, module) < 0) throw new Exception("Module inconnu");
        return module;
    }

    private static string Categorie(string demandee)
    {
        if (demandee == "Application" || string.IsNullOrEmpty(demandee)) return "Application";
        if (demandee == "Sauvegardes") return "Sauvegardes";
        if (demandee == "Etiquettes") return "Etiquettes";
        return "Archives";
    }

    private void RefuserRedirection(string dossier)
    {
        string courant = dossier;
        while (courant != null && courant.Length >= racine.Length)
        {
            if ((File.GetAttributes(courant) & FileAttributes.ReparsePoint) != 0)
                throw new Exception("Dossier redirigé non autorisé");
            courant = Path.GetDirectoryName(courant);
        }
    }

    public string Enregistrer(string module, string categorie, string nom, byte[] donnees)
    {
        module = Module(module);
        if (string.IsNullOrWhiteSpace(nom) || nom != Path.GetFileName(nom)
            || nom.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || nom.EndsWith(".") || nom.EndsWith(" "))
            throw new Exception("Nom de fichier invalide");

        string dossier = Path.Combine(racine, module, Categorie(categorie));
        string cible = Path.Combine(dossier, nom);
        RefuserRedirection(dossier);
        if (File.Exists(cible))
        {
            if ((File.GetAttributes(cible) & FileAttributes.ReparsePoint) != 0)
                throw new Exception("Fichier redirigé non autorisé");
            // La version remplacée est conservée dans Archives.
            File.Copy(cible, Path.Combine(racine, module, "Archives",
                Path.GetFileNameWithoutExtension(nom) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss_fff")
                + "_" + Guid.NewGuid().ToString("N").Substring(0, 6) + Path.GetExtension(nom)));
        }
        string temporaire = Path.Combine(dossier, Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            File.WriteAllBytes(temporaire, donnees);
            if (File.Exists(cible)) File.Replace(temporaire, cible, null);
            else File.Move(temporaire, cible);
        }
        finally
        {
            if (File.Exists(temporaire)) File.Delete(temporaire);
        }
        return cible;
    }

    private string DossierModule(string module, string categorie)
    {
        string dossier = Path.Combine(racine, Module(module), categorie);
        RefuserRedirection(dossier);
        return dossier;
    }

    /// <summary>Dernier PDF de commande du module (noms 2.7 et noms antérieurs).</summary>
    public string DernierPdf(string module)
    {
        module = Module(module);
        string dossier = DossierModule(module, "Archives");
        string[] prefixes = module == "DM_Pharmacie"
            ? new[] { "Commande_DM_Pharmacie_", "Commande_Materiel_Reanimation_" }
            : module == "Solutés"
                ? new[] { "Commande_Solutes_" }
                : new[] { "Commande_Magasin_", "Commande_Aide_Soignant_" };
        string retenu = null;
        foreach (string prefixe in prefixes)
            foreach (string fichier in Directory.GetFiles(dossier, prefixe + "*.pdf"))
                if ((File.GetAttributes(fichier) & FileAttributes.ReparsePoint) == 0
                    && (retenu == null || File.GetLastWriteTimeUtc(fichier) > File.GetLastWriteTimeUtc(retenu)))
                    retenu = fichier;
        if (retenu == null) throw new Exception("Aucun PDF de commande enregistré dans " + dossier);
        return retenu;
    }

    private object ChargerCommande(string module)
    {
        string dossier = DossierModule(module, "Sauvegardes");
        string choisi = null;
        Exception echec = null;
        var fil = new Thread(delegate ()
        {
            try
            {
                using (var dialogue = new OpenFileDialog())
                {
                    dialogue.InitialDirectory = dossier;
                    dialogue.Title = "Charger la commande — " + module;
                    dialogue.Filter = "Commandes sauvegardées|*.json;*.csv;*.xlsx";
                    dialogue.RestoreDirectory = true;
                    if (dialogue.ShowDialog() == DialogResult.OK) choisi = dialogue.FileName;
                }
            }
            catch (Exception ex) { echec = ex; }
        });
        fil.SetApartmentState(ApartmentState.STA);
        fil.Start();
        fil.Join();
        if (echec != null) throw echec;
        if (choisi == null) return new { cancelled = true };
        if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(choisi)), dossier, StringComparison.OrdinalIgnoreCase)
            || (File.GetAttributes(choisi) & FileAttributes.ReparsePoint) != 0)
            throw new Exception("Choisissez une commande dans " + dossier);
        string extension = Path.GetExtension(choisi).ToLowerInvariant();
        if (extension != ".json" && extension != ".csv" && extension != ".xlsx") throw new Exception("Format non pris en charge");
        if (new FileInfo(choisi).Length > 20000000) throw new Exception("Fichier trop volumineux");
        return new { name = Path.GetFileName(choisi), format = extension.Substring(1), data = Convert.ToBase64String(File.ReadAllBytes(choisi)) };
    }

    /// <summary>
    /// Sert les requêtes de la page tant qu'elle reste active : arrêt après
    /// trois minutes sans requête (la page envoie un « ping » régulier).
    /// </summary>
    public void Executer()
    {
        DateTime derniere = DateTime.UtcNow;
        while ((DateTime.UtcNow - derniere).TotalMinutes < 3.0)
        {
            if (!ecoute.Pending()) { Thread.Sleep(100); continue; }
            using (TcpClient client = ecoute.AcceptTcpClient())
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 10000;
                try
                {
                    NetworkStream flux = client.GetStream();
                    var lecteur = new StreamReader(flux, Encoding.UTF8, false, 4096, true);
                    string ligne = lecteur.ReadLine() ?? "";
                    string jeton = "", origine = "", entete;
                    int longueur = 0;
                    while (!string.IsNullOrEmpty(entete = lecteur.ReadLine()))
                    {
                        int deuxPoints = entete.IndexOf(':');
                        if (deuxPoints < 0) continue;
                        string cle = entete.Substring(0, deuxPoints).ToLowerInvariant();
                        string valeur = entete.Substring(deuxPoints + 1).Trim();
                        if (cle == "content-length") longueur = int.Parse(valeur);
                        if (cle == "x-commandes-token") jeton = valeur;
                        if (cle == "origin") origine = valeur;
                    }

                    int statut = 200;
                    string reponse;
                    // Seule une page ouverte depuis le disque (origine « null ») est servie.
                    if (origine != "null") { statut = 403; reponse = "{}"; }
                    else if (ligne.StartsWith("OPTIONS ")) reponse = "{}";
                    else if (jeton != Jeton) { statut = 403; reponse = "{}"; }
                    else if (ligne.StartsWith("POST /ping ")) { derniere = DateTime.UtcNow; reponse = "{}"; }
                    else if ((!ligne.StartsWith("POST /save ") && !ligne.StartsWith("POST /load ") && !ligne.StartsWith("POST /open-last-pdf "))
                             || longueur < 1 || longueur > 40000000)
                    { statut = 400; reponse = "{}"; }
                    else
                    {
                        derniere = DateTime.UtcNow;
                        var corps = new char[longueur];
                        int lus = 0, n;
                        while (lus < longueur && (n = lecteur.Read(corps, lus, longueur - lus)) > 0) lus += n;
                        if (lus != longueur) throw new Exception("Requête incomplète");
                        var json = new JavaScriptSerializer { MaxJsonLength = 40000000 };
                        try
                        {
                            var demande = json.Deserialize<Dictionary<string, string>>(new string(corps));
                            if (ligne.StartsWith("POST /load "))
                                reponse = json.Serialize(ChargerCommande(demande["module"]));
                            else if (ligne.StartsWith("POST /open-last-pdf "))
                            {
                                string pdf = DernierPdf(demande["module"]);
                                Process.Start(new ProcessStartInfo(pdf) { UseShellExecute = true });
                                reponse = json.Serialize(new { path = pdf });
                            }
                            else
                                reponse = json.Serialize(new { path = Enregistrer(demande["module"], demande["folder"], demande["name"], Convert.FromBase64String(demande["data"])) });
                        }
                        catch (Exception ex)
                        {
                            statut = 400;
                            reponse = json.Serialize(new { error = ex.Message });
                        }
                    }

                    byte[] contenu = Encoding.UTF8.GetBytes(reponse);
                    byte[] entetes = Encoding.ASCII.GetBytes("HTTP/1.1 " + statut + " OK\r\n"
                        + "Access-Control-Allow-Origin: null\r\n"
                        + "Access-Control-Allow-Methods: POST, OPTIONS\r\n"
                        + "Access-Control-Allow-Headers: Content-Type, X-Commandes-Token\r\n"
                        + "Access-Control-Allow-Private-Network: true\r\n"
                        + "Content-Type: application/json\r\n"
                        + "Content-Length: " + contenu.Length + "\r\n"
                        + "Connection: close\r\n\r\n");
                    flux.Write(entetes, 0, entetes.Length);
                    flux.Write(contenu, 0, contenu.Length);
                }
                catch
                {
                    // Requête mal formée ou connexion interrompue : la suivante est servie.
                }
            }
        }
        ecoute.Stop();
    }
}
