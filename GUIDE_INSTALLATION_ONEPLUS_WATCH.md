# Guide d'installation - OnePlus Watch 2R

Guide complet pour compiler et installer l'application Rappels Bips sur votre OnePlus Watch 2R.

## 📋 Prérequis

1. **Android Studio** installé avec :
   - Android SDK (API 26 minimum)
   - Outils de développement Android (ADB)
   - Support Wear OS

2. **OnePlus Watch 2R** avec :
   - Mode développeur activé
   - Débogage USB activé

3. **Connexion** :
   - Bluetooth activé entre votre téléphone et la montre
   - Ou connexion USB si votre montre le supporte

## 🔧 Étape 1 : Activer le mode développeur sur la montre

### Sur la montre OnePlus Watch 2R :

1. Ouvrez **Paramètres** sur la montre
2. Allez dans **Système** → **À propos**
3. Trouvez **Numéro de build** ou **Version**
4. **Appuyez 7 fois** sur "Numéro de build" jusqu'à voir "Vous êtes maintenant développeur !"

## 🔌 Étape 2 : Activer le débogage ADB

### Option A : Via Bluetooth (recommandé pour les montres)

1. Sur la montre : **Paramètres** → **Système** → **Options développeur**
2. Activez **Débogage ADB**
3. Activez **Débogage via Bluetooth** (si disponible)
4. Notez l'adresse IP affichée (ex: `192.168.x.x:5555`)

### Option B : Via USB (si votre montre le supporte)

1. Connectez la montre à votre ordinateur via USB
2. Sur la montre : **Paramètres** → **Système** → **Options développeur**
3. Activez **Débogage ADB**
4. Autorisez le débogage USB quand la montre le demande

## 📱 Étape 3 : Connecter la montre à ADB

### Si vous utilisez Bluetooth :

```bash
# Connecter via Bluetooth (remplacez par l'IP de votre montre)
adb connect 192.168.1.100:5555
```

**Note** : Pour OnePlus Watch 2R, vous devrez peut-être utiliser l'application **Wear OS by Google** sur votre téléphone pour établir la connexion ADB.

### Si vous utilisez USB :

```bash
# Vérifier que la montre est détectée
adb devices
```

Vous devriez voir votre montre dans la liste :
```
List of devices attached
ABC123XYZ    device
```

## 🏗️ Étape 4 : Compiler l'application

### Méthode 1 : Via la ligne de commande (Gradle)

```bash
# Depuis la racine du projet
cd android

# Compiler l'APK de debug
./gradlew :wear:assembleDebug

# Sur Windows (PowerShell ou CMD)
gradlew.bat :wear:assembleDebug
```

L'APK sera généré dans :
```
android/wear/build/outputs/apk/debug/wear-debug.apk
```

### Méthode 2 : Via Android Studio

1. Ouvrez le projet dans **Android Studio**
2. Dans la barre latérale, ouvrez **android/wear**
3. Clic droit sur le module `wear` → **Run** → **wear**
4. Sélectionnez votre montre dans la liste des appareils
5. Cliquez sur **OK**

## 📲 Étape 5 : Installer l'application

### Via ADB (ligne de commande) :

```bash
# Installer l'APK
adb install android/wear/build/outputs/apk/debug/wear-debug.apk

# Si l'application existe déjà, utilisez -r pour la réinstaller
adb install -r android/wear/build/outputs/apk/debug/wear-debug.apk
```

### Via Android Studio :

1. Clic droit sur le module `wear`
2. **Run** → **wear**
3. Android Studio compile et installe automatiquement

## ✅ Étape 6 : Vérifier l'installation

1. Sur votre montre, ouvrez le **menu des applications**
2. Cherchez **Rappels Bips**
3. Lancez l'application

## 🐛 Dépannage

### La montre n'apparaît pas dans `adb devices`

**Solution 1 : Vérifier la connexion Bluetooth**
```bash
# Réessayer la connexion
adb connect 192.168.1.100:5555

# Vérifier les appareils connectés
adb devices
```

**Solution 2 : Utiliser l'app Wear OS sur le téléphone**
- Installez **Wear OS by Google** sur votre téléphone
- Connectez votre montre
- Activez le débogage ADB via l'application

**Solution 3 : Réinitialiser la connexion ADB**
```bash
# Déconnecter tous les appareils
adb disconnect

# Redémarrer le serveur ADB
adb kill-server
adb start-server

# Reconnecter
adb connect [IP_DE_LA_MONTRE]:5555
```

### Erreur "device unauthorized"

1. Sur la montre, une popup devrait apparaître : **Autoriser le débogage USB ?**
2. Cochez **Toujours autoriser depuis cet ordinateur**
3. Appuyez sur **Autoriser**

### Erreur "INSTALL_FAILED_INSUFFICIENT_STORAGE"

La montre n'a pas assez d'espace :
```bash
# Vérifier l'espace disponible
adb shell df -h

# Désinstaller des applications inutiles depuis la montre
```

### L'application ne démarre pas

1. Vérifiez les logs :
```bash
adb logcat | grep RappelsBips
```

2. Vérifiez les permissions dans les paramètres de la montre

### Compilation échoue

**Erreur de dépendances :**
```bash
# Nettoyer le projet
cd android
./gradlew clean

# Recompiler
./gradlew :wear:assembleDebug
```

**Erreur de SDK :**
- Vérifiez que vous avez installé Android SDK 26+ dans Android Studio
- Vérifiez que le SDK Wear OS est installé

## 📝 Commandes ADB utiles

```bash
# Voir les logs en temps réel
adb logcat | grep ReminderServiceWear

# Voir tous les logs
adb logcat

# Désinstaller l'application
adb uninstall com.rappelsbips.wear

# Redémarrer la montre
adb reboot

# Prendre une capture d'écran
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png
```

## 🔄 Mettre à jour l'application

Quand vous modifiez le code :

```bash
# Recompiler
cd android
./gradlew :wear:assembleDebug

# Réinstaller (écrase l'ancienne version)
adb install -r wear/build/outputs/apk/debug/wear-debug.apk
```

## 🎯 Spécificités OnePlus Watch 2R

La OnePlus Watch 2R fonctionne avec **Wear OS 3.5+**. Assurez-vous que :

1. **Version minimale SDK** : 26 (Android 8.0)
2. **Version cible SDK** : 34 (Android 14)
3. La montre supporte les **alarmes exactes** (nécessaire pour les rappels)

## 📱 Alternative : Installation via le téléphone

Si ADB direct ne fonctionne pas, vous pouvez :

1. Transférer l'APK sur votre téléphone
2. Utiliser une application comme **Wear Installer** ou **Easy Fire Tools**
3. Installer l'APK sur la montre via Bluetooth

## ⚠️ Notes importantes

- **Mode développeur** : Gardez-le activé uniquement pendant le développement
- **Batterie** : Le mode développeur peut consommer plus de batterie
- **Sécurité** : Désactivez le débogage ADB quand vous n'en avez plus besoin
- **Permissions** : L'application demandera les permissions nécessaires au premier lancement

## 🆘 Besoin d'aide ?

Si vous rencontrez des problèmes :

1. Vérifiez les logs : `adb logcat | grep RappelsBips`
2. Vérifiez que la montre est bien connectée : `adb devices`
3. Vérifiez la version de Wear OS sur votre montre
4. Consultez la documentation Wear OS : https://developer.android.com/training/wearables

---

**Bon développement ! 🚀**

