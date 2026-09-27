// L'imprimeur : il pose le format, l'orientation et la reliure dans le DEVMODE
// DU TRAVAIL, ce qu'Electron ne sait pas faire.
//
// Pourquoi il existe. Mesure faite sur une vraie imprimante, file d'impression
// suspendue, en lisant le DEVMODE du travail remis au spouleur :
//   - l'orientation paysage est transmise par Electron ;
//   - le FORMAT ne l'est jamais : Electron ne charge pas les capacites de
//     l'imprimante, Chromium n'a rien a quoi comparer la demande et garde le
//     format par defaut de l'appareil ;
//   - le RECTO VERSO ne l'est plus depuis Electron 44, qui le remplace par du
//     recto simple.
// La 2.8.2 contournait cela en ecrivant les reglages dans les preferences de
// l'imprimante juste avant le travail, puis en les remettant. Ici, plus besoin :
// l'application produit le PDF exact de ses deux feuilles — c'est deja ce qu'elle
// fait pour son apercu — et cet imprimeur l'envoie au pilote avec les reglages
// voulus, par travail, sans jamais toucher a un reglage du poste de travail.
//
//   ImprimerPdf.exe --pdf "C:\...\feuilles.pdf" --imprimante "Nom"
//                   [--format A3] [--paysage] [--rectoverso court|long|non]
//                   [--exemplaires 1] [--ppp 300] [--pages 3-7]
//                   [--sans-centrage] [--compte-rendu "C:\...\cr.txt"]
//   ImprimerPdf.exe --imprimantes [--compte-rendu ...]
//
// Compte rendu, une ligne : OK ... | ECHEC ...  — et le code de sortie, 0 ou 1.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Text;

namespace Prescription.Imprimeur
{
    internal static class Programme
    {
        private static string _compteRendu;
        private static readonly StringBuilder _lignes = new StringBuilder();

        private static void Dire(string ligne)
        {
            _lignes.AppendLine(ligne);
            try { Console.Out.WriteLine(ligne); } catch { }
        }

        private static int Sortir(int code)
        {
            if (_compteRendu != null)
            {
                try { File.WriteAllText(_compteRendu, _lignes.ToString(), new UTF8Encoding(false)); }
                catch { }
            }
            return code;
        }

        [STAThread]
        private static int Main(string[] args)
        {
            var o = Options.Lire(args);
            _compteRendu = o.CompteRendu;
            try
            {
                if (o.ListerLesImprimantes) return Sortir(Lister());
                if (o.Pdf == null || !File.Exists(o.Pdf))
                {
                    Dire("ECHEC pdf introuvable : " + (o.Pdf ?? "(aucun)"));
                    return Sortir(1);
                }
                return Sortir(Imprimer(o));
            }
            catch (Exception e)
            {
                Dire("ECHEC " + e.GetType().Name + " : " + e.Message);
                return Sortir(1);
            }
        }

        private static int Lister()
        {
            string defaut = "";
            try { defaut = new PrinterSettings().PrinterName; } catch { }
            foreach (string nom in PrinterSettings.InstalledPrinters)
                Dire("IMPRIMANTE\t" + nom + "\t" + (nom == defaut ? "defaut" : ""));
            Dire("OK liste");
            return 0;
        }

