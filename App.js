import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    TextInput,
    Switch,
    ScrollView,
    Alert,
    Platform,
    AppState,
    Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

// Nom de la tâche en arrière-plan
const BACKGROUND_REMINDER_TASK = 'background-reminder-task';

// Fonction helper pour les logs avec timestamp
const logWithTime = (message, type = 'log') => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const logMessage = `[${timestamp}] ${message}`;
    if (type === 'error') {
        console.error(logMessage);
    } else {
        console.log(logMessage);
    }
};

// Helper pour vérifier si on est dans les heures désactivées (utilisé dans la tâche)
const checkIsInDisabledHours = async () => {
    try {
        const isDisabledHoursActive = await AsyncStorage.getItem('isDisabledHoursActive');
        if (isDisabledHoursActive !== 'true') return false;

        const disableStartHour = parseInt(await AsyncStorage.getItem('disableStartHour')) || 22;
        const disableEndHour = parseInt(await AsyncStorage.getItem('disableEndHour')) || 8;

        const now = new Date();
        const currentHour = now.getHours();

        if (disableStartHour > disableEndHour) {
            return currentHour >= disableStartHour || currentHour < disableEndHour;
        } else {
            return currentHour >= disableStartHour && currentHour < disableEndHour;
        }
    } catch (error) {
        logWithTime(`Erreur lors de la vérification des heures désactivées: ${error}`, 'error');
        return false;
    }
};

// Helper pour jouer une notification sonore (utilisé dans la tâche en arrière-plan)
const playBackgroundNotificationSound = async () => {
    try {
        const intervalMinutes = parseInt(await AsyncStorage.getItem('intervalMinutes')) || 15;
        const isPaused = await AsyncStorage.getItem('isPaused') === 'true';

        // Créer une notification pour le son
        const soundNotificationId = `sound-${Date.now()}`;
        await Notifications.scheduleNotificationAsync({
            identifier: soundNotificationId,
            content: {
                title: '',
                body: '',
                data: { type: 'bip-sound' },
                ...(Platform.OS === 'android' && {
                    android: {
                        channelId: 'reminders',
                        priority: Notifications.AndroidNotificationPriority.HIGH,
                    },
                }),
                sound: Platform.OS === 'ios' ? 'default' : undefined,
            },
            trigger: null, // Immédiat
        });

        // Mettre à jour la notification persistante
        const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';
        await Notifications.scheduleNotificationAsync({
            identifier: PERSISTENT_NOTIFICATION_ID,
            content: {
                title: isPaused ? 'Rappel en pause' : 'Rappel actif',
                body: isPaused
                    ? 'Appuyez sur Reprendre pour continuer'
                    : `Prochain bip dans ${intervalMinutes} minute(s)`,
                data: { type: isPaused ? 'paused' : 'reminder' },
                categoryIdentifier: 'REMINDER',
                ...(Platform.OS === 'android' && {
                    android: {
                        channelId: 'reminders',
                        priority: Notifications.AndroidNotificationPriority.HIGH,
                        sticky: true,
                        ongoing: true,
                        autoCancel: false,
                        sound: 'default',
                        vibrate: [0, 250, 250, 250],
                    },
                }),
            },
            trigger: null,
        });

        // Supprimer la notification sonore après 2 secondes
        setTimeout(async () => {
            try {
                await Notifications.dismissNotificationAsync(soundNotificationId);
            } catch (e) { }
        }, 2000);

        logWithTime('Notification sonore jouée en arrière-plan');
    } catch (error) {
        logWithTime(`Erreur lors de la notification en arrière-plan: ${error}`, 'error');
    }
};

