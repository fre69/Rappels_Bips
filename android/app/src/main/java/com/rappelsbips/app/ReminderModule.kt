package com.rappelsbips.app

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class ReminderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "ReminderModule"
    }

    override fun getName(): String = "ReminderModule"

    @ReactMethod
    fun startService(intervalMinutes: Int, promise: Promise) {
        try {
            Log.d(TAG, "Démarrage du service avec intervalle de $intervalMinutes minutes")
            
            val context = reactApplicationContext
            
            // Sauvegarder l'état actif
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("isActive", true).apply()
            
            val intent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_START
                putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors du démarrage du service: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            Log.d(TAG, "Arrêt du service")
            
            val context = reactApplicationContext
            
            // Sauvegarder l'état inactif
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("isActive", false).apply()
            
            val intent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_STOP
            }
            context.startService(intent)
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de l'arrêt du service: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun pauseService(promise: Promise) {
        try {
            Log.d(TAG, "Pause du service")
            
            val context = reactApplicationContext
            
            // Sauvegarder l'état de pause
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("isPaused", true).apply()
            
            val intent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_PAUSE
            }
            context.startService(intent)
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la pause: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun resumeService(promise: Promise) {
        try {
            Log.d(TAG, "Reprise du service")
            
            val context = reactApplicationContext
            
            // Sauvegarder l'état de reprise
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("isPaused", false).apply()
            
            val intent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_RESUME
            }
            context.startService(intent)
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la reprise: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateInterval(intervalMinutes: Int, promise: Promise) {
        try {
            Log.d(TAG, "Mise à jour de l'intervalle: $intervalMinutes minutes")
            
            val context = reactApplicationContext
            
            // Sauvegarder le nouvel intervalle
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putInt("intervalMinutes", intervalMinutes).apply()
            
            val intent = Intent(context, ReminderService::class.java).apply {
                action = ReminderService.ACTION_UPDATE_INTERVAL
                putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
            }
            context.startService(intent)
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la mise à jour de l'intervalle: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateDisabledHours(isActive: Boolean, startHour: Int, endHour: Int, promise: Promise) {
        try {
            Log.d(TAG, "Mise à jour des heures désactivées: active=$isActive, start=$startHour, end=$endHour")
            
            val context = reactApplicationContext
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean("isDisabledHoursActive", isActive)
                .putInt("disableStartHour", startHour)
                .putInt("disableEndHour", endHour)
                .apply()
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la mise à jour des heures: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val context = reactApplicationContext
            val prefs = context.getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
            
            val result = WritableNativeMap()
            result.putBoolean("isActive", prefs.getBoolean("isActive", false))
            result.putBoolean("isPaused", prefs.getBoolean("isPaused", false))
            result.putInt("intervalMinutes", prefs.getInt("intervalMinutes", 15))
            result.putBoolean("canScheduleExactAlarms", canScheduleExactAlarms())
            result.putBoolean("isBatteryOptimizationIgnored", isBatteryOptimizationIgnored())
            
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la récupération du statut: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestExactAlarmPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                if (!alarmManager.canScheduleExactAlarms()) {
                    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                        data = Uri.parse("package:${reactApplicationContext.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    reactApplicationContext.startActivity(intent)
                    promise.resolve(false)
                    return
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la demande de permission: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        try {
            val context = reactApplicationContext
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            
            if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
                promise.resolve(false)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de la demande d'exemption batterie: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun openBatterySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Erreur lors de l'ouverture des paramètres: ${e.message}")
            promise.reject("ERROR", e.message)
        }
    }

    private fun canScheduleExactAlarms(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
    }

    private fun isBatteryOptimizationIgnored(): Boolean {
        val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        return powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName)
    }
}

