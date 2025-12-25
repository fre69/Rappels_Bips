package com.rappelsbips.wear

import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var statusText: TextView
    private lateinit var intervalText: TextView
    private lateinit var activeSwitch: Switch
    private lateinit var intervalButton: Button
    private lateinit var settingsButton: Button

    private var isActive = false
    private var intervalMinutes = 15

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(ReminderService.PREFS_NAME, Context.MODE_PRIVATE)
        
        // Initialiser les vues
        statusText = findViewById(R.id.statusText)
        intervalText = findViewById(R.id.intervalText)
        activeSwitch = findViewById(R.id.activeSwitch)
        intervalButton = findViewById(R.id.intervalButton)
        settingsButton = findViewById(R.id.settingsButton)

        // Charger l'état
        loadState()
        updateUI()

        // Écouteurs
        activeSwitch.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                startService()
            } else {
                stopService()
            }
        }

        intervalButton.setOnClickListener {
            showIntervalDialog()
        }

        settingsButton.setOnClickListener {
            showSettingsDialog()
        }

        // Vérifier les permissions
        checkPermissions()
    }

    override fun onResume() {
        super.onResume()
        loadState()
        updateUI()
    }

    private fun loadState() {
        isActive = prefs.getBoolean("isActive", false)
        intervalMinutes = prefs.getInt("intervalMinutes", 15)
    }

    private fun updateUI() {
        activeSwitch.isChecked = isActive
        
        if (isActive) {
            statusText.text = "▶️ Actif"
        } else {
            statusText.text = "⏹️ Arrêté"
        }
        intervalText.text = "Intervalle: $intervalMinutes min"
    }

    private fun startService() {
        if (!checkPermissions()) {
            activeSwitch.isChecked = false
            return
        }

        isActive = true
        prefs.edit().putBoolean("isActive", true).apply()

        val intent = Intent(this, ReminderService::class.java).apply {
            action = ReminderService.ACTION_START
            putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }

        updateUI()
        Toast.makeText(this, "Rappels activés", Toast.LENGTH_SHORT).show()
    }

    private fun stopService() {
        isActive = false
        prefs.edit()
            .putBoolean("isActive", false)
            .putBoolean("isPaused", false)
            .apply()

        val intent = Intent(this, ReminderService::class.java).apply {
            action = ReminderService.ACTION_STOP
        }
        startService(intent)

        updateUI()
        Toast.makeText(this, "Rappels désactivés", Toast.LENGTH_SHORT).show()
    }

    private fun showIntervalDialog() {
        val options = arrayOf("5 min", "10 min", "15 min", "30 min", "60 min", "Personnalisé")
        
        AlertDialog.Builder(this)
            .setTitle("Choisir l'intervalle")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> setInterval(5)
                    1 -> setInterval(10)
                    2 -> setInterval(15)
                    3 -> setInterval(30)
                    4 -> setInterval(60)
                    5 -> showCustomIntervalDialog()
                }
            }
            .show()
    }

    private fun showCustomIntervalDialog() {
        val input = android.widget.EditText(this)
        input.inputType = android.text.InputType.TYPE_CLASS_NUMBER
        input.hint = "Minutes (1-1440)"

        AlertDialog.Builder(this)
            .setTitle("Intervalle personnalisé")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                val value = input.text.toString().toIntOrNull() ?: 15
                if (value in 1..1440) {
                    setInterval(value)
                } else {
                    Toast.makeText(this, "Valeur invalide (1-1440)", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun setInterval(minutes: Int) {
        intervalMinutes = minutes
        prefs.edit().putInt("intervalMinutes", minutes).apply()

            if (isActive) {
            val intent = Intent(this, ReminderService::class.java).apply {
                action = ReminderService.ACTION_UPDATE_INTERVAL
                putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, minutes)
            }
            startService(intent)
        }

        updateUI()
        Toast.makeText(this, "Intervalle: $minutes min", Toast.LENGTH_SHORT).show()
    }

    private fun showSettingsDialog() {
        val isVibrationEnabled = prefs.getBoolean("isVibrationEnabled", true)
        val isDisabledHoursActive = prefs.getBoolean("isDisabledHoursActive", false)
        val disableStartHour = prefs.getInt("disableStartHour", 22)
        val disableEndHour = prefs.getInt("disableEndHour", 8)
        val currentSoundName = getCurrentSoundName()

        val items = arrayOf(
            "Vibration: ${if (isVibrationEnabled) "Activée" else "Désactivée"}",
            "Sonnerie: $currentSoundName",
            "Heures désactivées: ${if (isDisabledHoursActive) "${disableStartHour}h-${disableEndHour}h" else "Non"}"
        )

        val titleView = LayoutInflater.from(this).inflate(R.layout.dialog_title, null)

        AlertDialog.Builder(this)
            .setCustomTitle(titleView)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> toggleVibration()
                    1 -> openSoundPicker()
                    2 -> showDisabledHoursDialog()
                }
            }
            .show()
    }

    private fun getCurrentSoundName(): String {
        val customSoundUri = prefs.getString("customSoundUri", null)
        return if (customSoundUri != null) {
            try {
                val uri = Uri.parse(customSoundUri)
                val ringtone = RingtoneManager.getRingtone(this, uri)
                ringtone?.getTitle(this) ?: "Son personnalisé"
            } catch (e: Exception) {
                "Son personnalisé"
            }
        } else {
            "Par défaut"
        }
    }

    private fun openSoundPicker() {
        try {
            val sounds = mutableListOf<Pair<String, Uri?>>()
            sounds.add(Pair("Par défaut", null))
            
            // Récupérer les sonneries de notification
            val manager = RingtoneManager(this)
            manager.setType(RingtoneManager.TYPE_NOTIFICATION)
            
            val cursor = manager.cursor
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    do {
                        try {
                            val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX)
                            val id = cursor.getInt(RingtoneManager.ID_COLUMN_INDEX)
                            val uri = manager.getRingtoneUri(id)
                            
                            if (uri != null && title.isNotEmpty()) {
                                sounds.add(Pair(title, uri))
                            }
                        } catch (e: Exception) {
                            // Ignorer les erreurs pour cette entrée
                        }
                    } while (cursor.moveToNext())
                }
            }
            
            // Si aucune sonnerie trouvée, ajouter quelques options par défaut
            if (sounds.size == 1) {
                // Ajouter les sonneries système par défaut
                val defaultNotificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                if (defaultNotificationUri != null) {
                    try {
                        val defaultRingtone = RingtoneManager.getRingtone(this, defaultNotificationUri)
                        val defaultTitle = defaultRingtone?.getTitle(this) ?: "Notification par défaut"
                        sounds.add(Pair(defaultTitle, defaultNotificationUri))
                    } catch (e: Exception) {
                        // Ignorer
                    }
                }
                
                // Essayer d'ajouter quelques sonneries système communes
                val systemSounds = listOf(
                    RingtoneManager.TYPE_NOTIFICATION,
                    RingtoneManager.TYPE_ALARM,
                    RingtoneManager.TYPE_RINGTONE
                )
                
                for (type in systemSounds) {
                    try {
                        val uri = RingtoneManager.getDefaultUri(type)
                        if (uri != null) {
                            val ringtone = RingtoneManager.getRingtone(this, uri)
                            val title = ringtone?.getTitle(this)
                            if (title != null && !sounds.any { it.second?.toString() == uri.toString() }) {
                                sounds.add(Pair(title, uri))
                            }
                        }
                    } catch (e: Exception) {
                        // Ignorer
                    }
                }
            }
            
            val soundNames = sounds.map { it.first }.toTypedArray()
            val currentUri = prefs.getString("customSoundUri", null)
            var selectedIndex = 0
            
            // Trouver l'index de la sonnerie actuelle
            if (currentUri != null) {
                val currentUriObj = Uri.parse(currentUri)
                selectedIndex = sounds.indexOfFirst { it.second?.toString() == currentUriObj.toString() }
                if (selectedIndex == -1) selectedIndex = 0
            }
            
            if (soundNames.size <= 1) {
                Toast.makeText(this, "Aucune sonnerie disponible", Toast.LENGTH_SHORT).show()
                return
            }
            
            val titleView = LayoutInflater.from(this).inflate(R.layout.dialog_title, null)
            val titleTextView = titleView.findViewById<TextView>(R.id.dialog_title_text)
            titleTextView.text = "Choisir le son"
            
            AlertDialog.Builder(this)
                .setCustomTitle(titleView)
                .setSingleChoiceItems(soundNames, selectedIndex) { dialog, which ->
                    val selectedSound = sounds[which]
                    
                    if (selectedSound.second == null) {
                        // Son par défaut
                        prefs.edit().remove("customSoundUri").apply()
                        Toast.makeText(this, "Son par défaut sélectionné", Toast.LENGTH_SHORT).show()
                    } else {
                        // Son personnalisé
                        prefs.edit().putString("customSoundUri", selectedSound.second.toString()).apply()
                        Toast.makeText(this, "Son sélectionné: ${selectedSound.first}", Toast.LENGTH_SHORT).show()
                    }
                    
                    dialog.dismiss()
                }
                .setNegativeButton("Annuler", null)
                .show()
        } catch (e: Exception) {
            Toast.makeText(this, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }


    private fun toggleVibration() {
        val current = prefs.getBoolean("isVibrationEnabled", true)
        prefs.edit().putBoolean("isVibrationEnabled", !current).apply()
        Toast.makeText(
            this,
            "Vibration ${if (!current) "activée" else "désactivée"}",
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun showDisabledHoursDialog() {
        val isDisabledHoursActive = prefs.getBoolean("isDisabledHoursActive", false)
        val disableStartHour = prefs.getInt("disableStartHour", 22)
        val disableEndHour = prefs.getInt("disableEndHour", 8)

        val items = arrayOf(
            "Activer: ${if (isDisabledHoursActive) "Oui" else "Non"}",
            "Début: ${disableStartHour}h",
            "Fin: ${disableEndHour}h"
        )

        val titleView = LayoutInflater.from(this).inflate(R.layout.dialog_title, null)
        val titleTextView = titleView.findViewById<TextView>(R.id.dialog_title_text)
        titleTextView.text = "Heures désactivées"

        AlertDialog.Builder(this)
            .setCustomTitle(titleView)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> toggleDisabledHours()
                    1 -> showHourPicker(true, disableStartHour)
                    2 -> showHourPicker(false, disableEndHour)
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun toggleDisabledHours() {
        val current = prefs.getBoolean("isDisabledHoursActive", false)
        val newValue = !current
        prefs.edit().putBoolean("isDisabledHoursActive", newValue).apply()
        
        // Mettre à jour le service si actif
        if (isActive) {
            val disableStartHour = prefs.getInt("disableStartHour", 22)
            val disableEndHour = prefs.getInt("disableEndHour", 8)
            updateServiceDisabledHours(newValue, disableStartHour, disableEndHour)
        }
        
        Toast.makeText(
            this,
            "Heures désactivées: ${if (newValue) "Activées" else "Désactivées"}",
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun showHourPicker(isStartHour: Boolean, currentHour: Int) {
        val hours = (0..23).map { "${it}h" }.toTypedArray()
        val currentIndex = currentHour

        val titleView = LayoutInflater.from(this).inflate(R.layout.dialog_title, null)
        val titleTextView = titleView.findViewById<TextView>(R.id.dialog_title_text)
        titleTextView.text = if (isStartHour) "Heure de début" else "Heure de fin"

        AlertDialog.Builder(this)
            .setCustomTitle(titleView)
            .setSingleChoiceItems(hours, currentIndex) { dialog, which ->
                val selectedHour = which
                if (isStartHour) {
                    prefs.edit().putInt("disableStartHour", selectedHour).apply()
                } else {
                    prefs.edit().putInt("disableEndHour", selectedHour).apply()
                }
                
                // Mettre à jour le service si actif
                if (isActive) {
                    val disableStartHour = if (isStartHour) selectedHour else prefs.getInt("disableStartHour", 22)
                    val disableEndHour = if (isStartHour) prefs.getInt("disableEndHour", 8) else selectedHour
                    val isDisabledHoursActive = prefs.getBoolean("isDisabledHoursActive", false)
                    updateServiceDisabledHours(isDisabledHoursActive, disableStartHour, disableEndHour)
                }
                
                Toast.makeText(
                    this,
                    "${if (isStartHour) "Début" else "Fin"}: ${selectedHour}h",
                    Toast.LENGTH_SHORT
                ).show()
                
                dialog.dismiss()
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun updateServiceDisabledHours(isActive: Boolean, startHour: Int, endHour: Int) {
        // Le service lit directement depuis les SharedPreferences à chaque alarme
        // Pas besoin d'action spéciale, les changements seront pris en compte automatiquement
        if (this.isActive) {
            // Forcer une mise à jour en relançant le service avec les nouveaux paramètres
            val intent = Intent(this, ReminderService::class.java).apply {
                action = ReminderService.ACTION_UPDATE_INTERVAL
                putExtra(ReminderService.EXTRA_INTERVAL_MINUTES, intervalMinutes)
            }
            startService(intent)
        }
    }

    private fun checkPermissions(): Boolean {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!alarmManager.canScheduleExactAlarms()) {
                AlertDialog.Builder(this)
                    .setTitle("Permission requise")
                    .setMessage("Cette application nécessite la permission d'alarmes exactes pour fonctionner correctement.")
                    .setPositiveButton("Paramètres") { _, _ ->
                        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                        startActivity(intent)
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
                return false
            }
        }
        
        return true
    }
}

