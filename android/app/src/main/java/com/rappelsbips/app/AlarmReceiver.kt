package com.rappelsbips.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "AlarmReceiver"
        private var wakeLock: PowerManager.WakeLock? = null

        fun acquireWakeLock(context: Context) {
            releaseWakeLock()
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "RappelsBips::AlarmReceiverWakeLock"
            ).apply {
                acquire(60 * 1000L) // 60 secondes max
            }
            Log.d(TAG, "Wake lock acquis")
        }

        fun releaseWakeLock() {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "Wake lock libéré")
                }
            }
            wakeLock = null
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "=== ALARME REÇUE: ${intent.action} ===")
        
        // Acquérir un wake lock IMMÉDIATEMENT pour garder le CPU éveillé
        acquireWakeLock(context)
        
        // Utiliser goAsync pour avoir plus de temps de traitement
        val pendingResult = goAsync()
        
        try {
            when (intent.action) {
                ReminderService.ACTION_ALARM_TRIGGERED -> {
                    Log.d(TAG, "Traitement de l'alarme déclenchée")
                    
                    // Démarrer/réveiller le service pour traiter l'alarme
                    val serviceIntent = Intent(context, ReminderService::class.java).apply {
                        action = ReminderService.ACTION_ALARM_TRIGGERED
                    }
                    
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(serviceIntent)
                        } else {
                            context.startService(serviceIntent)
                        }
                        Log.d(TAG, "Service démarré pour traiter l'alarme")
                    } catch (e: Exception) {
                        Log.e(TAG, "Erreur lors du démarrage du service: ${e.message}")
                        // En cas d'erreur, jouer le son directement
                        playAlarmDirectly(context)
                    }
                }
                
                Intent.ACTION_BOOT_COMPLETED -> {
                    Log.d(TAG, "=== BOOT COMPLETED ===")
                    handleBootCompleted(context)
                }
            }
        } finally {
            // Libérer après un délai pour laisser le temps au service de démarrer
            android.os.Handler(context.mainLooper).postDelayed({
                releaseWakeLock()
                pendingResult.finish()
            }, 5000)
        }
    }

    private fun handleBootCompleted(context: Context) {
        val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
        val isActive = prefs.getBoolean("isActive", false)
        val isPaused = prefs.getBoolean("isPaused", false)
        
        Log.d(TAG, "Boot: isActive=$isActive, isPaused=$isPaused")
        
        if (isActive && !isPaused) {
            val intervalMinutes = prefs.getInt("intervalMinutes", 15)
            val serviceIntent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_START
                putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
            }
            
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
                Log.d(TAG, "Service redémarré après boot avec intervalle de $intervalMinutes min")
            } catch (e: Exception) {
                Log.e(TAG, "Erreur lors du redémarrage du service: ${e.message}")
            }
        }
    }

    private fun playAlarmDirectly(context: Context) {
        try {
            // Jouer le son par défaut
            val ringtone = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION)
            val r = android.media.RingtoneManager.getRingtone(context, ringtone)
            r.play()
            
            // Vibrer
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    android.os.VibrationEffect.createWaveform(longArrayOf(0, 250, 250, 250), -1)
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(longArrayOf(0, 250, 250, 250), -1)
            }
            
            Log.d(TAG, "Son et vibration joués directement")
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la lecture directe: ${e.message}")
        }
    }
}
