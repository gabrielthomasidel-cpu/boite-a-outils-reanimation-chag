#!/usr/bin/env python3
"""Mode d'emploi intégré : web/Mode_emploi.html et web/aide/ à partir du docx.

    docs/construire-aide.py [docs/Mode_emploi_Commandes_Reanimation.docx]

Le document Word reste la source : après l'avoir modifié, relancez ce script
puis l'installateur et l'APK. Nécessite pandoc ; Pillow (facultatif) allège
les captures d'écran.
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RACINE, 'web')
SOURCE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, 'docs', 'Mode_emploi_Commandes_Reanimation.docx')
SORTIE = os.path.join(WEB, 'Mode_emploi.html')
MEDIAS = os.path.join(WEB, 'aide')


def version_application():
    texte = open(os.path.join(WEB, 'js', 'modules.js'), encoding='utf-8').read()
    return re.search(r"const VERSION = '([^']+)'", texte).group(1)


def convertir(tmp):
    subprocess.run(['pandoc', SOURCE, '-t', 'html5', '--wrap=none', '--extract-media=' + tmp,
                    '-o', os.path.join(tmp, 'aide.html')], check=True)
    return open(os.path.join(tmp, 'aide.html'), encoding='utf-8').read()


def copier_medias(tmp, utilisees):
    if os.path.isdir(MEDIAS):
        shutil.rmtree(MEDIAS)
    os.makedirs(MEDIAS)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    for nom in sorted(utilisees):
        src, dst = os.path.join(tmp, 'media', nom), os.path.join(MEDIAS, nom)
        shutil.copyfile(src, dst)
        if Image and os.path.getsize(src) > 20000:
            # Captures d'écran : palette de 256 couleurs, sans perte visible.
            image = Image.open(src).convert('RGB')
            image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst, optimize=True)
            if os.path.getsize(dst) >= os.path.getsize(src):
                shutil.copyfile(src, dst)


def nettoyer(corps, tmp):
    # Images : chemins relatifs à la page, dimensions laissées à la feuille de style.
    corps = re.sub(r'<img src="[^"]*?/media/([^"]+)"[^>]*?/?>', r'<img src="aide/\1" alt="" loading="lazy">', corps)
    # Titres : sans gras, un niveau plus bas (le titre de la page est le h1).
    corps = re.sub(r'<(h[1-6])([^>]*)>\s*<strong>(.*?)</strong>\s*</\1>', r'<\1\2>\3</\1>', corps, flags=re.S)
    corps = re.sub(r'<(/?)h([1-5])\b', lambda m: '<%sh%d' % (m.group(1), int(m.group(2)) + 1), corps)
    # Encadrés du document (tableaux d'une seule cellule).
    def encadre(m):
        contenu = m.group(1).strip()
        if not re.sub(r'<[^>]+>|\s', '', contenu):
            return ''
        classe = 'note alerte' if contenu.startswith('<strong>Avertissement') else 'note'
        return '<aside class="%s"><p>%s</p></aside>' % (classe, contenu)
    corps = re.sub(r'<table>\s*<colgroup>\s*<col style="width: 100%" />\s*</colgroup>\s*<thead>\s*<tr[^>]*>\s*<th>(.*?)</th>\s*</tr>\s*</thead>\s*<tbody>\s*</tbody>\s*</table>',
                   encadre, corps, flags=re.S)
    corps = re.sub(r'<table>\s*<colgroup>.*?</colgroup>', '<div class="table-scroll"><table>', corps, flags=re.S)
    corps = corps.replace('</table>', '</table></div>')
    # Codes de réglage de la douchette : « Titre — explication » puis le code.
    def code(m):
        parties = m.group(1).split(' — ')
        # « Étape 1 — Mode normal — explication » : étape et réglage forment le titre.
        n = 2 if parties[0].startswith('Étape') and len(parties) > 2 else 1
        titre, texte = ' — '.join(parties[:n]), ' — '.join(parties[n:])
        return '<figure class="code"><img %s><figcaption><b>%s</b>%s</figcaption></figure>' % (m.group(2), titre, texte)
    corps = re.sub(r'<p>([^<]+? — [^<]+?)</p>\s*<p><img ([^>]+)></p>', code, corps)
    corps = re.sub(r'((?:<figure class="code">.*?</figure>\s*)+)', r'<div class="codes">\1</div>\n', corps, flags=re.S)
    # Captures d'écran suivies de leur légende.
    corps = re.sub(r'<p><img ([^>]+)></p>\s*<p><em>([^<]+?)</em></p>',
                   r'<figure class="capture"><img \1><figcaption>\2</figcaption></figure>', corps)
    return corps


def page(corps, version):
    # Couverture du document (avant le premier titre) remplacée par l'en-tête de la page.
    debut = corps.find('<h2')
    couverture, corps = corps[:debut], corps[debut:]
    alerte = re.search(r'<aside class="note alerte">.*?</aside>', couverture, re.S)
    corps = (alerte.group(0) if alerte else '') + corps
    # Annexe « Régler la douchette » : ses sections deviennent des sous-titres.
    annexe = corps.find('<h2 id="régler-la-douchette')
    if annexe > 0:
        corps = corps[:annexe] + re.sub(r'<(/?)h2\b', r'<\1h3', corps[annexe:])
        corps = corps.replace('<h3 id="régler-la-douchette', '<h2 class="annexe" id="régler-la-douchette', 1)
        corps = re.sub(r'(<h2 class="annexe"[^>]*>.*?)</h3>', r'\1</h2>', corps, count=1, flags=re.S)
    sommaire = ''.join('<li><a href="#%s">%s</a></li>' % (i, re.sub(r'<[^>]+>', '', t))
                       for i, t in re.findall(r'<h2[^>]*id="([^"]+)"[^>]*>(.*?)</h2>', corps, re.S))
    return MODELE.format(version=html.escape(version), sommaire=sommaire, corps=corps)


MODELE = '''<!DOCTYPE html>
<html lang="fr" data-theme="dark"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="application-version" content="{version}">
<!-- Page produite par docs/construire-aide.py à partir du mode d'emploi Word : ne pas modifier à la main. -->
<title>Mode d'emploi — Commandes Réanimation</title>
<link rel="icon" type="image/svg+xml" href="img/app-logo.svg">
<link rel="stylesheet" href="css/commandes.css">
<script src="js/theme.js"></script>
</head>
<body class="home mode-emploi">

<header class="masthead home-header">
  <div class="masthead-row">
    <img class="app-logo" src="img/app-logo.svg" alt="" width="64" height="64">
    <div class="masthead-title">
      <span class="eyebrow">Commandes Réanimation {version}</span>
      <h1>Mode d’emploi</h1>
    </div>
    <div class="home-tools">
      <a class="tool-btn" id="aideRetour" href="index.html">← Retour</a>
      <button type="button" class="tool-btn" id="aideImprimer">Imprimer</button>
    </div>
  </div>
</header>

<main class="aide">
  <nav class="aide-sommaire" aria-label="Sommaire"><b>Sommaire</b><ol>{sommaire}</ol></nav>
  <article class="aide-texte">
{corps}
  </article>
</main>

<script>
/* Retour vers la page qui a ouvert le mode d'emploi (?retour=…), sinon l'accueil. */
(function(){{
  var retour = new URLSearchParams(location.search).get('retour') || '';
  if(/^(index|Commande_[A-Za-z_]+)\\.html$/.test(retour)) document.getElementById('aideRetour').setAttribute('href', retour);
  document.getElementById('aideImprimer').addEventListener('click', function(){{ window.print(); }});
}})();
</script>
</body></html>
'''


def main():
    if not os.path.isfile(SOURCE):
        sys.exit('Mode d’emploi introuvable : ' + SOURCE)
    version = version_application()
    with tempfile.TemporaryDirectory() as tmp:
        brut = convertir(tmp)
        if version not in brut:
            print('Attention : le mode d’emploi ne mentionne pas la version %s.' % version, file=sys.stderr)
        corps = nettoyer(brut, tmp)
        # La couverture (logo compris) est remplacée par l'en-tête de la page.
        contenu = page(corps, version)
        utilisees = set(re.findall(r'src="aide/([^"]+)"', contenu))
        copier_medias(tmp, utilisees)
    with open(SORTIE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(contenu)
    taille = sum(os.path.getsize(os.path.join(MEDIAS, n)) for n in os.listdir(MEDIAS))
    print('Mode d’emploi : %s (%d images, %d Ko)' % (os.path.relpath(SORTIE, RACINE), len(utilisees), taille // 1024))


if __name__ == '__main__':
    main()
