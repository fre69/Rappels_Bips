# Rappels Bips - Application React Native avec Expo

Une application de rappels avec bips sonores à intervalles réguliers.

## Fonctionnalités

- ✅ Bips de rappel à intervalles personnalisables
- ✅ Notification persistante avec bouton Pause
- ✅ Désactivation automatique pendant des plages horaires configurées
- ✅ Sauvegarde automatique des paramètres
- ✅ Interface simple et intuitive

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Démarrer l'application :
```bash
npm start
```

3. Scanner le QR code avec l'application Expo Go sur votre téléphone, ou appuyer sur `a` pour Android ou `i` pour iOS dans l'émulateur.

## Utilisation

1. **Activer les rappels** : Utilisez le switch en haut de l'écran
2. **Configurer l'intervalle** : Entrez le nombre de minutes entre chaque bip
3. **Plages horaires** : Activez et configurez les heures où les rappels sont désactivés
4. **Pause** : Utilisez le bouton Pause pour mettre en pause temporairement les rappels

## Permissions

L'application nécessite les permissions de notification pour fonctionner correctement.

## Technologies

- React Native
- Expo
- expo-notifications
- expo-av
- AsyncStorage

