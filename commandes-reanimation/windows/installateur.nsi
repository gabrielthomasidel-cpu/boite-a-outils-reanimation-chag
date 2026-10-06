; ============================================================
; Commandes Réanimation — installateur Windows (NSIS 3, Unicode)
; ============================================================
; Construction : windows/construire-installateur.sh (Linux ou WSL, makensis)
; ou « makensis windows\installateur.nsi » sous Windows.
;
; Installation par utilisateur, sans droits administrateur, au même
; emplacement et avec la même clé de désinstallation que les versions 2.x :
; une version antérieure est remplacée en place. Le profil Edge de
; l'application (%LOCALAPPDATA%\CommandesReanimationWin64\Profil) et le
; dossier C:\commandes ne sont jamais touchés, ni à l'installation ni à la
; désinstallation : comptages, catalogues et historiques sont conservés.

Unicode true
SetCompressor /SOLID lzma

!ifndef VERSION
  !define VERSION "2.7.0"
!endif
!define NOM "Commandes Réanimation"
!define EDITEUR "Gabriel THOMAS"
!define EXE "CommandesReanimation.exe"
!define CLE_DESINSTALLATION "Software\Microsoft\Windows\CurrentVersion\Uninstall\{BD46B7EC-D4A7-45CE-A4F1-2A0F565D45C7}_is1"
!ifndef SORTIE
  !define SORTIE "../dist/Commandes_Reanimation_Setup_${VERSION}.exe"
!endif

Name "${NOM} ${VERSION}"
OutFile "${SORTIE}"
InstallDir "$LOCALAPPDATA\Programs\CommandesReanimationWin64"
InstallDirRegKey HKCU "${CLE_DESINSTALLATION}" "InstallLocation"
RequestExecutionLevel user
BrandingText "${NOM} ${VERSION}"
ShowInstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1036 "ProductName" "${NOM}"
VIAddVersionKey /LANG=1036 "CompanyName" "${EDITEUR}"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de ${NOM}"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "${EDITEUR}"

!include "MUI2.nsh"

!define MUI_ICON "app.ico"
!define MUI_UNICON "app.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "modern-wizard.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "modern-wizard.bmp"
!define MUI_ABORTWARNING
!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_WELCOMEPAGE_TEXT "Cet assistant installe ${NOM} ${VERSION} pour votre compte Windows, sans droits administrateur.$\r$\n$\r$\nUne version précédente est mise à jour en place : vos comptages, catalogues modifiés et historiques sont conservés.$\r$\n$\r$\nMicrosoft Edge doit être installé sur le poste."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir ${NOM}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\INSTALLATION.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Afficher les nouveautés et les informations d'installation"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

Section "Application principale" SecApplication
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Mise à jour propre : les fichiers d'une version précédente sont retirés
  ; avant la copie, pour qu'aucun ancien script ne subsiste.
  RMDir /r "$INSTDIR\web"
  Delete "$INSTDIR\CommandesReanimation_*.exe"
  RMDir /r "$INSTDIR\android"

  File "app.ico"
  File "INSTALLATION.txt"
  File "${EXE}"
  ; Contenu de web/ uniquement (« File /r ../web » reprenait aussi tout
  ; autre dossier nommé « web », comme la copie de construction Android).
  SetOutPath "$INSTDIR\web"
  File /r "../web/*.*"
  SetOutPath "$INSTDIR"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${NOM}"
  CreateShortCut "$SMPROGRAMS\${NOM}\${NOM}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
  CreateShortCut "$SMPROGRAMS\${NOM}\Désinstaller ${NOM}.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\app.ico" 0

  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayName" "${NOM} ${VERSION}"
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "Publisher" "${EDITEUR}"
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${CLE_DESINSTALLATION}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "NoModify" 1
  WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "NoRepair" 1
  WriteRegDWORD HKCU "${CLE_DESINSTALLATION}" "EstimatedSize" 4200
SectionEnd

Section "Raccourci sur le Bureau" SecBureau
  CreateShortCut "$DESKTOP\${NOM}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\app.ico" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecApplication} "Application Windows complète et ses trois modules hors connexion."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecBureau} "Ajoute un raccourci ${NOM} sur le Bureau."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  ; Le profil Edge et C:\commandes sont volontairement conservés.
  Delete "$DESKTOP\${NOM}.lnk"
  RMDir /r "$SMPROGRAMS\${NOM}"
  RMDir /r "$INSTDIR\web"
  Delete "$INSTDIR\CommandesReanimation*.exe"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\INSTALLATION.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${CLE_DESINSTALLATION}"
SectionEnd
