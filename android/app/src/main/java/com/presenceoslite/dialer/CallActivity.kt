package com.presenceoslite.dialer

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.Call
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.presenceoslite.R
import java.lang.ref.WeakReference

class CallActivity : AppCompatActivity() {

  private lateinit var title: TextView
  private lateinit var status: TextView
  private lateinit var muteBtn: Button
  private lateinit var speakerBtn: Button
  private lateinit var holdBtn: Button
  private lateinit var endBtn: Button

  private var muted = false
  private var speaker = false
  private var callStartTime = 0L
  private var durationHandler = Handler(Looper.getMainLooper())
  private val durationRunnable = object : Runnable {
    override fun run() {
      emitCallState()
      durationHandler.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_call)

    instance = WeakReference(this)

    title = findViewById(R.id.callTitle)
    status = findViewById(R.id.callStatus)
    muteBtn = findViewById(R.id.btnMute)
    speakerBtn = findViewById(R.id.btnSpeaker)
    holdBtn = findViewById(R.id.btnHold)
    endBtn = findViewById(R.id.btnEnd)

    muteBtn.setOnClickListener {
      muted = !muted
      CallController.setMuted(muted)
      renderButtons()
    }

    speakerBtn.setOnClickListener {
      speaker = !speaker
      CallController.setSpeaker(speaker)
      renderButtons()
    }

    holdBtn.setOnClickListener {
      CallController.toggleHold()
    }

    endBtn.setOnClickListener {
      CallController.disconnect()
      finish()
    }

    if (callStartTime == 0L) {
      callStartTime = System.currentTimeMillis()
    }

    renderFromCall(CallController.currentCall)
    renderButtons()
    emitCallState()
    durationHandler.postDelayed(durationRunnable, 1000)
  }

  override fun onDestroy() {
    super.onDestroy()
    durationHandler.removeCallbacks(durationRunnable)
    val inst = instance?.get()
    if (inst === this) instance = null
  }

  private fun renderButtons() {
    muteBtn.text = if (muted) "Unmute" else "Mute"
    speakerBtn.text = if (speaker) "Earpiece" else "Speaker"
  }

  private fun renderFromCall(call: Call?) {
    val details = call?.details
    val handle = details?.handle?.schemeSpecificPart
    title.text = handle ?: "Call"
    status.text = when (details?.state) {
      Call.STATE_NEW -> "Starting…"
      Call.STATE_DIALING -> "Dialing…"
      Call.STATE_RINGING -> "Ringing…"
      Call.STATE_ACTIVE -> "Active"
      Call.STATE_HOLDING -> "On hold"
      Call.STATE_DISCONNECTED -> "Ended"
      Call.STATE_CONNECTING -> "Connecting…"
      Call.STATE_SELECT_PHONE_ACCOUNT -> "Select account…"
      Call.STATE_DISCONNECTING -> "Ending…"
      else -> "In call"
    }

    val isHolding = details?.state == Call.STATE_HOLDING
    holdBtn.text = if (isHolding) "Resume" else "Hold"
  }

  private fun emitCallState() {
    val call = CallController.currentCall ?: return
    val details = call.details ?: return
    val phoneNumber = details.handle?.schemeSpecificPart ?: ""
    val duration = ((System.currentTimeMillis() - callStartTime) / 1000).toInt()

    val state = when (details.state) {
      Call.STATE_DIALING, Call.STATE_RINGING -> "dialing"
      Call.STATE_ACTIVE -> "active"
      Call.STATE_HOLDING -> "held"
      Call.STATE_DISCONNECTED -> "disconnected"
      else -> "connecting"
    }

    CallController.emitCallState(state, duration, phoneNumber)
  }

  companion object {
    @Volatile private var instance: WeakReference<CallActivity>? = null

    fun notifyCallStateChanged(context: Context, call: Call) {
      val a = instance?.get() ?: return
      a.runOnUiThread { a.renderFromCall(call) }
    }

    fun finishIfOpen() {
      val a = instance?.get() ?: return
      a.runOnUiThread { a.finish() }
    }
  }
}

