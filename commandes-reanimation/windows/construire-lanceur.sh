#!/bin/sh
# Construit windows/CommandesReanimation.exe (.NET Framework 4.6) à partir de
# windows/lanceur/. Prérequis : dotnet SDK 6 ou plus (Windows, Linux ou WSL) ;
# les assemblys de référence .NET Framework sont téléchargées depuis NuGet.
set -eu
cd "$(dirname "$0")"
dotnet build lanceur/Lanceur.csproj -c Release -o build-lanceur -nologo -v q
cp build-lanceur/CommandesReanimation.exe CommandesReanimation.exe
rm -rf build-lanceur lanceur/bin lanceur/obj
echo "Lanceur : windows/CommandesReanimation.exe"
