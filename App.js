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
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration des notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

export default function App() {
    const [intervalMinutes, setIntervalMinutes] = useState(15);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [sound, setSound] = useState(null);
    const [notificationId, setNotificationId] = useState(null);
    const [disableStartHour, setDisableStartHour] = useState(22);
    const [disableEndHour, setDisableEndHour] = useState(8);
    const [isDisabledHoursActive, setIsDisabledHoursActive] = useState(false);

    const intervalRef = useRef(null);
    const notificationListener = useRef(null);
    const responseListener = useRef(null);
    const handlePauseRef = useRef(null);

    useEffect(() => {
        // Initialisation : charger les paramètres puis configurer
        const initialize = async () => {
            await loadSettings();

            // Configurer le canal de notification Android
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('reminders', {
                    name: 'Rappels',
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
                    sound: 'default',
                    enableVibrate: true,
                    showBadge: false,
                });
            }

            // Demander les permissions de notification
            await registerForPushNotificationsAsync();

            // Écouter les interactions avec les notifications
            notificationListener.current = Notifications.addNotificationReceivedListener(
                (notification) => {
                    console.log('Notification reçue:', notification);
                }
            );

            responseListener.current = Notifications.addNotificationResponseReceivedListener(
                (response) => {
                    const actionIdentifier = response.actionIdentifier;
                    const data = response.notification.request.content.data;

                    if (actionIdentifier === 'PAUSE_ACTION' || data?.type === 'paused' || data?.type === 'reminder') {
                        // Appeler handlePause via la ref
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
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, []);

    useEffect(() => {
        if (isActive && !isPaused) {
            startReminder();
        } else {
            stopReminder();
        }
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
            console.error('Erreur lors du chargement des paramètres:', error);
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
            console.error('Erreur lors de la sauvegarde des paramètres:', error);
        }
    };

    const registerForPushNotificationsAsync = async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            Alert.alert('Permission refusée', 'Les notifications sont nécessaires pour les rappels.');
            return;
        }
    };

    const isInDisabledHours = () => {
        if (!isDisabledHoursActive) return false;

        const now = new Date();
        const currentHour = now.getHours();

        // Gestion du cas où la plage horaire traverse minuit
        if (disableStartHour > disableEndHour) {
            return currentHour >= disableStartHour || currentHour < disableEndHour;
        } else {
            return currentHour >= disableStartHour && currentHour < disableEndHour;
        }
    };

    // Le son est maintenant joué directement via la notification persistante
    // en passant playSound=true à showPersistentNotification()

    const showPersistentNotification = async (playSound = false) => {
        try {
            // Mettre à jour les actions de notification d'abord
            await updateNotificationWithActions();

            const notificationContent = {
                title: isPaused ? 'Rappel en pause' : 'Rappel actif',
                body: isPaused
                    ? 'Appuyez sur Reprendre pour continuer'
                    : `Prochain bip dans ${intervalMinutes} minute(s)`,
                sound: playSound ? 'default' : false, // Jouer le son seulement si demandé (pour le bip)
                priority: Notifications.AndroidNotificationPriority.HIGH,
                sticky: true,
                categoryIdentifier: 'REMINDER',
                data: { type: isPaused ? 'paused' : 'reminder' },
                autoDismiss: false,
            };

            // Configuration spécifique Android
            if (Platform.OS === 'android') {
                notificationContent.android = {
                    channelId: 'reminders',
                    priority: 'high',
                    sticky: true,
                    ongoing: true,
                    autoCancel: false,
                    actions: [
                        {
                            title: isPaused ? 'Reprendre' : 'Pause',
                            pressAction: {
                                id: 'pause_action',
                            },
                        },
                    ],
                };
            }

            // Utiliser un ID constant pour la notification persistante
            const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';

            // Supprimer toutes les notifications existantes avec cet identifier
            try {
                // Annuler toutes les notifications planifiées avec cet ID
                await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
            } catch (error) {
                // Ignorer si aucune notification n'existe
            }

            // Supprimer aussi la notification actuelle si elle existe
            if (notificationId) {
                try {
                    await Notifications.dismissNotificationAsync(notificationId);
                } catch (error) {
                    // Ignorer si la notification n'existe plus
                }
            }

            // Supprimer toutes les notifications avec cet identifier (au cas où)
            try {
                const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
                for (const notif of allNotifications) {
                    if (notif.identifier === PERSISTENT_NOTIFICATION_ID) {
                        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                    }
                }
            } catch (error) {
                // Ignorer les erreurs
            }

            // Créer une seule notification persistante avec un ID constant
            const notification = await Notifications.scheduleNotificationAsync({
                identifier: PERSISTENT_NOTIFICATION_ID,
                content: notificationContent,
                trigger: null, // Notification persistante (immédiate)
            });

            setNotificationId(notification);
        } catch (error) {
            console.error('Erreur lors de l\'affichage de la notification:', error);
        }
    };

    const updateNotificationWithActions = async () => {
        try {
            // Définir les catégories de notification avec actions
            await Notifications.setNotificationCategoryAsync('REMINDER', [
                {
                    identifier: 'PAUSE_ACTION',
                    buttonTitle: isPaused ? 'Reprendre' : 'Pause',
                    options: { opensAppToForeground: true },
                },
            ], {
                intentIdentifiers: [],
                hiddenPreviewsBodyPlaceholder: '',
                customDismissAction: true,
                allowInCarPlay: false,
                showTitle: true,
                showSubtitle: true,
            });
        } catch (error) {
            console.error('Erreur lors de la mise à jour des actions:', error);
        }
    };

    const startReminder = async () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Vérifier si on est dans les heures désactivées
        if (isInDisabledHours()) {
            console.log('Dans les heures désactivées, attente...');
            // Afficher quand même la notification pour indiquer qu'on est en attente
            await showPersistentNotification(false);
            return;
        }

        // Afficher la notification persistante avec le premier bip
        await showPersistentNotification(true);

        // Programmer les bips suivants - la notification persistante sera mise à jour avec le son
        intervalRef.current = setInterval(async () => {
            if (!isPaused && !isInDisabledHours()) {
                // Mettre à jour la notification persistante avec le son (bip)
                await showPersistentNotification(true);
            }
        }, intervalMinutes * 60 * 1000);
    };

    const stopReminder = async () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';

        // Supprimer toutes les notifications persistantes
        if (notificationId) {
            try {
                await Notifications.dismissNotificationAsync(notificationId);
            } catch (error) {
                // Ignorer si la notification n'existe plus
            }
            setNotificationId(null);
        }

        // Annuler toutes les notifications planifiées avec cet ID
        try {
            await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
        } catch (error) {
            // Ignorer si aucune notification n'existe
        }

        // Supprimer toutes les notifications avec cet identifier
        try {
            const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
            for (const notif of allNotifications) {
                if (notif.identifier === PERSISTENT_NOTIFICATION_ID) {
                    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                }
            }
        } catch (error) {
            // Ignorer les erreurs
        }

        // Dismiss aussi au cas où
        try {
            await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID);
        } catch (error) {
            // Ignorer si la notification n'existe plus
        }
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

        // Sauvegarder l'état de pause
        await saveSettings();

        // Mettre à jour la notification
        if (isActive) {
            await showPersistentNotification();
        }

        // Si on reprend, redémarrer immédiatement si nécessaire
        if (!newPausedState && isActive && !isInDisabledHours()) {
            // Le son sera joué via la notification persistante
            await showPersistentNotification(true);
        }
    };

    // Mettre à jour la ref pour le listener à chaque rendu
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
                            {isInDisabledHours() && (
                                <Text style={styles.statusText}>
                                    ⏰ Heures désactivées actives
                                </Text>
                            )}
                        </View>
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

