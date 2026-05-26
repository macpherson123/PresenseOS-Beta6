package com.presenceoslite
import expo.modules.splashscreen.SplashScreenManager

import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.view.WindowManager
import java.lang.ref.WeakReference

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    sInstance = WeakReference(this)
    maybeHandleIncomingCall(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    maybeHandleIncomingCall(intent)
  }

  override fun onDestroy() {
    if (sInstance?.get() === this) sInstance = null
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  // ─── Incoming-call wake handling ──────────────────────────────────────────
  // When launched (or re-launched) with the EXTRA_INCOMING_CALL extra, this
  // activity wakes the device and shows itself above the lockscreen so the
  // user lands directly on the incoming-call UI without unlocking. On a
  // secure keyguard we deliberately do NOT call requestDismissKeyguard —
  // that triggers the PIN prompt on top of our activity. setShowWhenLocked
  // alone is what bypasses the PIN. The flags are cleared by
  // disableForCall(), which is invoked when the call ends; if the device
  // was locked at the time the call arrived, we relock it then so the user
  // returns to the PIN screen rather than an unauthenticated session.

  private var wasLockedAtCallStart: Boolean = false

  private fun maybeHandleIncomingCall(intent: Intent?) {
    if (intent?.getBooleanExtra(EXTRA_INCOMING_CALL, false) == true) {
      enableForCall()
    }
  }

  private fun enableForCall() {
    val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    wasLockedAtCallStart = km?.isKeyguardLocked == true

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // Force the display on if it's currently off — setTurnScreenOn alone
    // only fires the wake at the moment the activity becomes resumed,
    // which can be too late on some OEM stacks. FULL_WAKE_LOCK is
    // deprecated but still effective; the priv-app holds DEVICE_POWER so
    // PowerManager.wakeUp would also work if we ever need it.
    val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm != null && !pm.isInteractive) {
      try {
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(
          PowerManager.FULL_WAKE_LOCK or
          PowerManager.ACQUIRE_CAUSES_WAKEUP or
          PowerManager.ON_AFTER_RELEASE,
          "presenceos:incoming-call"
        )
        wl.acquire(10_000L)
      } catch (_: Throwable) { /* ignore */ }
    }
  }

  private fun disableForCall() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(false)
      setTurnScreenOn(false)
    } else {
      @Suppress("DEPRECATION")
      window.clearFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    if (wasLockedAtCallStart) {
      relockDevice()
    }
    wasLockedAtCallStart = false
  }

  private fun relockDevice() {
    // Prefer DevicePolicyManager.lockNow() — instantly drops the user back
    // to the lockscreen (PIN entry). Falls back to PowerManager.goToSleep
    // when device admin hasn't been granted; goToSleep turns the display
    // off, and the next wake-up shows the keyguard.
    try {
      val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      val admin = ComponentName(this, PresenceAdminReceiver::class.java)
      if (dpm != null && dpm.isAdminActive(admin)) {
        dpm.lockNow()
        return
      }
    } catch (_: Throwable) { /* fall through */ }

    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
      val goToSleep = pm?.javaClass?.getMethod("goToSleep", java.lang.Long.TYPE)
      goToSleep?.invoke(pm, SystemClock.uptimeMillis())
    } catch (_: Throwable) { /* ignore */ }
  }

  companion object {
    const val EXTRA_INCOMING_CALL = "incomingCall"

    @Volatile private var sInstance: WeakReference<MainActivity>? = null

    /** Brings MainActivity to front with the incoming-call extra set. Use
     *  from any background context (services, native modules). If the
     *  activity is already running it goes through onNewIntent. */
    fun launchForIncomingCall(context: Context) {
      val pkg = context.packageName
      val intent = context.packageManager.getLaunchIntentForPackage(pkg)?.apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        )
        putExtra(EXTRA_INCOMING_CALL, true)
      } ?: return
      context.startActivity(intent)
    }

    /** Clear the call-related window flags. Safe to call from any thread;
     *  no-op if MainActivity is not currently alive. */
    fun clearIncomingCallWake() {
      val a = sInstance?.get() ?: return
      a.runOnUiThread { a.disableForCall() }
    }
  }
}