// Définition de la tâche en arrière-plan - DOIT être en dehors du composant
TaskManager.defineTask(BACKGROUND_REMINDER_TASK, async () => {
    try {
        logWithTime('Tâche en arrière-plan déclenchée');

        // Vérifier si le rappel est actif
        const isActive = await AsyncStorage.getItem('isActive') === 'true';
        const isPaused = await AsyncStorage.getItem('isPaused') === 'true';

        if (!isActive || isPaused) {
            logWithTime('Rappel inactif ou en pause, tâche ignorée');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Vérifier si on est dans les heures désactivées
        const inDisabledHours = await checkIsInDisabledHours();
        if (inDisabledHours) {
            logWithTime('Dans les heures désactivées, tâche ignorée');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Jouer la notification sonore
        await playBackgroundNotificationSound();

        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        logWithTime(`Erreur dans la tâche en arrière-plan: ${error}`, 'error');
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

// Configuration des notifications
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const data = notification.request.content.data;

        // Si c'est une notification de bip, jouer le son mais ne pas l'afficher
        if (data?.type === 'bip-sound') {
            return {
                shouldShowBanner: false,
                shouldShowList: false,
                shouldPlaySound: true,
                shouldSetBadge: false,
            };
        }

        // Pour la notification permanente, afficher sans son
        return {
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        };
    },
});

export default function App() {
    const [intervalMinutes, setIntervalMinutes] = useState(15);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [notificationId, setNotificationId] = useState(null);
    const [disableStartHour, setDisableStartHour] = useState(22);
    const [disableEndHour, setDisableEndHour] = useState(8);
    const [isDisabledHoursActive, setIsDisabledHoursActive] = useState(false);
    const [backgroundTaskStatus, setBackgroundTaskStatus] = useState('Non vérifié');

    const notificationListener = useRef(null);
    const responseListener = useRef(null);
    const handlePauseRef = useRef(null);
    const wasActiveRef = useRef(false);

    // Fonction pour enregistrer la tâche en arrière-plan
    const registerBackgroundTask = async (intervalInMinutes) => {
        try {
            // Vérifier le statut de BackgroundFetch
            const status = await BackgroundFetch.getStatusAsync();
            logWithTime(`Statut BackgroundFetch: ${status}`);

            if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
                setBackgroundTaskStatus('Restreint par le système');
                Alert.alert(
                    'Attention',
                    'Les tâches en arrière-plan sont restreintes sur cet appareil. Les rappels pourraient ne pas fonctionner quand l\'écran est éteint.'
                );
                return false;
            }

            if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
                setBackgroundTaskStatus('Refusé');
                Alert.alert(
                    'Permission requise',
                    'Les tâches en arrière-plan sont désactivées. Veuillez les activer dans les paramètres de l\'application.',
                    [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Paramètres', onPress: () => Linking.openSettings() },
                    ]
                );
                return false;
            }

            // Désenregistrer la tâche existante si elle existe
            const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_REMINDER_TASK);
            if (isRegistered) {
                await BackgroundFetch.unregisterTaskAsync(BACKGROUND_REMINDER_TASK);
                logWithTime('Ancienne tâche en arrière-plan désenregistrée');
            }

            // Enregistrer la nouvelle tâche
            // Note: minimumInterval est en secondes
            const intervalInSeconds = intervalInMinutes * 60;

            await BackgroundFetch.registerTaskAsync(BACKGROUND_REMINDER_TASK, {
                minimumInterval: intervalInSeconds,
                stopOnTerminate: false, // Continuer même si l'app est fermée
                startOnBoot: true, // Redémarrer après reboot
            });

            setBackgroundTaskStatus('Actif');
            logWithTime(`Tâche en arrière-plan enregistrée avec intervalle de ${intervalInMinutes} minute(s)`);
            return true;
        } catch (error) {
            logWithTime(`Erreur lors de l'enregistrement de la tâche: ${error}`, 'error');
            setBackgroundTaskStatus(`Erreur: ${error.message}`);
            return false;
        }
    };

    // Fonction pour désenregistrer la tâche en arrière-plan
    const unregisterBackgroundTask = async () => {
        try {
            const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_REMINDER_TASK);
            if (isRegistered) {
                await BackgroundFetch.unregisterTaskAsync(BACKGROUND_REMINDER_TASK);
                logWithTime('Tâche en arrière-plan désenregistrée');
            }
            setBackgroundTaskStatus('Inactif');
        } catch (error) {
            logWithTime(`Erreur lors du désenregistrement: ${error}`, 'error');
        }
    };

    useEffect(() => {
        const initialize = async () => {
            await loadSettings();

            // Configurer le canal de notification Android
            if (Platform.OS === 'android') {
                try {
                    await Notifications.setNotificationChannelAsync('reminders', {
                        name: 'Rappels',
                        description: 'Notifications de rappels sensibles au temps',
                        importance: Notifications.AndroidImportance.HIGH,
                        vibrationPattern: [0, 250, 250, 250],
                        lightColor: '#FF231F7C',
                        enableVibrate: true,
                        showBadge: false,
                        sound: 'default',
                        enableLights: true,
                    });
                    logWithTime('Canal de notification "Rappels" créé');
                } catch (error) {
                    logWithTime(`Erreur lors de la création du canal: ${error}`, 'error');
                }
            }

            // Demander les permissions de notification
            await registerForPushNotificationsAsync();

            // Vérifier l'état de la tâche en arrière-plan
            const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_REMINDER_TASK);
            if (isRegistered) {
                setBackgroundTaskStatus('Actif');
            } else {
                setBackgroundTaskStatus('Inactif');
            }

            // Écouter les notifications
            notificationListener.current = Notifications.addNotificationReceivedListener(
                async (notification) => {
                    const data = notification.request.content.data;
                    if (data?.type === 'bip-sound') {
                        logWithTime('Bip sonore déclenché');
                    }
                }
            );

            responseListener.current = Notifications.addNotificationResponseReceivedListener(
                (response) => {
                    const actionIdentifier = response.actionIdentifier;
                    if (actionIdentifier === 'PAUSE_ACTION') {
                        if (handlePauseRef.current) {
                            handlePauseRef.current();
                        }
                    }
                }
            );
        };

        initialize();

        return () => {
            if (notificationListener.current) {
                Notifications.removeNotificationSubscription(notificationListener.current);
            }
            if (responseListener.current) {
                Notifications.removeNotificationSubscription(responseListener.current);
            }
        };
    }, []);

    useEffect(() => {
        if (isActive && !isPaused) {
            const shouldPlaySound = !wasActiveRef.current;
            wasActiveRef.current = true;
            startReminder(shouldPlaySound);
        } else {
            wasActiveRef.current = false;
            stopReminder();
        }
    }, [isActive, isPaused, intervalMinutes]);

    // Redémarrer quand l'app revient au premier plan
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState === 'active' && isActive && !isPaused) {
                logWithTime('App revenue au premier plan - vérification de la tâche');
                // Vérifier si la tâche est toujours enregistrée
                const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_REMINDER_TASK);
                if (!isRegistered && !isInDisabledHours()) {
                    logWithTime('Tâche non enregistrée, réenregistrement...');
                    await registerBackgroundTask(intervalMinutes);
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isActive, isPaused, intervalMinutes]);

    const loadSettings = async () => {
        try {
            const savedInterval = await AsyncStorage.getItem('intervalMinutes');
            const savedIsActive = await AsyncStorage.getItem('isActive');
            const savedIsPaused = await AsyncStorage.getItem('isPaused');
            const savedDisableStart = await AsyncStorage.getItem('disableStartHour');
            const savedDisableEnd = await AsyncStorage.getItem('disableEndHour');
            const savedIsDisabledHoursActive = await AsyncStorage.getItem('isDisabledHoursActive');

            if (savedInterval) setIntervalMinutes(parseInt(savedInterval));
            if (savedIsActive === 'true') setIsActive(true);
            if (savedIsPaused === 'true') setIsPaused(true);
            if (savedDisableStart) setDisableStartHour(parseInt(savedDisableStart));
            if (savedDisableEnd) setDisableEndHour(parseInt(savedDisableEnd));
            if (savedIsDisabledHoursActive === 'true') setIsDisabledHoursActive(true);
        } catch (error) {
            logWithTime(`Erreur lors du chargement des paramètres: ${error}`, 'error');
        }
    };

    const saveSettings = async () => {
        try {
            await AsyncStorage.setItem('intervalMinutes', intervalMinutes.toString());
            await AsyncStorage.setItem('isActive', isActive.toString());
            await AsyncStorage.setItem('isPaused', isPaused.toString());
            await AsyncStorage.setItem('disableStartHour', disableStartHour.toString());
            await AsyncStorage.setItem('disableEndHour', disableEndHour.toString());
            await AsyncStorage.setItem('isDisabledHoursActive', isDisabledHoursActive.toString());
        } catch (error) {
            logWithTime(`Erreur lors de la sauvegarde des paramètres: ${error}`, 'error');
        }
    };

    const registerForPushNotificationsAsync = async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowBadge: true,
                    allowSound: true,
                    allowAnnouncements: false,
                },
                android: {},
            });
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            Alert.alert(
                'Permission refusée',
                'Les notifications sont nécessaires pour les rappels. Veuillez activer les notifications dans les paramètres de l\'application.'
            );
            return;
        }

        logWithTime('Permissions de notification accordées');
    };

    const isInDisabledHours = () => {
        if (!isDisabledHoursActive) return false;

        const now = new Date();
        const currentHour = now.getHours();

        if (disableStartHour > disableEndHour) {
            return currentHour >= disableStartHour || currentHour < disableEndHour;
        } else {
            return currentHour >= disableStartHour && currentHour < disableEndHour;
        }
    };

    const showPersistentNotification = async (playSound = false, pausedState = null) => {
        try {
            const currentPausedState = pausedState !== null ? pausedState : isPaused;

            await updateNotificationWithActions(currentPausedState);

            const notificationContent = {
                title: currentPausedState ? 'Rappel en pause' : 'Rappel actif',
                body: currentPausedState
                    ? 'Appuyez sur Reprendre pour continuer'
                    : `Prochain bip dans ${intervalMinutes} minute(s)`,
                data: { type: currentPausedState ? 'paused' : 'reminder' },
                autoDismiss: false,
            };

            notificationContent.categoryIdentifier = 'REMINDER';

            if (Platform.OS === 'android') {
                notificationContent.android = {
                    channelId: 'reminders',
                    priority: Notifications.AndroidNotificationPriority.HIGH,
                    sticky: true,
                    ongoing: true,
                    autoCancel: false,
                    sound: playSound ? 'default' : undefined,
                    vibrate: playSound ? [0, 250, 250, 250] : undefined,
                };
            } else {
                notificationContent.sound = playSound ? 'default' : false;
                notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
                notificationContent.sticky = true;
            }

            const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';

            try {
                await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
            } catch (error) { }

            try {
                const notification = await Notifications.scheduleNotificationAsync({
                    identifier: PERSISTENT_NOTIFICATION_ID,
                    content: notificationContent,
                    trigger: null,
                });

                setNotificationId(notification);
                logWithTime(`Notification créée avec ID: ${notification}`);

                if (playSound) {
                    try {
                        const soundNotificationId = `sound-${Date.now()}`;
                        await Notifications.scheduleNotificationAsync({
                            identifier: soundNotificationId,
                            content: {
                                title: '',
                                body: '',
                                data: { type: 'bip-sound' },
                                android: {
                                    channelId: 'reminders',
                                    priority: Notifications.AndroidNotificationPriority.HIGH,
                                },
                                sound: Platform.OS === 'ios' ? 'default' : undefined,
                            },
                            trigger: { seconds: 1 },
                        });
                        setTimeout(async () => {
                            try {
                                await Notifications.dismissNotificationAsync(soundNotificationId);
                                await Notifications.cancelScheduledNotificationAsync(soundNotificationId);
                            } catch (e) { }
                        }, 2000);
                        logWithTime('Notification sonore programmée');
                    } catch (soundError) {
                        logWithTime(`Erreur lors de la notification sonore: ${soundError}`, 'error');
                    }
                }
            } catch (error) {
                logWithTime(`Erreur lors de la création de la notification: ${error}`, 'error');
            }
        } catch (error) {
            logWithTime(`Erreur lors de l'affichage de la notification: ${error}`, 'error');
        }
    };

    const updateNotificationWithActions = async (pausedState = null) => {
        try {
            const currentPausedState = pausedState !== null ? pausedState : isPaused;

            await Notifications.setNotificationCategoryAsync('REMINDER', [
                {
                    identifier: 'PAUSE_ACTION',
                    buttonTitle: currentPausedState ? 'Reprendre' : 'Pause',
                    options: { opensAppToForeground: true },
                },
            ]);
            logWithTime(`Catégorie de notification mise à jour avec action: ${currentPausedState ? 'Reprendre' : 'Pause'}`);
        } catch (error) {
            logWithTime(`Erreur lors de la mise à jour des actions: ${error}`, 'error');
        }
    };

    const startReminder = async (playSound = true) => {
        await cancelAllScheduledReminders();

        if (isInDisabledHours()) {
            logWithTime('Dans les heures désactivées, attente...');
            await showPersistentNotification(false);
            return;
        }

        // Afficher la notification persistante
        await showPersistentNotification(playSound);

        // Enregistrer la tâche en arrière-plan
        const success = await registerBackgroundTask(intervalMinutes);
        if (success) {
            logWithTime(`Tâche en arrière-plan enregistrée pour ${intervalMinutes} minute(s)`);
        }
    };

    const cancelAllScheduledReminders = async () => {
        try {
            try {
                await Notifications.cancelScheduledNotificationAsync('next-bip');
            } catch (error) { }
            logWithTime('Notifications de bip annulées');
        } catch (error) {
            logWithTime(`Erreur lors de l'annulation des bips: ${error}`, 'error');
        }
    };

    const stopReminder = async () => {
        // Désenregistrer la tâche en arrière-plan
        await unregisterBackgroundTask();

        await cancelAllScheduledReminders();

        const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';

        if (notificationId) {
            try {
                await Notifications.dismissNotificationAsync(notificationId);
            } catch (error) { }
            setNotificationId(null);
        }

        try {
            await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
        } catch (error) { }

        try {
            const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
            for (const notif of allNotifications) {
                if (notif.identifier === PERSISTENT_NOTIFICATION_ID) {
                    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                }
            }
        } catch (error) { }

        try {
            await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID);
        } catch (error) { }
    };

    const handleToggle = async () => {
        const newIsActive = !isActive;
        setIsActive(newIsActive);
        setIsPaused(false);
        await saveSettings();
    };

    const handlePause = async () => {
        const newPausedState = !isPaused;
        setIsPaused(newPausedState);

        await saveSettings();

        if (isActive) {
            await showPersistentNotification(false, newPausedState);
        }

        if (!newPausedState && isActive && !isInDisabledHours()) {
            await showPersistentNotification(true, newPausedState);
        }
    };

    handlePauseRef.current = handlePause;

    const handleIntervalChange = (text) => {
        const value = parseInt(text) || 1;
        if (value > 0 && value <= 1440) {
            setIntervalMinutes(value);
            saveSettings();
        }
    };

    const handleDisableHoursChange = async () => {
        setIsDisabledHoursActive(!isDisabledHoursActive);
        await saveSettings();
    };

    // Fonction pour ouvrir les paramètres d'optimisation de batterie
    const openBatteryOptimizationSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await Linking.openSettings();
            } catch (error) {
                logWithTime(`Erreur lors de l'ouverture des paramètres: ${error}`, 'error');
            }
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Rappels Bips</Text>

                <View style={styles.section}>
                    <View style={styles.switchContainer}>
                        <View style={styles.labelContainer}>
                            <Text style={styles.label}>Activer les rappels</Text>
                            <Text style={styles.labelHint}>
                                Active ou désactive complètement le système de rappels
                            </Text>
                        </View>
                        <Switch
                            value={isActive}
                            onValueChange={handleToggle}
                            trackColor={{ false: '#767577', true: '#81b0ff' }}
                            thumbColor={isActive ? '#f5dd4b' : '#f4f3f4'}
                        />
                    </View>
                    {isActive && (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.label}>Intervalle (minutes)</Text>
                            <TextInput
                                style={styles.input}
                                value={intervalMinutes.toString()}
                                onChangeText={handleIntervalChange}
                                keyboardType="numeric"
                                placeholder="15"
                            />
                        </>
                    )}
                </View>

                {isActive && (
                    <>
                        <View style={styles.section}>
                            <View style={styles.switchContainer}>
                                <Text style={styles.label}>Désactiver pendant certaines heures</Text>
                                <Switch
                                    value={isDisabledHoursActive}
                                    onValueChange={handleDisableHoursChange}
                                    trackColor={{ false: '#767577', true: '#81b0ff' }}
                                    thumbColor={isDisabledHoursActive ? '#f5dd4b' : '#f4f3f4'}
                                />
                            </View>
                            {isDisabledHoursActive && (
                                <>
                                    <View style={styles.divider} />
                                    <Text style={styles.label}>Heure de début (désactivation)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={disableStartHour.toString()}
                                        onChangeText={(text) => {
                                            const value = parseInt(text) || 0;
                                            if (value >= 0 && value <= 23) {
                                                setDisableStartHour(value);
                                                saveSettings();
                                            }
                                        }}
                                        keyboardType="numeric"
                                        placeholder="22"
                                    />
                                    <Text style={styles.label}>Heure de fin (réactivation)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={disableEndHour.toString()}
                                        onChangeText={(text) => {
                                            const value = parseInt(text) || 0;
                                            if (value >= 0 && value <= 23) {
                                                setDisableEndHour(value);
                                                saveSettings();
                                            }
                                        }}
                                        keyboardType="numeric"
                                        placeholder="8"
                                    />
                                </>
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text style={[styles.labelHint, { marginBottom: 10 }]}>
                                Pause/Reprendre : Met en pause temporairement les rappels sans les désactiver
                            </Text>
                            <TouchableOpacity
                                style={[styles.button, isPaused ? styles.buttonPaused : styles.buttonActive]}
                                onPress={handlePause}
                            >
                                <Text style={styles.buttonText}>
                                    {isPaused ? 'Reprendre' : 'Pause'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.autoSaveHint}>
                            💾 Tous les paramètres sont sauvegardés automatiquement
                        </Text>

                        <View style={styles.statusContainer}>
                            <Text style={styles.statusText}>
                                Statut: {isPaused ? '⏸️ En pause' : '▶️ Actif'}
                            </Text>
                            <Text style={styles.statusText}>
                                Tâche arrière-plan: {backgroundTaskStatus}
                            </Text>
                            {isInDisabledHours() && (
                                <Text style={styles.statusText}>
                                    ⏰ Heures désactivées actives
                                </Text>
                            )}
                        </View>

                        {Platform.OS === 'android' && (
                            <View style={styles.section}>
                                <Text style={styles.label}>⚡ Optimisation batterie</Text>
                                <Text style={[styles.labelHint, { marginBottom: 10 }]}>
                                    Pour que les rappels fonctionnent avec l'écran éteint, désactivez l'optimisation de batterie pour cette app.
                                </Text>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: '#2196F3' }]}
                                    onPress={openBatteryOptimizationSettings}
                                >
                                    <Text style={styles.buttonText}>
                                        Ouvrir les paramètres
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        padding: 20,
        paddingTop: 60,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
        color: '#333',
    },
    autoSaveHint: {
        fontSize: 12,
        textAlign: 'center',
        color: '#666',
        marginBottom: 10,
        fontStyle: 'italic',
    },
    section: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    switchContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        fontSize: 16,
        color: '#333',
        marginBottom: 5,
        fontWeight: '500',
    },
    labelContainer: {
        flex: 1,
        marginRight: 10,
    },
    labelHint: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
        fontStyle: 'italic',
    },
    divider: {
        height: 1,
        backgroundColor: '#e0e0e0',
        marginVertical: 15,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    button: {
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonActive: {
        backgroundColor: '#4CAF50',
    },
    buttonPaused: {
        backgroundColor: '#FF9800',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusContainer: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 10,
        marginTop: 10,
        alignItems: 'center',
    },
    statusText: {
        fontSize: 16,
        color: '#666',
        marginVertical: 5,
    },
});
