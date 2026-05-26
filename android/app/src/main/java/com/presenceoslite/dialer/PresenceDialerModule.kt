package com.presenceoslite.dialer

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PresenceDialerModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val REQ_ROLE_DIALER = 9221
  }

  private var rolePromise: Promise? = null

  override fun getName(): String = "PresenceDialer"

  override fun initialize() {
    super.initialize()
    reactContext.addActivityEventListener(this)
    CallController.setModule(this)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    CallController.setModule(null)
    super.invalidate()
  }

  @ReactMethod
  fun isDefaultDialer(promise: Promise) {
    try {
      val tm = reactContext.getSystemService(TelecomManager::class.java)
      val def = tm?.defaultDialerPackage
      promise.resolve(def == reactContext.packageName)
    } catch (t: Throwable) {
      promise.reject("E_DEFAULT_DIALER", t.message, t)
    }
  }

  @ReactMethod
  fun requestDefaultDialerRole(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.reject("E_UNSUPPORTED", "Default dialer role requires Android 10+.")
        return
      }
      if (rolePromise != null) { promise.reject("E_BUSY", "Role request in progress."); return }
      val roleManager = reactContext.getSystemService(RoleManager::class.java)
      if (roleManager == null) { promise.reject("E_NO_ROLE_MGR", "RoleManager unavailable."); return }
      if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) { promise.resolve(true); return }
      rolePromise = promise
      try {
        val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
      } catch (t: Throwable) { rolePromise = null; throw t }
    } catch (t: Throwable) { promise.reject("E_ROLE", t.message, t) }
  }

  @ReactMethod
  fun placeCall(number: String, promise: Promise) {
    try {
      val tm = reactContext.getSystemService(TelecomManager::class.java)
      val uri = Uri.fromParts("tel", number, null)
      if (tm != null && tm.defaultDialerPackage == reactContext.packageName) {
        tm.placeCall(uri, Bundle()); promise.resolve(true); return
      }
      try {
        val intent = Intent("android.intent.action.CALL_PRIVILEGED").apply { data = uri; addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        reactContext.startActivity(intent); promise.resolve(true); return
      } catch (ignored: Throwable) {}
      val callIntent = Intent(Intent.ACTION_CALL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(callIntent)
      promise.resolve(true)
    } catch (t: Throwable) { promise.reject("E_PLACE_CALL", t.message, t) }
  }

  @ReactMethod
  fun setMuted(muted: Boolean, promise: Promise) {
    try { CallController.setMuted(muted); promise.resolve(true) }
    catch (t: Throwable) { promise.reject("E_MUTE", t.message, t) }
  }

  @ReactMethod
  fun setSpeaker(enabled: Boolean, promise: Promise) {
    try {
      val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val devices = audioManager.availableCommunicationDevices
        if (enabled) {
          val speaker = devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
          if (speaker != null) audioManager.setCommunicationDevice(speaker)
          audioManager.mode = AudioManager.MODE_IN_CALL
        } else { audioManager.clearCommunicationDevice() }
      } else {
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = enabled
        if (enabled) audioManager.mode = AudioManager.MODE_IN_CALL
      }
      CallController.setSpeaker(enabled)
      promise.resolve(true)
    } catch (t: Throwable) { promise.reject("E_SPEAKER", t.message, t) }
  }

  @ReactMethod
  fun endCall(promise: Promise) {
    try { CallController.disconnect(); promise.resolve(true) }
    catch (t: Throwable) { promise.reject("E_END_CALL", t.message, t) }
  }

  @ReactMethod
  fun setOnHold(held: Boolean, promise: Promise) {
    try { CallController.toggleHold(); promise.resolve(true) }
    catch (t: Throwable) { promise.reject("E_HOLD", t.message, t) }
  }

  /**
   * DTMF fix: stop any currently-playing tone BEFORE starting the new one,
   * then stop it automatically after 200 ms.  Previously the tone was never
   * stopped, so every subsequent playDtmfTone() call was silently ignored by
   * Android because a tone was already playing.
   */
  @ReactMethod
  fun sendDtmf(digit: String, promise: Promise) {
    if (digit.isEmpty()) { promise.reject("E_DTMF", "Empty digit"); return }
    try {
      val call = CallController.currentCall
        ?: run { promise.reject("E_DTMF", "No active call"); return }

      // 1. Stop any previous tone first
      try { call.stopDtmfTone() } catch (ignored: Throwable) {}

      // 2. Start the new tone
      call.playDtmfTone(digit[0])

      // 3. Stop after 200 ms so subsequent digits can play
      Handler(Looper.getMainLooper()).postDelayed({
        try { call.stopDtmfTone() } catch (ignored: Throwable) {}
      }, 200)

      promise.resolve(true)
    } catch (t: Throwable) { promise.reject("E_DTMF", t.message, t) }
  }

  fun emitCallState(state: String, duration: Int = 0, phoneNumber: String = "") {
    val params = Arguments.createMap().apply {
      putString("state", state)
      putInt("duration", duration)
      putString("phoneNumber", phoneNumber)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("callStateChanged", params)
  }

  fun emitIncomingCall(phoneNumber: String, contactName: String = "") {
    val params = Arguments.createMap().apply {
      putString("phoneNumber", phoneNumber)
      if (contactName.isNotEmpty()) putString("contactName", contactName)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("incomingCall", params)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQ_ROLE_DIALER) {
      val p = rolePromise; rolePromise = null
      p?.resolve(resultCode == Activity.RESULT_OK)
    }
  }

  override fun onNewIntent(intent: Intent) {}
}
