# Rappels Bips - Version Wear OS

Cette version de l'application est spécialement conçue pour **Wear OS** (montres connectées Android).

## 🎯 Fonctionnalités

- ✅ Bips de rappel à intervalles personnalisables
- ✅ Interface adaptée aux écrans ronds des montres
- ✅ Notification persistante avec bouton Pause/Reprendre
- ✅ Désactivation automatique pendant des plages horaires configurées
- ✅ Vibration personnalisable
- ✅ Fonctionne indépendamment de l'app mobile

## 📋 Prérequis

- Android Studio avec support Wear OS
- Émulateur Wear OS ou montre connectée avec Wear OS 3.0+
- SDK Android 26 minimum

## 🚀 Installation et Build

### 1. Configuration du projet

Le module Wear OS est déjà configuré dans `android/wear/`. Assurez-vous que votre `settings.gradle` inclut le module :

```gradle
include ':wear'
```

### 2. Build de l'application Wear OS

```bash
cd android
./gradlew :wear:assembleDebug
```

Ou depuis Android Studio :
1. Ouvrez le projet dans Android Studio
2. Sélectionnez le module `wear` dans la liste des modules
3. Cliquez sur Run ou Build > Make Module 'wear'

### 3. Installation sur une montre

#### Via ADB (émulateur ou montre connectée en mode développeur) :

```bash
adb install android/wear/build/outputs/apk/debug/wear-debug.apk
```

#### Via Android Studio :
1. Connectez votre montre ou démarrez l'émulateur Wear OS
2. Sélectionnez le module `wear` comme configuration d'exécution
3. Cliquez sur Run

### 📱 Guide spécifique pour OnePlus Watch 2R

Pour un guide détaillé d'installation sur votre OnePlus Watch 2R, consultez **[GUIDE_INSTALLATION_ONEPLUS_WATCH.md](GUIDE_INSTALLATION_ONEPLUS_WATCH.md)**

## 📱 Utilisation

### Interface principale

L'interface est optimisée pour les écrans ronds des montres :

- **Switch principal** : Active/désactive les rappels
- **Bouton Pause/Reprendre** : Met en pause temporairement les rappels
- **Bouton Intervalle** : Change l'intervalle entre les bips (5, 10, 15, 30, 60 min ou personnalisé)
- **Bouton Paramètres** : Accède aux paramètres (vibration, heures désactivées)

### Permissions requises

L'application demande automatiquement les permissions nécessaires :
- **Alarmes exactes** : Nécessaire pour les rappels précis
- **Notifications** : Pour afficher la notification persistante
- **Vibration** : Pour les vibrations de rappel

## 🔧 Différences avec la version mobile

### Interface simplifiée

L'interface Wear OS est simplifiée pour s'adapter aux contraintes des montres :
- Moins d'options affichées simultanément
- Navigation par dialogues
- Boutons plus grands pour faciliter l'interaction tactile

### Configuration avancée

Pour les paramètres avancés (heures désactivées personnalisées), utilisez l'application mobile. Les deux applications peuvent coexister et fonctionner indépendamment.

## 🏗️ Architecture

### Structure du module Wear OS

```
android/wear/
├── build.gradle              # Configuration du build
├── src/main/
│   ├── AndroidManifest.xml   # Manifeste de l'app Wear OS
│   ├── java/com/rappelsbips/wear/
│   │   ├── MainActivity.kt   # Interface principale
│   │   ├── ReminderService.kt # Service de rappels
│   │   ├── AlarmReceiver.kt  # Récepteur d'alarmes
│   │   └── BootReceiver.kt   # Redémarrage après boot
│   └── res/                  # Ressources (layouts, strings, etc.)
```

### Service en arrière-plan

Le `ReminderService` fonctionne de la même manière que la version mobile :
- Service foreground pour garantir l'exécution
- AlarmManager pour les rappels précis
- Timer de backup pour détecter les alarmes manquées
- Gestion des heures désactivées

## 🔄 Synchronisation avec l'app mobile (optionnel)

Pour synchroniser les paramètres entre l'app mobile et Wear OS, vous pouvez utiliser :
- **Wearable Data Layer API** : Pour synchroniser les paramètres
- **Message API** : Pour envoyer des commandes entre les appareils

Cette fonctionnalité n'est pas implémentée dans cette version de base, mais peut être ajoutée si nécessaire.

## 🐛 Dépannage

### L'application ne démarre pas

1. Vérifiez que vous avez les permissions nécessaires
2. Vérifiez que la montre supporte Wear OS 3.0+
3. Consultez les logs : `adb logcat | grep RappelsBips`

### Les rappels ne fonctionnent pas

1. Vérifiez que les alarmes exactes sont autorisées dans les paramètres système
2. Vérifiez que l'optimisation de la batterie est désactivée pour l'app
3. Vérifiez les logs du service : `adb logcat | grep ReminderServiceWear`

### L'interface ne s'affiche pas correctement

1. Vérifiez que vous utilisez un émulateur ou une montre avec écran rond
2. L'interface est optimisée pour les écrans ronds, elle peut paraître différente sur les écrans carrés

## 📝 Notes de développement

- Le module Wear OS est **indépendant** du module mobile
- Les deux applications peuvent être installées séparément
- Les paramètres ne sont pas synchronisés par défaut (peut être ajouté avec Data Layer API)
- L'interface est simplifiée pour s'adapter aux contraintes des montres

## 🚀 Prochaines étapes possibles

- [ ] Synchronisation avec l'app mobile via Data Layer API
- [ ] Complications Wear OS pour afficher le statut sur le cadran
- [ ] Tiles Wear OS pour un accès rapide
- [ ] Support des écrans rectangulaires
- [ ] Mode économie d'énergie pour les montres

## 📄 Licence

Même licence que le projet principal.

