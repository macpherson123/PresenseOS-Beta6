package com.presenceoslite.dialer

import android.content.Intent
import android.telecom.Call
import android.telecom.InCallService
import android.database.Cursor
import android.provider.ContactsContract
import com.presenceoslite.MainActivity

class PresenceInCallService : InCallService() {

  private val callback = object : Call.Callback() {
    override fun onStateChanged(call: Call, state: Int) {
      super.onStateChanged(call, state)
      val jsState = when (state) {
        Call.STATE_RINGING -> "ringing"
        Call.STATE_DIALING, Call.STATE_CONNECTING -> "dialing"
        Call.STATE_ACTIVE -> "active"
        Call.STATE_HOLDING -> "held"
        Call.STATE_DISCONNECTED, Call.STATE_DISCONNECTING -> "disconnected"
        else -> "connecting"
      }
      val number = call.details?.handle?.schemeSpecificPart ?: ""
      CallController.emitCallState(jsState, 0, number)
    }
  }

  private fun lookupContactName(number: String): String {
    if (number.isEmpty()) return ""
    return try {
      val uri = android.net.Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(number))
      val cursor: Cursor? = contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)
      cursor?.use { if (it.moveToFirst()) it.getString(0) else "" } ?: ""
    } catch (e: Exception) { "" }
  }

  override fun onCallAdded(call: Call) {
    super.onCallAdded(call)
    CallController.inCallService = this
    CallController.currentCall?.unregisterCallback(callback)
    CallController.currentCall = call
    call.registerCallback(callback)

    val number = call.details?.handle?.schemeSpecificPart ?: ""
    val callState = call.details?.state ?: Call.STATE_NEW

    // Emit incomingCall for ringing calls so the JS overlay shows
    if (callState == Call.STATE_RINGING) {
      val contactName = lookupContactName(number)
      CallController.emitIncomingCall(number, contactName)
    }

    // Bring the main React Native activity to foreground. For a ringing
    // call we use the wake-and-show-over-lockscreen launcher so the user
    // lands directly on the incoming-call UI even if the device was
    // asleep or locked. For an outgoing/dialing add we just bring the
    // existing task to the front.
    if (callState == Call.STATE_RINGING) {
      MainActivity.launchForIncomingCall(this)
    } else {
      val mainIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      if (mainIntent != null) startActivity(mainIntent)
    }

    val jsState = if (callState == Call.STATE_RINGING) "ringing" else "dialing"
    CallController.emitCallState(jsState, 0, number)
  }

  override fun onCallRemoved(call: Call) {
    super.onCallRemoved(call)
    call.unregisterCallback(callback)
    if (CallController.currentCall == call) {
      CallController.currentCall = null
      val number = call.details?.handle?.schemeSpecificPart ?: ""
      CallController.emitCallState("disconnected", 0, number)
      // Drop the show-over-lockscreen / keep-screen-on window flags now
      // that the call has ended, otherwise the home screen would keep
      // bypassing the lock on subsequent launches.
      MainActivity.clearIncomingCallWake()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    if (CallController.inCallService == this) {
      CallController.inCallService = null
    }
  }
}

