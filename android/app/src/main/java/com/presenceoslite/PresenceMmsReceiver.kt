package com.presenceoslite

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * PresenceMmsReceiver
 *
 * Required for Android's ROLE_SMS.
 * Receives WAP_PUSH_DELIVER broadcast (MMS) when PresenceOS is default SMS app.
 *
 * HOW TO USE:
 *   Copy this file to:
 *   android/app/src/main/java/com/presenceoslite/PresenceMmsReceiver.kt
 */
class PresenceMmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if ("android.provider.Telephony.WAP_PUSH_DELIVER" != intent.action) return
        Log.d("PresenceMMS", "MMS received — PresenceOS is the default SMS app")
        // TODO: handle MMS download/storage
    }
}
