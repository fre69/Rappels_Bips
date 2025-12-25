package com.rappelsbips.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiverWear"
        private const val PREFS_NAME = "ReminderPrefsWear"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "=== DÉMARRAGE SYSTÈME DÉTECTÉ ===")
            
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isActive = prefs.getBoolean("isActive", false)
            val isPaused = prefs.getBoolean("isPaused", false)
            
            if (isActive && !isPaused) {
                val intervalMinutes = prefs.getInt("intervalMinutes", 15)
                Log.d(TAG, "Redémarrage du service: intervalle=$intervalMinutes")
                
                val serviceIntent = Intent(context, ReminderService::class.java).apply {
                    action = ReminderService.ACTION_START
                    putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
                }
                
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                Log.d(TAG, "Service non actif, pas de redémarrage")
            }
        }
    }
}