        private static int Imprimer(Options o)
        {
            var reglages = new PrinterSettings();
            if (!string.IsNullOrEmpty(o.Imprimante)) reglages.PrinterName = o.Imprimante;
            if (!reglages.IsValid)
            {
                Dire("ECHEC imprimante inconnue : " + o.Imprimante);
                return 1;
            }

            // le recto verso, dans le DEVMODE du travail
            if (o.RectoVerso != "non")
            {
                if (!reglages.CanDuplex)
                    Dire("AVERTISSEMENT le pilote annonce ne pas savoir imprimer en recto verso");
                reglages.Duplex = o.RectoVerso == "long" ? Duplex.Vertical : Duplex.Horizontal;
            }
            else reglages.Duplex = Duplex.Simplex;
            reglages.Copies = (short)Math.Max(1, Math.Min(9, o.Exemplaires));

            var document = new PrintDocument { PrinterSettings = reglages, DocumentName = o.Titre };

            // Le format DU PILOTE, jamais un format sur mesure : un format sur
            // mesure sort en DMPAPER_USER (256) et fait perdre le recto verso —
            // mesure faite, le travail repartait en recto seul.
            PaperKind voulu = o.Format == "A4" ? PaperKind.A4
                : o.Format == "A5" ? PaperKind.A5
                : o.Format == "Letter" ? PaperKind.Letter
                : PaperKind.A3;
            PaperSize papier = null;
            foreach (PaperSize p in reglages.PaperSizes)
                if (p.RawKind == (int)voulu) { papier = p; break; }
            if (papier != null) document.DefaultPageSettings.PaperSize = papier;
            else
            {
                Dire("AVERTISSEMENT ce pilote ne propose pas le format " + o.Format + " : format sur mesure");
                document.DefaultPageSettings.PaperSize = voulu == PaperKind.A3
                    ? new PaperSize("A3", 1169, 1654)      // centiemes de pouce
                    : new PaperSize("A4", 827, 1169);
            }
            document.DefaultPageSettings.Landscape = o.Paysage;
            document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            document.OriginAtMargins = false;

            List<Bitmap> toutes = RendrePdf(o.Pdf, o.Ppp);
            if (toutes.Count == 0) { Dire("ECHEC le PDF ne porte aucune page"); return 1; }

            // La plage demandee. L'observation medicale s'imprime parfois en
            // entier, parfois a partir de « Evolution dans le service », parfois
            // sur quelques pages choisies : c'est ici que cela se decide.
            List<int> voulues = PagesVoulues(o.Pages, toutes.Count);
            if (voulues.Count == 0)
            {
                foreach (var b in toutes) b.Dispose();
                Dire("ECHEC aucune page dans la plage demandee : " + (o.Pages ?? ""));
                return 1;
            }
            var pages = new List<Bitmap>();
            for (int i = 0; i < toutes.Count; i++)
            {
                if (voulues.Contains(i + 1)) pages.Add(toutes[i]);
                else toutes[i].Dispose();
            }

            // La page tramee occupe toute la feuille, marges comprises : le PDF a
            // deja ete rendu aux cotes exactes de la feuille. Mais le repere de
            // dessin, lui, a son origine au coin de la ZONE IMPRIMABLE, pas au coin
            // du papier : poser le document a (0,0) le decalait de la marge
            // materielle — 11 centiemes de pouce, soit 2,8 mm, sur la Brother du
            // service — et autant etait perdu de l'autre cote. On le pose donc sur
            // la FEUILLE : il s'y retrouve centre, et ce que l'appareil ne sait pas
            // imprimer se repartit egalement sur les quatre bords au lieu de tomber
            // entierement a droite et en bas.
            int index = 0;
            bool poseDite = false;
            document.PrintPage += (s, e) =>
            {
                float mx = 0f, my = 0f;
                if (o.Centrer)
                {
                    var pg = e.PageSettings;
                    // .NET ne fait pas tourner HardMarginX/Y en paysage, alors qu'il
                    // fait tourner PageBounds : on les remet dans le bon sens.
                    mx = pg.Landscape ? pg.HardMarginY : pg.HardMarginX;
                    my = pg.Landscape ? pg.HardMarginX : pg.HardMarginY;
                }
                var cible = new RectangleF(-mx, -my, e.PageBounds.Width, e.PageBounds.Height);
                if (!poseDite)
                {
                    poseDite = true;
                    Dire("POSE feuille " + e.PageBounds.Width + "x" + e.PageBounds.Height
                        + " — marge materielle " + mx.ToString("0.##") + "x" + my.ToString("0.##")
                        + " — document pose a " + cible.X.ToString("0.##") + "," + cible.Y.ToString("0.##")
                        + (o.Centrer ? " (centre sur la feuille)" : " (au coin de la zone imprimable)"));
                }
                e.Graphics.DrawImage(pages[index++], cible);
                e.HasMorePages = index < pages.Count;
            };
            document.Print();
            foreach (var b in pages) b.Dispose();

            Dire("OK " + pages.Count + " page(s)"
                + (pages.Count != toutes.Count ? " sur " + toutes.Count + " (" + o.Pages + ")" : "")
                + " — " + reglages.PrinterName
                + " — " + document.DefaultPageSettings.PaperSize.PaperName
                + (o.Paysage ? " paysage" : " portrait")
                + " — recto verso " + (o.RectoVerso == "non" ? "desactive"
                    : o.RectoVerso == "long" ? "bord long" : "bord court")
                + " — " + o.Ppp + " ppp"
                + (o.Centrer ? " — centre sur la feuille" : " — sans centrage"));
            return 0;
        }

