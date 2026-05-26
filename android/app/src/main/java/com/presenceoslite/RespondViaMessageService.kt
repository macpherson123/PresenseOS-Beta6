package com.presenceoslite

import android.app.IntentService
import android.content.Intent
import android.util.Log

/**
 * Required by Android for Default SMS App role.
 * Handles quick-reply from notifications (RESPOND_VIA_MESSAGE intent).
 */
class RespondViaMessageService : IntentService("RespondViaMessageService") {
    override fun onHandleIntent(intent: Intent?) {
        Log.d("PresenceRVM", "RESPOND_VIA_MESSAGE received")
    }
}
