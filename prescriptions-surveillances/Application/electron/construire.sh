#!/bin/sh
# Reconstruit l'installateur Windows (.exe) a partir de la page HTML du dossier
# Prescription.
#
#   sh construire.sh 2.4.4
#
# Tout se fait dans TEMP : node_modules (305 Mo) et dist (585 Mo) ne doivent
# jamais atterrir dans OneDrive. Seul l'installateur final en revient.
# La premiere execution telecharge Electron et les dependances : prevoir du
# reseau et quelques minutes.
set -e

VERSION="$1"
[ -n "$VERSION" ] || { echo "Usage : sh construire.sh <version>   (ex. 2.4.4)"; exit 1; }

# forme Windows (C:/...) : npm et electron-builder ne lisent pas /c/...
enwin() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
ICI=$(enwin "$(cd "$(dirname "$0")" && pwd)")
RACINE=$(enwin "$(cd "$(dirname "$0")/../.." && pwd)")
PAGE="$RACINE/Prescriptions-Surveillances_V$VERSION.html"
OBSERVATION="$RACINE/Prescriptions-Surveillances_V$VERSION-observation.html"
[ -f "$PAGE" ] || { echo "Page introuvable : $PAGE"; exit 1; }
# Depuis la 2.6.1, l'observation medicale est le fichier voisin de la page. Les
# versions anterieures la portaient dans la page : on les reconnait a cela, et on
# refuse de construire un installateur sans observation.
if [ ! -f "$OBSERVATION" ] && ! grep -q "var OBSERVATION_HTML = " "$PAGE"; then
  echo "Observation introuvable : $OBSERVATION"; exit 1
fi
command -v npm >/dev/null || { echo "npm introuvable (Node.js absent ?)"; exit 1; }

# la version de reference reste celle du package.json conserve ici
sed -i "s/\"version\": \"[0-9.]*\"/\"version\": \"$VERSION\"/" "$ICI/package.json"

T="$(enwin "${TEMP:-/tmp}")/prescription-build-electron"
rm -rf "$T"; mkdir -p "$T/app" "$T/build" "$T/imprimeur"
cp "$ICI/package.json" "$ICI/package-lock.json" "$ICI/main.js" "$ICI/preload.js" "$T/"
cp "$ICI/build/icon.ico" "$ICI/build/icon.png" "$T/build/"
cp "$PAGE" "$T/app/index.html"
if [ -f "$OBSERVATION" ]; then cp "$OBSERVATION" "$T/app/index-observation.html"; fi

# L'imprimeur : c'est lui qui pose le format, l'orientation et la reliure dans le
# DEVMODE du travail — Electron ne transmet ni l'un ni l'autre. Autonome et
# elague : un seul fichier de 14 Mo, aucun moteur .NET a installer sur les postes.
IMPRIMEUR="$(enwin "$(cd "$(dirname "$0")/../imprimeur" && pwd)")"
command -v dotnet >/dev/null || { echo "dotnet introuvable (SDK .NET 8 absent ?)"; exit 1; }
echo "--- 1/4 imprimeur (dotnet publish) ---"
dotnet publish "$IMPRIMEUR/Imprimeur.csproj" -c Release -r win-x64   --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=true -p:TrimMode=partial   -o "$T/imprimeur" --nologo
[ -f "$T/imprimeur/ImprimerPdf.exe" ] || { echo "Imprimeur absent apres publication"; exit 1; }
rm -f "$T/imprimeur/"*.pdb

cd "$T"
echo "--- 2/4 dependances (npm install) ---"
npm install --no-audit --no-fund
echo "--- 3/4 empaquetage (electron-builder, NSIS) ---"
npx electron-builder --win
echo "--- 4/4 recuperation ---"
EXE="Prescriptions-Surveillances_V$VERSION.exe"
[ -f "$T/dist/$EXE" ] || { echo "Installateur absent de $T/dist"; exit 1; }
cp "$T/dist/$EXE" "$RACINE/$EXE"

echo
echo "Installateur ecrit : $RACINE/$EXE"
echo "Le repertoire de travail $T peut etre efface."
