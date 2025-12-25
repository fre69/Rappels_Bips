# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Wear OS classes
-keep class androidx.wear.** { *; }
-keep class com.google.android.wearable.** { *; }

# Keep service classes
-keep class com.rappelsbips.wear.ReminderService { *; }
-keep class com.rappelsbips.wear.AlarmReceiver { *; }
-keep class com.rappelsbips.wear.BootReceiver { *; }

