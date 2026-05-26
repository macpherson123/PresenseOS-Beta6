package com.presenceoslite

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Required to be eligible as the Default SMS App.
 * Receives SMS_DELIVER (in-foreground delivery to the default app) and
 * SMS_RECEIVED (legacy broadcast for non-default apps on older APIs).
 *
 * Actual message storage is handled by the OS when presenceOS holds the
 * default SMS role — this receiver exists so we qualify for the role.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Telephony.Sms.Intents.SMS_DELIVER_ACTION,
            Telephony.Sms.Intents.SMS_RECEIVED_ACTION -> {
                // The OS writes the SMS to the provider when we are the default app.
                // Nothing else required here for basic role eligibility.
                Log.d("PresenceSmsReceiver", "SMS received: ${intent.action}")
            }
        }
    }
}
