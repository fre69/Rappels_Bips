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

    useEffect(() => {
        // Initialisation : charger les paramètres puis configurer
        const initialize = async () => {
            await loadSettings();

            // Configurer le canal de notification Android
            if (Platform.OS === 'android') {
                try {
                    // Supprimer le canal s'il existe déjà (pour forcer la recréation avec les bons paramètres)
                    // Note: sur Android, on ne peut pas vraiment supprimer un canal, mais on peut le recréer avec les bons paramètres
                    await Notifications.setNotificationChannelAsync('reminders', {
                        name: 'Rappels',
                        description: 'Notifications de rappels avec bips sonores',
                        importance: Notifications.AndroidImportance.HIGH,
                        vibrationPattern: [0, 250, 250, 250],
                        lightColor: '#FF231F7C',
                        sound: 'default', // Définir le son par défaut dans le canal
                        enableVibrate: true,
                        showBadge: false,
                    });
                    logWithTime('Canal de notification "Rappels" créé avec succès');
                } catch (error) {
                    logWithTime(`Erreur lors de la création du canal: ${error}`, 'error');
                }
            }

            // Demander les permissions de notification
            await registerForPushNotificationsAsync();

            // Écouter les notifications reçues pour reprogrammer automatiquement
            notificationListener.current = Notifications.addNotificationReceivedListener(
                async (notification) => {
                    const data = notification.request.content.data;
                    if (data?.type === 'bip-sound') {
                        logWithTime('Bip sonore déclenché');
                        // Reprogrammer le prochain bip si l'app est active
                        if (isActive && !isPaused && !isInDisabledHours()) {
                            await scheduleNextBipNotification();
                        }
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
            // Les notifications programmées sont automatiquement annulées
        };
    }, []);

    useEffect(() => {
        if (isActive && !isPaused) {
            startReminder();
        } else {
            stopReminder();
        }
    }, [isActive, isPaused, intervalMinutes]);

    // Reprogrammer les notifications quand l'app revient au premier plan
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState === 'active' && isActive && !isPaused) {
                // Vérifier si une notification de bip est programmée
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                const hasBipScheduled = scheduled.some(n => n.identifier === 'next-bip');

                // Si aucune notification de bip n'est programmée, reprogrammer
                if (!hasBipScheduled && isActive && !isPaused) {
                    logWithTime('Aucune notification de bip programmée, reprogrammation');
                    await scheduleNextBipNotification();
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isActive, isPaused]);

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
            // Sur Android ET iOS, utiliser categoryIdentifier pour les actions
            notificationContent.categoryIdentifier = 'REMINDER';

            if (Platform.OS === 'android') {
                // Sur Android, utiliser le canal (le son est défini dans le canal pour que l'utilisateur puisse le modifier)
                notificationContent.android = {
                    channelId: 'reminders',
                    priority: 'high',
                    sticky: true,
                    ongoing: true,
                    autoCancel: false,
                    // Le son sera joué selon les paramètres du canal "Rappels" définis par l'utilisateur
                };
                logWithTime('Notification Android créée avec categoryIdentifier: REMINDER, channelId: reminders');
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

            // Définir les catégories de notification avec actions pour Android ET iOS
            // Sur Android, les actions de notification doivent aussi être définies via setNotificationCategoryAsync
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

    // Fonction pour programmer la prochaine notification de bip
    // On programme une seule notification à la fois, puis on la reprogramme quand elle se déclenche
    const scheduleNextBipNotification = async () => {
        try {
            // Calculer le délai en secondes jusqu'au prochain bip
            const delaySeconds = intervalMinutes * 60;

            // Annuler l'ancienne notification si elle existe
            try {
                await Notifications.cancelScheduledNotificationAsync('next-bip');
            } catch (e) {
                // Ignorer si elle n'existe pas
            }

            const now = new Date();
            const nextBipTime = new Date(now.getTime() + delaySeconds * 1000);
            logWithTime(`Programmation du prochain bip dans ${delaySeconds} secondes (${nextBipTime.toLocaleString('fr-FR')})`);

            await Notifications.scheduleNotificationAsync({
                identifier: 'next-bip',
                content: {
                    title: '', // Vide pour ne pas afficher de notification
                    body: '', // Vide pour ne pas afficher de notification
                    data: { type: 'bip-sound' },
                    android: {
                        channelId: 'reminders',
                        priority: 'high',
                        // Le son sera joué selon les paramètres du canal "Rappels"
                    },
                    sound: Platform.OS === 'ios' ? 'default' : undefined,
                },
                trigger: {
                    seconds: delaySeconds, // Délai en secondes depuis maintenant
                },
            });

            logWithTime(`Notification de bip programmée pour dans ${delaySeconds} secondes`);
        } catch (error) {
            logWithTime(`Erreur lors de la programmation du bip: ${error}`, 'error');
        }
    };

    const startReminder = async () => {
        // Annuler toutes les notifications de bip précédentes
        await cancelAllScheduledReminders();

        // Vérifier si on est dans les heures désactivées
        if (isInDisabledHours()) {
            logWithTime('Dans les heures désactivées, attente...');
            // Afficher quand même la notification pour indiquer qu'on est en attente
            await showPersistentNotification(false);
            return;
        }

        // Afficher la notification persistante
        await showPersistentNotification(false);

        // Jouer le premier bip immédiatement
        await playFirstBip();

        // Programmer le prochain bip (fonctionne même en arrière-plan)
        await scheduleNextBipNotification();
    };

    // Jouer le premier bip immédiatement
    const playFirstBip = async () => {
        try {
            await Notifications.scheduleNotificationAsync({
                identifier: 'bip-immediate',
                content: {
                    title: '',
                    body: '',
                    data: { type: 'bip-sound' },
                    android: {
                        channelId: 'reminders',
                        priority: 'high',
                    },
                    sound: Platform.OS === 'ios' ? 'default' : undefined,
                },
                trigger: { seconds: 1 }, // 1 seconde pour jouer immédiatement
            });
            logWithTime('Premier bip programmé');
        } catch (error) {
            logWithTime(`Erreur lors du premier bip: ${error}`, 'error');
        }
    };

    const cancelAllScheduledReminders = async () => {
        try {
            // Annuler la notification de bip programmée
            try {
                await Notifications.cancelScheduledNotificationAsync('next-bip');
            } catch (error) {
                // Ignorer si la notification n'existe pas
            }
            // Annuler aussi le bip immédiat
            try {
                await Notifications.cancelScheduledNotificationAsync('bip-immediate');
            } catch (error) { }
            logWithTime('Toutes les notifications de bip annulées');
        } catch (error) {
            logWithTime(`Erreur lors de l'annulation des bips: ${error}`, 'error');
        }
    };

    const stopReminder = async () => {
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

