#!/bin/bash
# Script de build et installation pour Wear OS
# Usage: ./build-wear.sh [install]

echo "========================================"
echo "Build et installation Wear OS"
echo "========================================"
echo ""

cd android

echo "[1/2] Compilation de l'application..."
./gradlew :wear:assembleDebug

if [ $? -ne 0 ]; then
    echo ""
    echo "ERREUR: La compilation a échoué!"
    exit 1
fi

echo ""
echo "[2/2] Compilation réussie!"
echo ""
echo "APK généré dans: android/wear/build/outputs/apk/debug/wear-debug.apk"
echo ""

if [ "$1" == "install" ]; then
    echo "Installation sur la montre..."
    adb install -r wear/build/outputs/apk/debug/wear-debug.apk
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERREUR: L'installation a échoué!"
        echo "Vérifiez que:"
        echo "  - La montre est connectée (adb devices)"
        echo "  - Le mode développeur est activé"
        echo "  - Le débogage ADB est activé"
        exit 1
    fi
    
    echo ""
    echo "Installation réussie!"
    echo "L'application est maintenant sur votre montre."
fi

echo ""

