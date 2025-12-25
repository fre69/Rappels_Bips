@echo off
REM Script de build et installation pour Wear OS
REM Usage: build-wear.bat [install]

echo ========================================
echo Build et installation Wear OS
echo ========================================
echo.

cd android

echo [1/2] Compilation de l'application...
call gradlew.bat :wear:assembleDebug

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERREUR: La compilation a echoue!
    pause
    exit /b 1
)

echo.
echo [2/2] Compilation reussie!
echo.
echo APK genere dans: android\wear\build\outputs\apk\debug\wear-debug.apk
echo.

if "%1"=="install" (
    echo Installation sur la montre...
    adb install -r wear\build\outputs\apk\debug\wear-debug.apk
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERREUR: L'installation a echoue!
        echo Verifiez que:
        echo   - La montre est connectee (adb devices)
        echo   - Le mode developpeur est active
        echo   - Le debogage ADB est active
        pause
        exit /b 1
    )
    
    echo.
    echo Installation reussie!
    echo L'application est maintenant sur votre montre.
)

echo.
pause

