package com.presenceoslite

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Required by Android for Default SMS App role.
 * Receives WAP_PUSH_DELIVER for MMS messages.
 */
class MmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("PresenceMmsReceiver", "WAP_PUSH_DELIVER received: ${intent.action}")
    }
}
