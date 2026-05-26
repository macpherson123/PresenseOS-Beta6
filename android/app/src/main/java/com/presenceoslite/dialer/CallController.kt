package com.presenceoslite.dialer

import android.telecom.Call
import android.telecom.InCallService
import android.telecom.CallAudioState

object CallController {
  @Volatile
  var inCallService: InCallService? = null

  @Volatile
  var currentCall: Call? = null

  @Volatile
  private var module: PresenceDialerModule? = null

  fun setModule(m: PresenceDialerModule?) {
    module = m
  }

  fun setMuted(muted: Boolean) {
    inCallService?.setMuted(muted)
  }

  fun setSpeaker(enabled: Boolean) {
    val route = if (enabled) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE
    inCallService?.setAudioRoute(route)
  }

  fun toggleHold() {
    val c = currentCall ?: return
    val isHeld = c.details?.state == Call.STATE_HOLDING
    if (isHeld) c.unhold() else c.hold()
  }

  fun disconnect() {
    currentCall?.disconnect()
  }

  fun emitCallState(state: String, duration: Int = 0, phoneNumber: String = "") {
    module?.emitCallState(state, duration, phoneNumber)
  }

  fun emitIncomingCall(phoneNumber: String, contactName: String = "") {
    module?.emitIncomingCall(phoneNumber, contactName)
  }
}

