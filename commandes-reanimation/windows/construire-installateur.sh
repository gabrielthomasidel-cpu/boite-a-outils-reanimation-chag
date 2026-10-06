#!/bin/sh
# Construit dist/Commandes_Reanimation_Setup_<version>.exe avec NSIS 3.
# Prérequis : makensis (paquet « nsis » sous Debian/Ubuntu ou WSL).
# La version est lue dans web/js/modules.js pour rester unique.
set -eu
cd "$(dirname "$0")"
VERSION=$(sed -n "s/.*const VERSION = '\([0-9.]*\)'.*/\1/p" ../web/js/modules.js)
mkdir -p ../dist
makensis -V2 -DVERSION="$VERSION" installateur.nsi
echo "Installateur : dist/Commandes_Reanimation_Setup_$VERSION.exe"
