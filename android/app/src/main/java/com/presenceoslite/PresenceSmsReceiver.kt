package com.presenceoslite

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * PresenceSmsReceiver
 *
 * Required for Android's ROLE_SMS.
 * Receives SMS_DELIVER broadcast when PresenceOS is the default SMS app.
 *
 * HOW TO USE:
 *   Copy this file to:
 *   android/app/src/main/java/com/presenceoslite/PresenceSmsReceiver.kt
 *
 * The actual SMS handling (reading, showing notifications) is done via the
 * PresenceDeviceControl native module / the /sms screen. This receiver just
 * receives the broadcast so Android counts us as a valid SMS role holder.
 *
 * On a real implementation you would:
 *   1. Parse the SMS from intent extras
 *   2. Store it (Android does NOT store it for non-default apps)
 *   3. Show a notification
 *   4. Emit a JS event via PresenceDeviceControl
 */
class PresenceSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Telephony.Sms.Intents.SMS_DELIVER_ACTION != intent.action) return
        Log.d("PresenceSMS", "SMS received — PresenceOS is the default SMS app")
        // TODO: parse Telephony.Sms.Intents.getMessagesFromIntent(intent)
        // TODO: store to content provider, show notification, emit JS event
    }
}
