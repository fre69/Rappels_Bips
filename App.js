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
    NativeModules,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Module natif pour Android
const { ReminderModule } = NativeModules;

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

// Configuration des notifications (pour iOS ou comme fallback)
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const data = notification.request.content.data;

        if (data?.type === 'bip-sound') {
            return {
                shouldShowBanner: false,
                shouldShowList: false,
                shouldPlaySound: true,
                shouldSetBadge: false,
            };
        }

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
    const [disableStartHour, setDisableStartHour] = useState(22);
    const [disableEndHour, setDisableEndHour] = useState(8);
    const [isDisabledHoursActive, setIsDisabledHoursActive] = useState(false);
    const [serviceStatus, setServiceStatus] = useState({
        canScheduleExactAlarms: false,
        isBatteryOptimizationIgnored: false,
    });
    const [isVibrationEnabled, setIsVibrationEnabled] = useState(true);
    const [currentSoundName, setCurrentSoundName] = useState('Son par défaut');

    const notificationListener = useRef(null);
    const responseListener = useRef(null);
    const handlePauseRef = useRef(null);
    const wasActiveRef = useRef(false);

    // Vérifier le statut du service natif
    const checkServiceStatus = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                const status = await ReminderModule.getStatus();
                setServiceStatus({
                    canScheduleExactAlarms: status.canScheduleExactAlarms,
                    isBatteryOptimizationIgnored: status.isBatteryOptimizationIgnored,
                });
                logWithTime(`Statut service: alarmes exactes=${status.canScheduleExactAlarms}, batterie ignorée=${status.isBatteryOptimizationIgnored}`);
            } catch (error) {
                logWithTime(`Erreur lors de la vérification du statut: ${error}`, 'error');
            }
        }
    };

    // Charger l'état de la vibration depuis le module natif
    const loadVibrationSetting = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                const enabled = await ReminderModule.getVibrationEnabled();
                setIsVibrationEnabled(!!enabled);
            } catch (error) {
                logWithTime(`Erreur lors du chargement de la vibration: ${error}`, 'error');
            }
        }
    };

    const toggleVibration = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                const newValue = !isVibrationEnabled;
                setIsVibrationEnabled(newValue);
                await ReminderModule.setVibrationEnabled(newValue);
            } catch (error) {
                logWithTime(`Erreur lors de la mise à jour de la vibration: ${error}`, 'error');
                Alert.alert('Erreur', 'Impossible de modifier la vibration');
            }
        }
    };

    // Charger le nom du son actuel
    const loadCurrentSoundName = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                const soundName = await ReminderModule.getCurrentSoundName();
                setCurrentSoundName(soundName || 'Son par défaut');
            } catch (error) {
                logWithTime(`Erreur lors du chargement du son: ${error}`, 'error');
            }
        }
    };

    // Ouvrir le sélecteur de son
    const openSoundPicker = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                const result = await ReminderModule.openRingtonePicker();
                if (result) {
                    setCurrentSoundName(result);
                    logWithTime(`Son sélectionné: ${result}`);
                }
            } catch (error) {
                logWithTime(`Erreur lors de la sélection du son: ${error}`, 'error');
                Alert.alert('Erreur', 'Impossible d\'ouvrir le sélecteur de sonneries');
            }
        }
    };

    useEffect(() => {
        const initialize = async () => {
            await loadSettings();

            // Note: Les canaux de notification sont maintenant gérés par le service natif Android
            // (ReminderService.kt) - pas besoin de les créer ici

            // Demander les permissions de notification
            await registerForPushNotificationsAsync();

            // Vérifier le statut du service natif
            await checkServiceStatus();

            // Charger l'état de la vibration
            await loadVibrationSetting();

            // Charger le nom du son actuel
            await loadCurrentSoundName();

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

    // Gérer les changements d'état actif/pause
    useEffect(() => {
        const handleStateChange = async () => {
            if (Platform.OS === 'android' && ReminderModule) {
                if (isActive && !isPaused) {
                    const shouldPlaySound = !wasActiveRef.current;
                    wasActiveRef.current = true;
                    await startNativeService(shouldPlaySound);
                } else if (!isActive) {
                    wasActiveRef.current = false;
                    await stopNativeService();
                }
            }
        };

        handleStateChange();
    }, [isActive, isPaused, intervalMinutes]);

    // Vérifier le statut quand l'app revient au premier plan
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState === 'active') {
                logWithTime('App revenue au premier plan');
                await checkServiceStatus();
            }
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const startNativeService = async (playSound = true) => {
        if (Platform.OS !== 'android' || !ReminderModule) return;

        try {
            // Mettre à jour les heures désactivées dans le service
            await ReminderModule.updateDisabledHours(
                isDisabledHoursActive,
                disableStartHour,
                disableEndHour
            );

            // Démarrer le service
            await ReminderModule.startService(intervalMinutes);
            logWithTime(`Service natif démarré avec intervalle de ${intervalMinutes} min`);
        } catch (error) {
            logWithTime(`Erreur lors du démarrage du service: ${error}`, 'error');
            Alert.alert('Erreur', 'Impossible de démarrer le service de rappels');
        }
    };

    const stopNativeService = async () => {
        if (Platform.OS !== 'android' || !ReminderModule) return;

        try {
            await ReminderModule.stopService();
            logWithTime('Service natif arrêté');
        } catch (error) {
            logWithTime(`Erreur lors de l'arrêt du service: ${error}`, 'error');
        }
    };

    const pauseNativeService = async () => {
        if (Platform.OS !== 'android' || !ReminderModule) return;

        try {
            await ReminderModule.pauseService();
            logWithTime('Service natif en pause');
        } catch (error) {
            logWithTime(`Erreur lors de la pause: ${error}`, 'error');
        }
    };

    const resumeNativeService = async () => {
        if (Platform.OS !== 'android' || !ReminderModule) return;

        try {
            await ReminderModule.resumeService();
            logWithTime('Service natif repris');
        } catch (error) {
            logWithTime(`Erreur lors de la reprise: ${error}`, 'error');
        }
    };

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
                'Les notifications sont nécessaires pour les rappels.'
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

    const handleToggle = async () => {
        const newIsActive = !isActive;
        setIsActive(newIsActive);
        setIsPaused(false);

        // Sauvegarder immédiatement
        await AsyncStorage.setItem('isActive', newIsActive.toString());
        await AsyncStorage.setItem('isPaused', 'false');
    };

    const handlePause = async () => {
        const newPausedState = !isPaused;
        setIsPaused(newPausedState);

        // Sauvegarder l'état
        await AsyncStorage.setItem('isPaused', newPausedState.toString());

        // Contrôler le service natif
        if (Platform.OS === 'android' && ReminderModule) {
            if (newPausedState) {
                await pauseNativeService();
            } else {
                await resumeNativeService();
            }
        }
    };

    handlePauseRef.current = handlePause;

    const handleIntervalChange = async (text) => {
        const value = parseInt(text) || 1;
        if (value > 0 && value <= 1440) {
            setIntervalMinutes(value);
            await AsyncStorage.setItem('intervalMinutes', value.toString());

            // Mettre à jour le service si actif
            if (Platform.OS === 'android' && ReminderModule && isActive && !isPaused) {
                try {
                    await ReminderModule.updateInterval(value);
                    logWithTime(`Intervalle mis à jour: ${value} min`);
                } catch (error) {
                    logWithTime(`Erreur mise à jour intervalle: ${error}`, 'error');
                }
            }
        }
    };

    const handleDisableHoursChange = async () => {
        const newValue = !isDisabledHoursActive;
        setIsDisabledHoursActive(newValue);
        await AsyncStorage.setItem('isDisabledHoursActive', newValue.toString());

        // Mettre à jour le service
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                await ReminderModule.updateDisabledHours(newValue, disableStartHour, disableEndHour);
            } catch (error) {
                logWithTime(`Erreur mise à jour heures: ${error}`, 'error');
            }
        }
    };

    const requestExactAlarmPermission = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                await ReminderModule.requestExactAlarmPermission();
                setTimeout(checkServiceStatus, 1000);
            } catch (error) {
                logWithTime(`Erreur permission alarme: ${error}`, 'error');
            }
        }
    };

    const requestBatteryOptimizationExemption = async () => {
        if (Platform.OS === 'android' && ReminderModule) {
            try {
                await ReminderModule.requestBatteryOptimizationExemption();
                setTimeout(checkServiceStatus, 1000);
            } catch (error) {
                logWithTime(`Erreur exemption batterie: ${error}`, 'error');
            }
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Rappels Bips</Text>

                {/* Section Permissions (Android) */}
                {Platform.OS === 'android' && (
                    <View style={[styles.section, styles.permissionSection]}>
                        <Text style={styles.label}>⚙️ Permissions requises</Text>

                        <View style={styles.permissionItem}>
                            <View style={styles.permissionInfo}>
                                <Text style={styles.permissionLabel}>Alarmes exactes</Text>
                                <Text style={[
                                    styles.permissionStatus,
                                    serviceStatus.canScheduleExactAlarms ? styles.statusOk : styles.statusWarning
                                ]}>
                                    {serviceStatus.canScheduleExactAlarms ? '✅ Autorisé' : '⚠️ Non autorisé'}
                                </Text>
                            </View>
                            {!serviceStatus.canScheduleExactAlarms && (
                                <TouchableOpacity
                                    style={styles.permissionButton}
                                    onPress={requestExactAlarmPermission}
                                >
                                    <Text style={styles.permissionButtonText}>Activer</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.permissionItem}>
                            <View style={styles.permissionInfo}>
                                <Text style={styles.permissionLabel}>Optimisation batterie</Text>
                                <Text style={[
                                    styles.permissionStatus,
                                    serviceStatus.isBatteryOptimizationIgnored ? styles.statusOk : styles.statusWarning
                                ]}>
                                    {serviceStatus.isBatteryOptimizationIgnored ? '✅ Désactivée' : '⚠️ Active'}
                                </Text>
                            </View>
                            {!serviceStatus.isBatteryOptimizationIgnored && (
                                <TouchableOpacity
                                    style={styles.permissionButton}
                                    onPress={requestBatteryOptimizationExemption}
                                >
                                    <Text style={styles.permissionButtonText}>Désactiver</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <Text style={styles.permissionHint}>
                            Ces permissions sont nécessaires pour que les rappels fonctionnent avec l'écran éteint.
                        </Text>
                    </View>
                )}

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

                            {Platform.OS === 'android' && (
                                <>
                                    <View style={styles.divider} />
                                    <Text style={styles.label}>🔔 Son de rappel</Text>
                                    <TouchableOpacity
                                        style={styles.soundPickerButton}
                                        onPress={openSoundPicker}
                                    >
                                        <Text style={styles.soundPickerText} numberOfLines={1}>
                                            {currentSoundName}
                                        </Text>
                                        <Text style={styles.soundPickerIcon}>▶</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.labelHint}>
                                        Appuyez pour choisir une sonnerie personnalisée
                                    </Text>

                                    <View style={[styles.switchContainer, { marginTop: 15 }]}>
                                        <View style={styles.labelContainer}>
                                            <Text style={styles.label}>Vibration</Text>
                                            <Text style={styles.labelHint}>
                                                Active ou désactive la vibration à chaque bip
                                            </Text>
                                        </View>
                                        <Switch
                                            value={isVibrationEnabled}
                                            onValueChange={toggleVibration}
                                            trackColor={{ false: '#767577', true: '#81b0ff' }}
                                            thumbColor={isVibrationEnabled ? '#f5dd4b' : '#f4f3f4'}
                                        />
                                    </View>
                                </>
                            )}
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
                                        onChangeText={async (text) => {
                                            const value = parseInt(text) || 0;
                                            if (value >= 0 && value <= 23) {
                                                setDisableStartHour(value);
                                                await AsyncStorage.setItem('disableStartHour', value.toString());
                                                if (ReminderModule) {
                                                    await ReminderModule.updateDisabledHours(isDisabledHoursActive, value, disableEndHour);
                                                }
                                            }
                                        }}
                                        keyboardType="numeric"
                                        placeholder="22"
                                    />
                                    <Text style={styles.label}>Heure de fin (réactivation)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={disableEndHour.toString()}
                                        onChangeText={async (text) => {
                                            const value = parseInt(text) || 0;
                                            if (value >= 0 && value <= 23) {
                                                setDisableEndHour(value);
                                                await AsyncStorage.setItem('disableEndHour', value.toString());
                                                if (ReminderModule) {
                                                    await ReminderModule.updateDisabledHours(isDisabledHoursActive, disableStartHour, value);
                                                }
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
    permissionSection: {
        backgroundColor: '#fff8e1',
        borderWidth: 1,
        borderColor: '#ffcc02',
    },
    permissionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    permissionInfo: {
        flex: 1,
    },
    permissionLabel: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    permissionStatus: {
        fontSize: 12,
        marginTop: 2,
    },
    statusOk: {
        color: '#4CAF50',
    },
    statusWarning: {
        color: '#FF9800',
    },
    permissionButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 5,
        marginLeft: 10,
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    permissionHint: {
        fontSize: 11,
        color: '#666',
        marginTop: 10,
        fontStyle: 'italic',
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
    soundPickerButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#f9f9f9',
    },
    soundPickerText: {
        fontSize: 16,
        color: '#333',
        flex: 1,
    },
    soundPickerIcon: {
        fontSize: 14,
        color: '#2196F3',
        marginLeft: 10,
    },
});
