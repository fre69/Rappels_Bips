package com.rappelsbips.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ReminderService : Service() {

    companion object {
        const val TAG = "ReminderService"
        const val CHANNEL_ID = "reminder_service_channel"
        const val NOTIFICATION_ID = 1001
        const val PREFS_NAME = "ReminderPrefs"
        
        const val ACTION_START = "com.rappelsbips.app.ACTION_START"
        const val ACTION_STOP = "com.rappelsbips.app.ACTION_STOP"
        const val ACTION_PAUSE = "com.rappelsbips.app.ACTION_PAUSE"
        const val ACTION_RESUME = "com.rappelsbips.app.ACTION_RESUME"
        const val ACTION_ALARM_TRIGGERED = "com.rappelsbips.app.ACTION_ALARM_TRIGGERED"
        const val ACTION_UPDATE_INTERVAL = "com.rappelsbips.app.ACTION_UPDATE_INTERVAL"
        
        const val EXTRA_INTERVAL_MINUTES = "interval_minutes"
    }

    private lateinit var prefs: SharedPreferences
    private var intervalMinutes: Int = 15
    private var isPaused: Boolean = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var handler: Handler? = null
    private var backupRunnable: Runnable? = null
    private var lastAlarmTime: Long = 0

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "=== SERVICE CRÉÉ ===")
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // Valeur par défaut pour la vibration si non encore définie
        if (!prefs.contains("isVibrationEnabled")) {
            prefs.edit().putBoolean("isVibrationEnabled", true).apply()
        }
        handler = Handler(Looper.getMainLooper())
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        Log.d(TAG, "=== onStartCommand: $action ===")
        
        when (action) {
            ACTION_START -> {
                intervalMinutes = intent.getIntExtra(EXTRA_INTERVAL_MINUTES, 15)
                isPaused = false
                saveState()
                startForegroundService()
                // Jouer le premier son immédiatement
                playAlarmSound()
                scheduleNextAlarm()
                setupBackupTimer()
            }
            ACTION_STOP -> {
                cancelAlarm()
                cancelBackupTimer()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PAUSE -> {
                isPaused = true
                saveState()
                cancelAlarm()
                cancelBackupTimer()
                updateNotification()
            }
            ACTION_RESUME -> {
                isPaused = false
                saveState()
                // Jouer le son immédiatement à la reprise
                playAlarmSound()
                scheduleNextAlarm()
                setupBackupTimer()
                updateNotification()
            }
            ACTION_ALARM_TRIGGERED -> {
                handleAlarmTriggered()
            }
            ACTION_UPDATE_INTERVAL -> {
                val newInterval = intent.getIntExtra(EXTRA_INTERVAL_MINUTES, intervalMinutes)
                if (newInterval != intervalMinutes) {
                    intervalMinutes = newInterval
                    saveState()
                    if (!isPaused) {
                        cancelAlarm()
                        cancelBackupTimer()
                        scheduleNextAlarm()
                        setupBackupTimer()
                        updateNotification()
                    }
                }
            }
            null -> {
                // Service redémarré par le système
                Log.d(TAG, "Service redémarré par le système")
                loadState()
                if (prefs.getBoolean("isActive", false) && !isPaused) {
                    startForegroundService()
                    scheduleNextAlarm()
                    setupBackupTimer()
                }
            }
        }
        
        return START_STICKY
    }

    private fun loadState() {
        intervalMinutes = prefs.getInt("intervalMinutes", 15)
        isPaused = prefs.getBoolean("isPaused", false)
        Log.d(TAG, "État chargé: intervalle=$intervalMinutes, pause=$isPaused")
    }

    private fun startForegroundService() {
        Log.d(TAG, "Démarrage du Foreground Service")
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)
            
            // Supprimer les anciens canaux non utilisés
            val oldChannels = listOf(
                "reminder_alerts",      // Ancien canal d'alertes
                "reminders",            // Ancien canal Expo
            )
            oldChannels.forEach { channelId ->
                try {
                    notificationManager.deleteNotificationChannel(channelId)
                    Log.d(TAG, "Ancien canal supprimé: $channelId")
                } catch (e: Exception) {
                    // Ignorer si le canal n'existe pas
                }
            }
            
            // Canal pour la notification permanente (silencieux - le son est joué séparément)
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Service de rappels",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notification permanente pour le service de rappels"
                setShowBadge(false)
                setSound(null, null)
            }
            notificationManager.createNotificationChannel(serviceChannel)
            
            Log.d(TAG, "Canal de notification créé")
        }
    }

    private fun buildNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Intent pour pause/reprise
        val pauseResumeIntent = Intent(this, ReminderService::class.java).apply {
            action = if (isPaused) ACTION_RESUME else ACTION_PAUSE
        }
        val pauseResumePendingIntent = PendingIntent.getService(
            this, 1, pauseResumeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = if (isPaused) "⏸️ Rappel en pause" else "🔔 Rappel actif"
        val nextAlarmTime = if (!isPaused) {
            val nextTime = System.currentTimeMillis() + (intervalMinutes * 60 * 1000L)
            val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
            "Prochain bip à ${sdf.format(Date(nextTime))}"
        } else {
            "Appuyez sur Reprendre pour continuer"
        }
        val buttonText = if (isPaused) "▶️ Reprendre" else "⏸️ Pause"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(nextAlarmTime)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(
                android.R.drawable.ic_media_pause,
                buttonText,
                pauseResumePendingIntent
            )
            .build()
    }

    private fun updateNotification() {
        val notification = buildNotification()
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun scheduleNextAlarm() {
        if (isPaused) {
            Log.d(TAG, "En pause, pas de programmation d'alarme")
            return
        }
        
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_ALARM_TRIGGERED
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val triggerTime = System.currentTimeMillis() + (intervalMinutes * 60 * 1000L)
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        Log.d(TAG, "Programmation alarme pour ${sdf.format(Date(triggerTime))} (dans $intervalMinutes min)")
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    // Utiliser setAlarmClock pour une alarme garantie même en mode Doze
                    val alarmInfo = AlarmManager.AlarmClockInfo(triggerTime, pendingIntent)
                    alarmManager.setAlarmClock(alarmInfo, pendingIntent)
                    Log.d(TAG, "✓ Alarme horloge programmée (garantie)")
                } else {
                    // Fallback si permission non accordée
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                    Log.d(TAG, "⚠ Alarme approximative (permission exacte non accordée)")
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Android 6-11: setAlarmClock fonctionne aussi
                val alarmInfo = AlarmManager.AlarmClockInfo(triggerTime, pendingIntent)
                alarmManager.setAlarmClock(alarmInfo, pendingIntent)
                Log.d(TAG, "✓ Alarme horloge programmée")
            } else {
                // Android < 6
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
                Log.d(TAG, "✓ Alarme exacte programmée")
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Erreur de sécurité: ${e.message}")
            // Dernier recours
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            Log.d(TAG, "⚠ Alarme basique programmée (fallback)")
        }
    }

    private fun setupBackupTimer() {
        cancelBackupTimer()
        
        if (isPaused) return
        
        // Timer de backup qui vérifie régulièrement si une alarme a été manquée
        val intervalMs = intervalMinutes * 60 * 1000L
        // Vérifier toutes les 30 secondes si on est proche de l'heure prévue
        val checkInterval = minOf(30000L, intervalMs / 2)
        
        backupRunnable = object : Runnable {
            override fun run() {
                if (!isPaused) {
                    val now = System.currentTimeMillis()
                    val timeSinceLastAlarm = now - lastAlarmTime
                    val expectedInterval = intervalMinutes * 60 * 1000L
                    
                    // Si plus de temps que prévu s'est écoulé depuis la dernière alarme
                    if (lastAlarmTime > 0 && timeSinceLastAlarm > expectedInterval + 10000) {
                        Log.d(TAG, "⚠ Alarme manquée détectée! Délai: ${timeSinceLastAlarm / 1000}s")
                        handleAlarmTriggered()
                    }
                    
                    handler?.postDelayed(this, checkInterval)
                }
            }
        }
        handler?.postDelayed(backupRunnable!!, checkInterval)
        Log.d(TAG, "Timer de backup configuré (vérification toutes les ${checkInterval / 1000}s)")
    }

    private fun cancelBackupTimer() {
        backupRunnable?.let {
            handler?.removeCallbacks(it)
        }
        backupRunnable = null
    }

    private fun cancelAlarm() {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_ALARM_TRIGGERED
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
        Log.d(TAG, "Alarme annulée")
    }

    private fun handleAlarmTriggered() {
        val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        Log.d(TAG, "=== ALARME DÉCLENCHÉE à ${sdf.format(Date())} ===")
        
        // Acquérir un wake lock pour s'assurer que le code s'exécute complètement
        acquireWakeLock()
        
        try {
            // Vérifier qu'on n'est pas en pause et pas dans les heures désactivées
            if (!isPaused && !isInDisabledHours()) {
                playAlarmSound()
                // Note: On ne crée plus de notification d'alerte séparée
                // Seule la notification permanente est mise à jour
                lastAlarmTime = System.currentTimeMillis()
            } else {
                Log.d(TAG, "Alarme ignorée: pause=$isPaused, heuresDesactivees=${isInDisabledHours()}")
            }
            
            // Programmer la prochaine alarme
            scheduleNextAlarm()
            updateNotification()
        } finally {
            // Libérer le wake lock après un court délai
            handler?.postDelayed({
                releaseWakeLock()
                AlarmReceiver.releaseWakeLock()
            }, 3000)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "RappelsBips::ServiceWakeLock"
            )
        }
        wakeLock?.acquire(30 * 1000L) // 30 secondes max
        Log.d(TAG, "Wake lock service acquis")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock service libéré")
            }
        }
    }

    private fun playAlarmSound() {
        Log.d(TAG, "🔊 Lecture du son d'alarme")
        
        try {
            // Récupérer le son personnalisé ou utiliser le son par défaut
            val customSoundUri = prefs.getString("customSoundUri", null)
            val soundUri: Uri = if (customSoundUri != null) {
                Uri.parse(customSoundUri)
            } else {
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            }
            
            val r = RingtoneManager.getRingtone(applicationContext, soundUri)
            
            if (r != null) {
                // Configuration pour jouer le son même en mode silencieux
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    r.isLooping = false
                }
                r.play()
                Log.d(TAG, "Son joué avec succès: $soundUri")
            } else {
                // Fallback au son par défaut si le son personnalisé n'est pas disponible
                Log.w(TAG, "Son personnalisé non disponible, utilisation du son par défaut")
                val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val defaultRingtone = RingtoneManager.getRingtone(applicationContext, defaultUri)
                defaultRingtone?.play()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la lecture du son: ${e.message}")
            // Tentative avec le son par défaut en cas d'erreur
            try {
                val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val defaultRingtone = RingtoneManager.getRingtone(applicationContext, defaultUri)
                defaultRingtone?.play()
            } catch (e2: Exception) {
                Log.e(TAG, "Erreur lors de la lecture du son par défaut: ${e2.message}")
            }
        }

        // Vibrer (si activé dans les préférences)
        val isVibrationEnabled = prefs.getBoolean("isVibrationEnabled", true)
        if (isVibrationEnabled) {
            try {
                val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                    vibratorManager.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                }
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(
                        VibrationEffect.createWaveform(longArrayOf(0, 300, 200, 300, 200, 300), -1)
                    )
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(longArrayOf(0, 300, 200, 300, 200, 300), -1)
                }
                Log.d(TAG, "Vibration effectuée")
            } catch (e: Exception) {
                Log.e(TAG, "Erreur lors de la vibration: ${e.message}")
            }
        } else {
            Log.d(TAG, "Vibration désactivée par l'utilisateur")
        }
    }

    private fun isInDisabledHours(): Boolean {
        val isDisabledHoursActive = prefs.getBoolean("isDisabledHoursActive", false)
        if (!isDisabledHoursActive) return false

        val disableStartHour = prefs.getInt("disableStartHour", 22)
        val disableEndHour = prefs.getInt("disableEndHour", 8)

        val calendar = java.util.Calendar.getInstance()
        val currentHour = calendar.get(java.util.Calendar.HOUR_OF_DAY)

        val result = if (disableStartHour > disableEndHour) {
            currentHour >= disableStartHour || currentHour < disableEndHour
        } else {
            currentHour >= disableStartHour && currentHour < disableEndHour
        }
        
        if (result) {
            Log.d(TAG, "Dans les heures désactivées ($disableStartHour-$disableEndHour, actuel=$currentHour)")
        }
        
        return result
    }

    private fun saveState() {
        prefs.edit()
            .putInt("intervalMinutes", intervalMinutes)
            .putBoolean("isPaused", isPaused)
            .apply()
        Log.d(TAG, "État sauvegardé: intervalle=$intervalMinutes, pause=$isPaused")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        cancelAlarm()
        cancelBackupTimer()
        releaseWakeLock()
        Log.d(TAG, "=== SERVICE DÉTRUIT ===")
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "=== TÂCHE SUPPRIMÉE - Reprogrammation... ===")
        
        // Si l'app est supprimée des tâches récentes, reprogrammer l'alarme
        if (prefs.getBoolean("isActive", false) && !isPaused) {
            scheduleNextAlarm()
        }
    }
}
