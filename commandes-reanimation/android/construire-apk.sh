#!/bin/sh
# Construit dist/Commandes_Reanimation_<version>.apk sans Gradle.
# Prérequis (Debian/Ubuntu) :
#   apt install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange apksigner zipalign default-jdk
# Signature : clé android/signature/commandes-reanimation.jks et son mot de
# passe dans android/signature/mot-de-passe.txt (fichiers à conserver
# précieusement et hors du dépôt : sans eux, une mise à jour exige de
# désinstaller l'application). Variables CLE et MOT_DE_PASSE pour les remplacer.
set -eu
cd "$(dirname "$0")"
VERSION=$(sed -n "s/.*const VERSION = '\([0-9.]*\)'.*/\1/p" ../web/js/modules.js)
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
ANDROID_JAR="$SDK/platforms/android-23/android.jar"
CLE=${CLE:-signature/commandes-reanimation.jks}
MOT_DE_PASSE=${MOT_DE_PASSE:-$(cat signature/mot-de-passe.txt)}
SORTIE="../dist/Commandes_Reanimation_${VERSION}.apk"

grep -q "android:versionName=\"$VERSION\"" AndroidManifest.xml || { echo "AndroidManifest.xml : versionName différent de $VERSION" >&2; exit 1; }

rm -rf build && mkdir -p build/res build/classes build/gen build/assets ../dist
# Pages web embarquées + lecteur caméra propre à l'édition Android
cp -r ../web build/assets/web
cp vendor/html5-qrcode.min.js build/assets/web/vendor/
cp vendor/html5-qrcode-Apache-2.0.txt build/assets/web/licenses/

aapt2 compile --dir res -o build/res/ressources.zip
aapt2 link -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A build/assets \
  --java build/gen -o build/base.apk build/res/ressources.zip
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -encoding UTF-8 \
  -d build/classes $(find src build/gen -name '*.java')
dalvik-exchange --dex --min-sdk-version=23 --output=build/classes.dex build/classes
cp build/base.apk build/non-signe.apk
(cd build && zip -q -j non-signe.apk classes.dex)
zipalign -f -p 4 build/non-signe.apk build/aligne.apk
apksigner sign --ks "$CLE" --ks-pass "pass:$MOT_DE_PASSE" --out "$SORTIE" build/aligne.apk
apksigner verify --print-certs "$SORTIE" | head -3
echo "APK : dist/Commandes_Reanimation_${VERSION}.apk"