        // Les pages demandees : « 3-7 », « 2,4-6 », « 5 », ou rien pour tout.
        // Une borne absente vaut « depuis la premiere » ou « jusqu'a la
        // derniere » : « 3- » imprime de la page 3 a la fin, ce qui est
        // exactement ce que demande « a partir de Evolution dans le service ».
        private static List<int> PagesVoulues(string demande, int total)
        {
            var sortie = new List<int>();
            if (string.IsNullOrWhiteSpace(demande))
            {
                for (int i = 1; i <= total; i++) sortie.Add(i);
                return sortie;
            }
            foreach (string morceau in demande.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string m = morceau.Trim();
                if (m.Length == 0) continue;
                int a, b;
                int tiret = m.IndexOf('-');
                if (tiret < 0)
                {
                    if (!int.TryParse(m, out a)) continue;
                    b = a;
                }
                else
                {
                    if (!int.TryParse(m.Substring(0, tiret).Trim(), out a)) a = 1;
                    if (!int.TryParse(m.Substring(tiret + 1).Trim(), out b)) b = total;
                }
                if (a < 1) a = 1;
                if (b > total) b = total;
                for (int i = a; i <= b; i++) if (!sortie.Contains(i)) sortie.Add(i);
            }
            sortie.Sort();
            return sortie;
        }

        // Le rendu PDF livre avec Windows : aucune dependance a embarquer.
        private static List<Bitmap> RendrePdf(string chemin, int ppp)
        {
            var sortie = new List<Bitmap>();
            using (var flux = File.OpenRead(chemin))
            {
                var doc = Windows.Data.Pdf.PdfDocument
                    .LoadFromStreamAsync(flux.AsRandomAccessStream()).AsTask().GetAwaiter().GetResult();
                for (uint i = 0; i < doc.PageCount; i++)
                {
                    using (var page = doc.GetPage(i))
                    {
                        var tampon = new Windows.Storage.Streams.InMemoryRandomAccessStream();
                        var options = new Windows.Data.Pdf.PdfPageRenderOptions
                        {
                            // la taille de page est en points (1/72 de pouce)
                            DestinationWidth = (uint)Math.Round(page.Size.Width / 72.0 * ppp)
                        };
                        page.RenderToStreamAsync(tampon, options).AsTask().GetAwaiter().GetResult();
                        sortie.Add(new Bitmap(tampon.AsStreamForRead()));
                    }
                }
            }
            return sortie;
        }
    }

    internal sealed class Options
    {
        public string Pdf;
        public string Imprimante;
        public string Format = "A3";
        public bool Paysage = true;
        public string RectoVerso = "court";     // court | long | non
        public int Exemplaires = 1;
        public int Ppp = 300;
        public bool Centrer = true;             // le document au milieu du papier
        public string Pages;                    // "3-7", "2,4-6", vide = tout
        public string Titre = "Prescription et Surveillance";
        public string CompteRendu;
        public bool ListerLesImprimantes;

        public static Options Lire(string[] args)
        {
            var o = new Options();
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                string suivant = i + 1 < args.Length ? args[i + 1] : null;
                switch (a)
                {
                    case "--pdf": o.Pdf = suivant; i++; break;
                    case "--imprimante": o.Imprimante = suivant; i++; break;
                    case "--format": o.Format = suivant; i++; break;
                    case "--rectoverso": o.RectoVerso = suivant; i++; break;
                    case "--titre": o.Titre = suivant; i++; break;
                    case "--compte-rendu": o.CompteRendu = suivant; i++; break;
                    case "--exemplaires": int.TryParse(suivant, out o.Exemplaires); i++; break;
                    case "--ppp": int.TryParse(suivant, out o.Ppp); i++; break;
                    case "--pages": o.Pages = suivant; i++; break;
                    case "--centrer": o.Centrer = true; break;
                    case "--sans-centrage": o.Centrer = false; break;
                    case "--portrait": o.Paysage = false; break;
                    case "--paysage": o.Paysage = true; break;
                    case "--imprimantes": o.ListerLesImprimantes = true; break;
                }
            }
            if (o.Ppp < 96) o.Ppp = 96;
            if (o.Ppp > 600) o.Ppp = 600;
            if (o.Exemplaires < 1) o.Exemplaires = 1;
            return o;
        }
    }
}
