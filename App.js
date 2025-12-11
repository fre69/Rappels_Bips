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
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundTimer from 'react-native-background-timer';

// Fonction helper pour les logs avec timestamp
const logWithTime = (message, type = 'log') => {
    //Je veux l'heure sans la date
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

// Configuration des notifications
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const data = notification.request.content.data;

        // Si c'est une notification de bip, jouer le son mais ne pas l'afficher
        if (data?.type === 'bip-sound') {
            return {
                shouldShowBanner: false, // Ne pas afficher dans la bannière
                shouldShowList: false, // Ne pas afficher dans la liste
                shouldPlaySound: true, // Jouer le son du canal "Rappels"
                shouldSetBadge: false,
            };
        }

        // Pour la notification permanente, afficher sans son (le son est joué séparément)
        return {
            shouldShowBanner: true, // Afficher dans la bannière
            shouldShowList: true, // Afficher dans la liste des notifications
            shouldPlaySound: false, // Le son est géré par les notifications sound-only
            shouldSetBadge: false,
        };
    },
});

export default function App() {
    const [intervalMinutes, setIntervalMinutes] = useState(15);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    // sound state retiré - on utilise les notifications pour le son
    const [notificationId, setNotificationId] = useState(null);
    const [disableStartHour, setDisableStartHour] = useState(22);
    const [disableEndHour, setDisableEndHour] = useState(8);
    const [isDisabledHoursActive, setIsDisabledHoursActive] = useState(false);

    const intervalRef = useRef(null);
    const notificationListener = useRef(null);
    const responseListener = useRef(null);
    const handlePauseRef = useRef(null);
    const wasActiveRef = useRef(false); // Pour suivre si le rappel était déjà actif avant un changement

    useEffect(() => {
        // Initialisation : charger les paramètres puis configurer
        const initialize = async () => {
            await loadSettings();

            // Configurer le canal de notification Android avec priorité élevée pour notifications sensibles au temps
            // Les permissions WAKE_LOCK et USE_FULL_SCREEN_INTENT ont été ajoutées dans AndroidManifest.xml
            // pour permettre le réveil de l'écran avec les notifications

            // ⚠️ IMPORTANT : Expo gère automatiquement la création du NotificationChannel et NotificationManager
            // Cette fonction setNotificationChannelAsync() fait EXACTEMENT ce que fait le code Kotlin natif :
            // 
            // Code Kotlin natif (PAS NÉCESSAIRE avec Expo) :
            // val channel = NotificationChannel(CHANNEL_ID, "High priority notifications", NotificationManager.IMPORTANCE_HIGH)
            // val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            // notificationManager.createNotificationChannel(channel)
            //
            // Expo fait tout cela automatiquement en arrière-plan via son module natif !
            if (Platform.OS === 'android') {
                try {
                    await Notifications.setNotificationChannelAsync('reminders', {
                        name: 'Rappels',
                        description: 'Notifications de rappels sensibles au temps (peuvent réveiller l\'écran)',
                        importance: Notifications.AndroidImportance.HIGH, // Priorité élevée pour notifications time-sensitive
                        vibrationPattern: [0, 250, 250, 250],
                        lightColor: '#FF231F7C',
                        enableVibrate: true,
                        showBadge: false,
                        // Options supplémentaires pour notifications sensibles au temps
                        sound: 'default',
                        enableLights: true,
                    });
                    logWithTime('Canal de notification "Rappels" créé avec priorité élevée (time-sensitive, réveil écran activé)');
                } catch (error) {
                    logWithTime(`Erreur lors de la création du canal: ${error}`, 'error');
                }
            }

            // Demander les permissions de notification
            await registerForPushNotificationsAsync();

            // Écouter les notifications reçues (pour logging uniquement maintenant)
            notificationListener.current = Notifications.addNotificationReceivedListener(
                async (notification) => {
                    const data = notification.request.content.data;
                    if (data?.type === 'bip-sound') {
                        logWithTime('Bip sonore déclenché');
                        // Le timer gère maintenant la programmation des bips
                    }
                }
            );

            responseListener.current = Notifications.addNotificationResponseReceivedListener(
                (response) => {
                    const actionIdentifier = response.actionIdentifier;

                    // Ne déclencher handlePause que si on clique vraiment sur le bouton pause
                    // et non pas si on clique simplement sur la notification
                    if (actionIdentifier === 'PAUSE_ACTION') {
                        // Appeler handlePause via la ref
                        if (handlePauseRef.current) {
                            handlePauseRef.current();
                        }
                    }
                    // Si on clique sur la notification elle-même (pas le bouton), on ne fait rien
                    // L'application s'ouvrira simplement sans changer l'état
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
            // Arrêter le timer si il existe
            if (intervalRef.current) {
                BackgroundTimer.clearInterval(intervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (isActive && !isPaused) {
            // Si le rappel était déjà actif, c'est juste un changement d'intervalle - ne pas jouer de son
            const shouldPlaySound = !wasActiveRef.current;
            wasActiveRef.current = true;
            startReminder(shouldPlaySound);
        } else {
            wasActiveRef.current = false;
            stopReminder();
        }
    }, [isActive, isPaused, intervalMinutes]);

    // Redémarrer le timer quand l'app revient au premier plan
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState === 'active' && isActive && !isPaused) {
                logWithTime('App revenue au premier plan - vérification du timer');
                // Le timer devrait continuer à fonctionner, mais on peut le redémarrer pour être sûr
                if (!intervalRef.current && isActive && !isPaused && !isInDisabledHours()) {
                    const intervalMs = intervalMinutes * 60 * 1000;
                    intervalRef.current = BackgroundTimer.setInterval(async () => {
                        if (isActive && !isPaused && !isInDisabledHours()) {
                            logWithTime('Timer déclenché - mise à jour notification et son');
                            await showPersistentNotification(true);
                        }
                    }, intervalMs);
                    logWithTime('Timer redémarré');
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
        // Pour Android 13+ (API 33+), la permission POST_NOTIFICATIONS est requise
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
                android: {
                    // Expo gère automatiquement POST_NOTIFICATIONS pour Android 13+
                },
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

        // Gestion du cas où la plage horaire traverse minuit
        if (disableStartHour > disableEndHour) {
            return currentHour >= disableStartHour || currentHour < disableEndHour;
        } else {
            return currentHour >= disableStartHour && currentHour < disableEndHour;
        }
    };

    // Le son est maintenant joué directement via la notification persistante
    // en passant playSound=true à showPersistentNotification()

    const showPersistentNotification = async (playSound = false, pausedState = null) => {
        try {
            // Utiliser le paramètre passé ou l'état actuel
            const currentPausedState = pausedState !== null ? pausedState : isPaused;

            // Mettre à jour les actions de notification d'abord
            await updateNotificationWithActions(currentPausedState);

            const notificationContent = {
                title: currentPausedState ? 'Rappel en pause' : 'Rappel actif',
                body: currentPausedState
                    ? 'Appuyez sur Reprendre pour continuer'
                    : `Prochain bip dans ${intervalMinutes} minute(s)`,
                data: { type: currentPausedState ? 'paused' : 'reminder' },
                autoDismiss: false,
            };

            // Configuration spécifique par plateforme

            // CATÉGORIE (categoryIdentifier) : Pour les ACTIONS/BOUTONS sur la notification
            // - Utilisé sur iOS ET Android pour définir les boutons d'action (ex: "Pause"/"Reprendre")
            // - Définie via setNotificationCategoryAsync('REMINDER', [...])
            // - Permet d'ajouter des actions interactives aux notifications
            notificationContent.categoryIdentifier = 'REMINDER';

            if (Platform.OS === 'android') {
                // CANAL ANDROID (channelId) : Pour la GESTION SYSTÈME des notifications
                // - Spécifique à Android (depuis Android 8.0)
                // - Créé via setNotificationChannelAsync('reminders', {...})
                // - Permet à l'utilisateur de gérer les paramètres (son, vibration, importance) 
                //   dans les paramètres système Android
                // - Différent du categoryIdentifier qui gère les actions/boutons
                // Selon la documentation Android: https://developer.android.com/develop/ui/views/notifications/time-sensitive
                notificationContent.android = {
                    channelId: 'reminders', // Référence au canal créé dans setNotificationChannelAsync
                    priority: Notifications.AndroidNotificationPriority.HIGH, // Priorité élevée pour time-sensitive
                    sticky: true, // Notification persistante
                    ongoing: true, // Notification en cours (foreground) - pour notifications continues
                    autoCancel: false, // Ne pas annuler automatiquement
                    // Options pour notifications sensibles au temps
                    sound: playSound ? 'default' : undefined,
                    vibrate: playSound ? [0, 250, 250, 250] : undefined,
                };
            } else {
                // Sur iOS, utiliser le son standard
                notificationContent.sound = playSound ? 'default' : false;
                notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
                notificationContent.sticky = true;
            }

            // Utiliser un ID constant pour la notification persistante
            const PERSISTENT_NOTIFICATION_ID = 'reminder-persistent';

            // Annuler l'ancienne notification si elle existe
            try {
                await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
            } catch (error) {
                // Ignorer si aucune notification n'existe
            }

            // Créer la notification avec scheduleNotificationAsync et trigger: null (notification immédiate)
            // Cela fonctionne pour Android ET iOS avec les catégories/actions
            try {
                const notification = await Notifications.scheduleNotificationAsync({
                    identifier: PERSISTENT_NOTIFICATION_ID,
                    content: notificationContent,
                    trigger: null, // Notification immédiate
                });

                setNotificationId(notification);
                logWithTime(`Notification créée avec ID: ${notification}, categoryIdentifier: ${notificationContent.categoryIdentifier}`);

                // Si on doit jouer le son, créer une notification sonore séparée (silencieuse visuellement)
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
                                    priority: Notifications.AndroidNotificationPriority.HIGH, // Priorité élevée pour time-sensitive
                                    // Notification silencieuse visuellement mais avec son
                                },
                                sound: Platform.OS === 'ios' ? 'default' : undefined,
                            },
                            trigger: { seconds: 1 }, // 1 seconde pour jouer immédiatement
                        });
                        // Supprimer après le son
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
            // Utiliser le paramètre passé ou l'état actuel
            const currentPausedState = pausedState !== null ? pausedState : isPaused;

            // Définir la CATÉGORIE de notification avec actions (boutons interactifs)
            // - 'REMINDER' est le categoryIdentifier utilisé dans notificationContent.categoryIdentifier
            // - Cette catégorie définit les boutons d'action affichés sur la notification
            // - Fonctionne sur iOS ET Android (contrairement au channelId qui est Android uniquement)
            // - Les actions permettent à l'utilisateur d'interagir directement depuis la notification
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

    // Fonction scheduleNextBipNotification supprimée - on utilise maintenant BackgroundTimer

    const startReminder = async (playSound = true) => {
        // Annuler toutes les notifications de bip précédentes
        await cancelAllScheduledReminders();

        // Vérifier si on est dans les heures désactivées
        if (isInDisabledHours()) {
            logWithTime('Dans les heures désactivées, attente...');
            // Afficher quand même la notification pour indiquer qu'on est en attente
            await showPersistentNotification(false);
            return;
        }

        // Afficher la notification persistante (avec ou sans son selon le contexte)
        await showPersistentNotification(playSound);

        // Utiliser un timer pour mettre à jour la notification et jouer le son à intervalles réguliers
        // Ce timer fonctionne mieux en arrière-plan que les notifications programmées sur Android moderne
        const intervalMs = intervalMinutes * 60 * 1000;

        // Arrêter le timer précédent s'il existe
        if (intervalRef.current) {
            BackgroundTimer.clearInterval(intervalRef.current);
        }

        intervalRef.current = BackgroundTimer.setInterval(async () => {
            if (isActive && !isPaused && !isInDisabledHours()) {
                logWithTime('Timer déclenché - mise à jour notification et son');
                // Mettre à jour la notification persistante avec son
                await showPersistentNotification(true);
            }
        }, intervalMs);

        logWithTime(`Timer en arrière-plan démarré: mise à jour toutes les ${intervalMinutes} minute(s)`);
    };

    // Plus besoin de playFirstBip - le son est joué via showPersistentNotification(true)

    const cancelAllScheduledReminders = async () => {
        try {
            // Annuler la notification de bip programmée
            try {
                await Notifications.cancelScheduledNotificationAsync('next-bip');
            } catch (error) {
                // Ignorer si la notification n'existe pas
            }
            logWithTime('Notifications de bip annulées');
        } catch (error) {
            logWithTime(`Erreur lors de l'annulation des bips: ${error}`, 'error');
        }
    };

    const stopReminder = async () => {
        // Arrêter le timer en arrière-plan
        if (intervalRef.current) {
            BackgroundTimer.clearInterval(intervalRef.current);
            intervalRef.current = null;
            logWithTime('Timer en arrière-plan arrêté');
        }

        // Annuler toutes les notifications de bip
        await cancelAllScheduledReminders();

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

        // Mettre à jour la notification avec le nouvel état
        if (isActive) {
            await showPersistentNotification(false, newPausedState);
        }

        // Si on reprend, redémarrer immédiatement si nécessaire
        if (!newPausedState && isActive && !isInDisabledHours()) {
            // Le son sera joué via la notification persistante
            await showPersistentNotification(true, newPausedState);
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

