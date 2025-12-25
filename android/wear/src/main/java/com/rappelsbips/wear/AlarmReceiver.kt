package com.rappelsbips.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiverWear"
        private var wakeLock: PowerManager.WakeLock? = null

        fun releaseWakeLock() {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    wakeLock = null
                    Log.d(TAG, "Wake lock receiver libéré")
                }
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "=== ALARM RECEIVER DÉCLENCHÉ ===")
        
        val action = intent.action
        if (action == ReminderService.ACTION_ALARM_TRIGGERED) {
            // Acquérir un wake lock pour s'assurer que le service peut démarrer
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "RappelsBipsWear::AlarmWakeLock"
            )
            wakeLock?.acquire(60 * 1000L) // 60 secondes max
            Log.d(TAG, "Wake lock receiver acquis")
            
            // Démarrer le service pour gérer l'alarme
            val serviceIntent = Intent(context, ReminderService::class.java).apply {
                this.action = ReminderService.ACTION_ALARM_TRIGGERED
            }
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}

