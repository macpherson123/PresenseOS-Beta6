package com.presenceoslite

import android.app.usage.NetworkStatsManager
import android.net.TrafficStats
import android.os.Environment
import java.io.File
import java.io.DataOutputStream
import java.io.IOException
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.app.role.RoleManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.nfc.NfcAdapter
import android.os.Build
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableArray
import android.content.ComponentName
import android.telephony.SmsManager
import android.provider.Telephony
import android.provider.ContactsContract
import java.util.concurrent.atomic.AtomicBoolean
import android.hardware.camera2.CameraManager

class PresenceDeviceControlModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val TAG = "PresenceDeviceControl"
  }

  private var wifiNetworkCallback: ConnectivityManager.NetworkCallback? = null
  private var lastNetTotal: Long = 0L

  override fun getName(): String = "PresenceDeviceControl"

  /** Returns the BluetoothAdapter using the non-deprecated BluetoothManager route. */
  private fun btAdapter(): BluetoothAdapter? =
    (reactContext.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  override fun initialize() {
    super.initialize()
    reactContext.addActivityEventListener(this)
  }

  private fun dpm(): DevicePolicyManager =
    reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private fun adminComponent(): ComponentName =
    ComponentName(reactContext, PresenceAdminReceiver::class.java)

  @ReactMethod
  fun isDeviceAdminActive(promise: Promise) {
    try {
      promise.resolve(dpm().isAdminActive(adminComponent()))
    } catch (t: Throwable) {
      promise.reject("E_ADMIN_CHECK", t.message, t)
    }
  }

  @ReactMethod
  fun requestDeviceAdmin(promise: Promise) {
    try {
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
        putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
        putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
          "Required to allow presenceOS to lock the screen.")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_ADMIN_REQUEST", t.message, t)
    }
  }

  @ReactMethod
  fun lockScreen(promise: Promise) {
    try {
      val admin = adminComponent()
      if (!dpm().isAdminActive(admin)) {
        promise.reject("E_NOT_ADMIN", "Device admin not active. Call requestDeviceAdmin first.")
        return
      }
      dpm().lockNow()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_LOCK", t.message, t)
    }
  }

  override fun invalidate() {
    try {
      disconnectWifiRequestInternal()
    } catch (ignored: Throwable) {
      // ignore
    }
    reactContext.removeActivityEventListener(this)
    super.invalidate()
  }

  /** Brings MainActivity to the foreground with the incoming-call extra
   *  so the device wakes up and shows the call UI above the lockscreen.
   *  Used by the WebRTC signaling path (PresenceNet socket) — the
   *  cellular path goes through PresenceInCallService directly. */
  @ReactMethod
  fun wakeForIncomingCall(promise: Promise) {
    try {
      MainActivity.launchForIncomingCall(reactContext.applicationContext)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_WAKE_FOR_CALL", t.message, t)
    }
  }

  /** Clears the call-related window flags. Call this when the call ends
   *  so subsequent launches don't bypass the lockscreen. */
  @ReactMethod
  fun clearIncomingCallWake(promise: Promise) {
    try {
      MainActivity.clearIncomingCallWake()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_CLEAR_CALL_WAKE", t.message, t)
    }
  }

  @ReactMethod
  fun getHardwareStates(promise: Promise) {
    try {
      val appContext = reactContext.applicationContext

      val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val wifiEnabled = wifiManager.isWifiEnabled

      val bluetoothEnabled = btAdapter()?.isEnabled ?: false

      val nfcAdapter = NfcAdapter.getDefaultAdapter(appContext)
      val nfcEnabled = nfcAdapter?.isEnabled ?: false

      val locationManager = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val locationEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        locationManager.isLocationEnabled
      } else {
        @Suppress("DEPRECATION")
        locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
          locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
      }

      val hotspotEnabled = try {
        val state = wifiManager.javaClass.getMethod("getWifiApState").invoke(wifiManager) as? Int ?: 0
        state == 13 // WIFI_AP_STATE_ENABLED
      } catch (ignored: Throwable) { false }

      val mobileDataEnabled = try {
        val tm = appContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          tm.isDataEnabled
        } else {
          // Pre-API 26: read via Settings.Global
          Settings.Global.getInt(appContext.contentResolver, "mobile_data", 1) == 1
        }
      } catch (ignored: Throwable) { true }

      val res = Arguments.createMap().apply {
        putBoolean("wifiEnabled", wifiEnabled)
        putBoolean("bluetoothEnabled", bluetoothEnabled)
        putBoolean("nfcEnabled", nfcEnabled)
        putBoolean("locationEnabled", locationEnabled)
        putBoolean("hotspotEnabled", hotspotEnabled)
        putBoolean("mobileDataEnabled", mobileDataEnabled)
      }
      promise.resolve(res)
    } catch (t: Throwable) {
      promise.reject("E_STATES", t.message, t)
    }
  }

  @ReactMethod
  fun openSystemSettings(screen: String, promise: Promise) {
    try {
      val action = when (screen) {
        "wifi" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS
        "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
        "nfc" -> Settings.ACTION_NFC_SETTINGS
        "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
        "hotspot" -> Settings.ACTION_SETTINGS
        "mobileData" -> Settings.ACTION_DATA_USAGE_SETTINGS
        "apps" -> Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS
        else -> Settings.ACTION_SETTINGS
      }

      val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_OPEN_SETTINGS", t.message, t)
    }
  }

  @ReactMethod
  fun setWifiEnabled(enabled: Boolean, promise: Promise) {
    try {
      val appContext = reactContext.applicationContext
      val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

      // Attempt 1: WifiManager.setWifiEnabled — works on pre-Q and on Android 10+
      // when the app is installed as a privileged / system app (/system/priv-app).
      @Suppress("DEPRECATION")
      val toggled = try {
        wifiManager.setWifiEnabled(enabled)
      } catch (se: SecurityException) {
        false
      }
      if (toggled) { promise.resolve("ok"); return }

      // Attempt 2: Settings.Global.WIFI_ON — requires WRITE_SECURE_SETTINGS which
      // is granted automatically to platform-signed / priv-apps.
      try {
        Settings.Global.putInt(
          appContext.contentResolver,
          Settings.Global.WIFI_ON,
          if (enabled) 1 else 0
        )
        promise.resolve("ok")
        return
      } catch (se: SecurityException) {
        // Not yet elevated — fall through
      }

      // No silent path available yet; caller should prompt the user to grant
      // WRITE_SECURE_SETTINGS via ADB while transitioning to a system app.
      promise.resolve("failed")
    } catch (t: Throwable) {
      promise.reject("E_WIFI_TOGGLE", t.message, t)
    }
  }

  @ReactMethod
  fun getWifiEnabled(promise: Promise) {
    try {
      val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      promise.resolve(wifiManager.isWifiEnabled)
    } catch (t: Throwable) {
      promise.reject("E_WIFI_STATE", t.message, t)
    }
  }

  @ReactMethod
  fun getConnectedSsid(promise: Promise) {
    try {
      val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val info = wifiManager.connectionInfo
      val raw = info?.ssid?.trim('"') ?: ""
      promise.resolve(if (raw == "<unknown ssid>" || raw == "0x") "" else raw)
    } catch (t: Throwable) {
      promise.resolve("")
    }
  }

  // ── Bluetooth ────────────────────────────────────────────────────────────

  /**
   * Unified BT on/off — no dialog, waits for actual state change.
   * Resolves "ok" once BluetoothAdapter.ACTION_STATE_CHANGED confirms the
   * target state, "failed" if neither toggle path worked, or times out after 8 s.
   */
  @ReactMethod
  fun setBluetoothEnabled(enabled: Boolean, promise: Promise) {
    try {
      val adapter = btAdapter()
      if (adapter == null) { promise.reject("E_NO_BT", "No Bluetooth hardware"); return }

      // Already in target state — resolve immediately
      if (enabled == adapter.isEnabled) { promise.resolve("ok"); return }

      val settled = AtomicBoolean(false)
      val targetState = if (enabled) BluetoothAdapter.STATE_ON else BluetoothAdapter.STATE_OFF

      // Register a receiver to watch for the actual state change
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          if (intent.action != BluetoothAdapter.ACTION_STATE_CHANGED) return
          val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)
          if (state == targetState && settled.compareAndSet(false, true)) {
            try { reactContext.applicationContext.unregisterReceiver(this) } catch (i: Throwable) {}
            reactContext.runOnUiQueueThread { promise.resolve("ok") }
          }
        }
      }
      // API 34+: must specify RECEIVER_EXPORTED for system broadcasts
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        reactContext.applicationContext.registerReceiver(
          receiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), Context.RECEIVER_EXPORTED
        )
      } else {
        reactContext.applicationContext.registerReceiver(
          receiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        )
      }

      // Safety timeout — if state never changes, fall back
      Handler(Looper.getMainLooper()).postDelayed({
        if (settled.compareAndSet(false, true)) {
          try { reactContext.applicationContext.unregisterReceiver(receiver) } catch (i: Throwable) {}
          reactContext.runOnUiQueueThread { promise.resolve("failed") }
        }
      }, 8_000)

      // Attempt 1: adapter.enable()/disable() — works with BLUETOOTH_PRIVILEGED
      @Suppress("DEPRECATION")
      val toggled = try { if (enabled) adapter.enable() else adapter.disable() }
                    catch (se: SecurityException) { false }

      if (!toggled) {
        // Attempt 2: Settings.Global (requires WRITE_SECURE_SETTINGS)
        try {
          Settings.Global.putInt(
            reactContext.applicationContext.contentResolver,
            "bluetooth_on",
            if (enabled) 1 else 0
          )
        } catch (se: SecurityException) {
          // Neither path available; cancel the receiver and resolve failed
          if (settled.compareAndSet(false, true)) {
            try { reactContext.applicationContext.unregisterReceiver(receiver) } catch (i: Throwable) {}
            promise.resolve("failed")
          }
        }
      }
    } catch (t: Throwable) {
      promise.reject("E_BT_TOGGLE", t.message, t)
    }
  }

  /** Returns the actual current Bluetooth enabled state. */
  @ReactMethod
  fun getBluetoothEnabled(promise: Promise) {
    try {
      promise.resolve(btAdapter()?.isEnabled ?: false)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /** Legacy alias kept for backward compat. */
  @ReactMethod
  fun enableBluetooth(promise: Promise) = setBluetoothEnabled(true, promise)

  /** Returns the list of currently bonded (paired) devices — instant, no scan. */
  @ReactMethod
  fun getPairedDevices(promise: Promise) {
    try {
      val adapter = btAdapter()
      val arr = Arguments.createArray()
      for (d in adapter?.bondedDevices ?: emptySet()) {
        val m = Arguments.createMap()
        val name = try { d.name?.takeIf { it.isNotBlank() } ?: d.address } catch (se: SecurityException) { d.address }
        m.putString("name", name)
        m.putString("address", d.address)
        m.putBoolean("paired", true)
        m.putInt("rssi", -60)
        arr.pushMap(m)
      }
      promise.resolve(arr)
    } catch (t: Throwable) {
      promise.reject("E_BT_PAIRED", t.message, t)
    }
  }

  /**
   * Starts BT discovery, collects ACTION_FOUND broadcasts, seeds with paired
   * devices, resolves after DISCOVERY_FINISHED or a 13 s timeout.
   */
  @ReactMethod
  fun scanBluetoothDevices(promise: Promise) {
    try {
      val adapter = btAdapter()
      if (adapter == null) { promise.reject("E_NO_BT", "No Bluetooth"); return }
      if (!adapter.isEnabled) { promise.reject("E_BT_OFF", "Enable Bluetooth first"); return }

      val settled = AtomicBoolean(false)
      val found = java.util.concurrent.ConcurrentHashMap<String, WritableMap>()

      // Seed with currently paired devices
      for (d in adapter.bondedDevices ?: emptySet()) {
        val m = Arguments.createMap()
        val name = try { d.name?.takeIf { it.isNotBlank() } ?: d.address } catch (se: SecurityException) { d.address }
        m.putString("name", name)
        m.putString("address", d.address)
        m.putBoolean("paired", true)
        m.putInt("rssi", -60)
        found[d.address] = m
      }

      fun resolve(receiver: BroadcastReceiver) {
        if (!settled.compareAndSet(false, true)) return
        try { reactContext.applicationContext.unregisterReceiver(receiver) } catch (i: Throwable) {}
        try { adapter.cancelDiscovery() } catch (i: Throwable) {}
        val arr = Arguments.createArray()
        found.values.forEach { arr.pushMap(it) }
        reactContext.runOnUiQueueThread { promise.resolve(arr) }
      }

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val dev: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
              } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
              }
              if (dev == null) return
              val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, (-100).toShort()).toInt()
              val name = try { dev.name?.takeIf { it.isNotBlank() } ?: dev.address } catch (se: SecurityException) { dev.address }
              val m = Arguments.createMap()
              m.putString("name", name)
              m.putString("address", dev.address)
              m.putBoolean("paired", dev.bondState == BluetoothDevice.BOND_BONDED)
              m.putInt("rssi", rssi)
              found[dev.address] = m
            }
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> resolve(this)
          }
        }
      }

      val filter = IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_FOUND)
        addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
      }
      // API 34+: must specify RECEIVER_EXPORTED for system broadcasts
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        reactContext.applicationContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        reactContext.applicationContext.registerReceiver(receiver, filter)
      }

      // Safety timeout — BT discovery is ~12s; we give one extra second
      Handler(Looper.getMainLooper()).postDelayed({ resolve(receiver) }, 13_000)

      adapter.cancelDiscovery() // cancel any ongoing scan before starting
      adapter.startDiscovery()
    } catch (t: Throwable) {
      promise.reject("E_BT_SCAN", t.message, t)
    }
  }

  /** Returns whether the device is currently visible/discoverable to others. */
  @ReactMethod
  fun isBluetoothDiscoverable(promise: Promise) {
    try {
      promise.resolve(btAdapter()?.scanMode == BluetoothAdapter.SCAN_MODE_CONNECTABLE_DISCOVERABLE)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /**
   * Make this device visible (or hidden) to nearby BT devices.
   *
   * System-app path: hidden setScanMode(int mode, int duration) via reflection.
   *   - enable=true  → SCAN_MODE_CONNECTABLE_DISCOVERABLE, duration 0 (indefinite)
   *   - enable=false → SCAN_MODE_CONNECTABLE, duration 0
   *
   * Fallback (enable only): ACTION_REQUEST_DISCOVERABLE dialog (300 s).
   */
  @ReactMethod
  fun setBluetoothDiscoverable(enable: Boolean, promise: Promise) {
    try {
      val adapter = btAdapter()
      if (adapter == null) { promise.reject("E_NO_BT", "No Bluetooth"); return }

      val targetMode = if (enable)
        BluetoothAdapter.SCAN_MODE_CONNECTABLE_DISCOVERABLE
      else
        BluetoothAdapter.SCAN_MODE_CONNECTABLE

      // Attempt 1: two-arg setScanMode(int mode, int duration) — works on AOSP system apps
      try {
        val m = adapter.javaClass.getDeclaredMethod("setScanMode", Int::class.java, Int::class.java)
        m.isAccessible = true
        m.invoke(adapter, targetMode, 0)
        promise.resolve("ok")
        return
      } catch (ignored: Throwable) {}

      // Attempt 2: one-arg setScanMode(int mode)
      try {
        val m = adapter.javaClass.getDeclaredMethod("setScanMode", Int::class.java)
        m.isAccessible = true
        m.invoke(adapter, targetMode)
        promise.resolve("ok")
        return
      } catch (ignored: Throwable) {}

      // Attempt 3: ACTION_REQUEST_DISCOVERABLE dialog (enable only)
      if (enable) {
        val intent = Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE).apply {
          putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.resolve("panel")
      } else {
        promise.resolve("failed")
      }
    } catch (t: Throwable) {
      promise.reject("E_BT_DISCOVERABLE", t.message, t)
    }
  }

  // ── Hotspot ───────────────────────────────────────────────────────────────

  /** Returns true when the Wi-Fi AP (hotspot) is currently enabled. */
  @ReactMethod
  fun getHotspotEnabled(promise: Promise) {
    try {
      val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val state = wm.javaClass.getMethod("getWifiApState").invoke(wm) as? Int ?: 0
      promise.resolve(state == 13) // WIFI_AP_STATE_ENABLED = 13
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  /**
   * Returns the current hotspot (SoftAP) SSID and passphrase as { ssid, password }.
   * Queries SoftApConfiguration on API 30+, falls back to WifiConfiguration on older.
   */
  @ReactMethod
  fun getHotspotConfig(promise: Promise) {
    try {
      val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

      // API 30+: SoftApConfiguration
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        try {
          val config = wm.javaClass.getMethod("getSoftApConfiguration").invoke(wm)
          if (config != null) {
            var ssid = ""
            try {
              val raw = config.javaClass.getMethod("getSsid").invoke(config)
              ssid = (raw as? String) ?: raw?.toString() ?: ""
            } catch (ignored: Throwable) {}
            if (ssid.isBlank()) {
              try {
                val raw = config.javaClass.getMethod("getWifiSsid").invoke(config)
                ssid = raw?.toString() ?: ""
              } catch (ignored: Throwable) {}
            }
            var pass = ""
            try { pass = config.javaClass.getMethod("getPassphrase").invoke(config) as? String ?: "" } catch (ignored: Throwable) {}
            val map = Arguments.createMap()
            map.putString("ssid", ssid.trim('"'))
            map.putString("password", pass)
            promise.resolve(map)
            return
          }
        } catch (e: Throwable) { Log.w(TAG, "getSoftApConfiguration failed: ${e.message}") }
      }

      // Fallback: WifiConfiguration (pre-API 30)
      try {
        val config = wm.javaClass.getMethod("getWifiApConfiguration").invoke(wm)
        if (config != null) {
          val ssid = runCatching { config.javaClass.getField("SSID").get(config) as? String ?: "" }.getOrDefault("")
          val pass = runCatching { config.javaClass.getField("preSharedKey").get(config) as? String ?: "" }.getOrDefault("")
          val map = Arguments.createMap()
          map.putString("ssid", ssid.trim('"'))
          map.putString("password", pass.trim('"'))
          promise.resolve(map)
          return
        }
      } catch (e: Throwable) { Log.w(TAG, "getWifiApConfiguration failed: ${e.message}") }

      // Default
      val map = Arguments.createMap()
      map.putString("ssid", "PresenceOS")
      map.putString("password", "")
      promise.resolve(map)
    } catch (t: Throwable) {
      promise.reject("E_HOTSPOT_CONFIG", t.message, t)
    }
  }

  /** Execute a shell command as root. Returns stdout or throws. */
  private fun execRootCmd(cmd: String): String {
    val process = Runtime.getRuntime().exec("su")
    val os = DataOutputStream(process.outputStream)
    os.writeBytes("$cmd\n")
    os.writeBytes("exit\n")
    os.flush()
    val stdout = process.inputStream.bufferedReader().readText().trim()
    process.waitFor()
    return stdout
  }

  /**
   * Enable or disable the hotspot (SoftAP) with a given SSID and password.
   * - enable=false: stops the AP using stopSoftAp() (API 30+) or setWifiApEnabled(null, false)
   * - enable=true : builds a SoftApConfiguration (API 30+) or WifiConfiguration (pre-30)
   *   and starts the AP via startSoftAp() / setWifiApEnabled(config, true)
   */
  @ReactMethod
  fun setHotspot(enabled: Boolean, ssid: String?, password: String?, promise: Promise) {
    try {
      val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

      if (!enabled) {
        // Try stopSoftAp() first (API 30+, system API)
        try {
          val ok = wm.javaClass.getMethod("stopSoftAp").invoke(wm) as? Boolean ?: true
          promise.resolve(if (ok) "ok" else "failed")
          return
        } catch (ignored: Throwable) {}
        // Fallback: setWifiApEnabled(null, false)
        try {
          @Suppress("DEPRECATION")
          wm.javaClass.getMethod("setWifiApEnabled",
            android.net.wifi.WifiConfiguration::class.java, Boolean::class.java
          ).invoke(wm, null, false)
          promise.resolve("ok")
          return
        } catch (ignored: Throwable) {}
        promise.resolve("failed")
        return
      }

      val effectiveSsid = ssid?.takeIf { it.isNotBlank() } ?: "PresenceOS"

      // API 30+: SoftApConfiguration.Builder
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        try {
          val bClass = Class.forName("android.net.wifi.SoftApConfiguration\$Builder")
          val builder = bClass.newInstance()
          // Try String-based setSsid (pre-API 33)
          var ssidSet = false
          try {
            bClass.getMethod("setSsid", String::class.java).invoke(builder, effectiveSsid)
            ssidSet = true
          } catch (ignored: Throwable) {}
          if (!ssidSet) {
            // API 33+ requires WifiSsid — build it via WifiSsid.fromBytes()
            try {
              val wifiSsidClass = Class.forName("android.net.wifi.WifiSsid")
              val wifiSsid = wifiSsidClass.getMethod("fromBytes", ByteArray::class.java)
                .invoke(null, effectiveSsid.toByteArray(Charsets.UTF_8))
              bClass.getMethod("setWifiSsid", wifiSsidClass).invoke(builder, wifiSsid)
            } catch (ignored: Throwable) {}
          }
          if (!password.isNullOrBlank()) {
            bClass.getMethod("setPassphrase", String::class.java, Int::class.java)
              .invoke(builder, password, 1) // 1 = SECURITY_TYPE_WPA2_PSK
          } else {
            bClass.getMethod("setPassphrase", String::class.java, Int::class.java)
              .invoke(builder, null, 0) // 0 = SECURITY_TYPE_OPEN
          }
          val config = bClass.getMethod("build").invoke(builder)
          val softApClass = Class.forName("android.net.wifi.SoftApConfiguration")
          val ok = wm.javaClass.getMethod("startSoftAp", softApClass).invoke(wm, config) as? Boolean ?: false
          promise.resolve(if (ok) "ok" else "failed")
          return
        } catch (e: Throwable) { Log.w(TAG, "SoftApConfiguration start failed: ${e.message}") }
      }

      // Fallback: WifiConfiguration (pre-API 30)
      try {
        @Suppress("DEPRECATION")
        val config = android.net.wifi.WifiConfiguration()
        @Suppress("DEPRECATION")
        config.SSID = effectiveSsid
        if (!password.isNullOrBlank()) {
          @Suppress("DEPRECATION")
          config.preSharedKey = "\"$password\""
          @Suppress("DEPRECATION")
          config.allowedKeyManagement.set(android.net.wifi.WifiConfiguration.KeyMgmt.WPA2_PSK)
        } else {
          @Suppress("DEPRECATION")
          config.allowedKeyManagement.set(android.net.wifi.WifiConfiguration.KeyMgmt.NONE)
        }
        @Suppress("DEPRECATION")
        val ok = wm.javaClass.getMethod("setWifiApEnabled",
          android.net.wifi.WifiConfiguration::class.java, Boolean::class.java
        ).invoke(wm, config, true) as? Boolean ?: false
        promise.resolve(if (ok) "ok" else "failed")
        return
      } catch (e: Throwable) { Log.w(TAG, "WifiConfiguration start failed: ${e.message}") }

      // Root shell fallback — use `svc wifi hotspot` or `cmd wifi` 
      try {
        if (enabled) {
          val ssidArg = ssid?.takeIf { it.isNotBlank() } ?: "PresenceOS"
          // Android 11+ supports: cmd wifi start-softap <ssid> <open|wpa2> [password]
          val secArg = if (!password.isNullOrBlank()) "wpa2 $password" else "open"
          val result = execRootCmd("cmd wifi start-softap \"$ssidArg\" $secArg")
          promise.resolve("ok-root:$result")
        } else {
          val result = execRootCmd("cmd wifi stop-softap")
          promise.resolve("ok-root:$result")
        }
        return
      } catch (rootErr: Throwable) {
        Log.w(TAG, "Root hotspot fallback also failed: ${rootErr.message}")
      }
      promise.resolve("failed")
    } catch (t: Throwable) {
      promise.reject("E_HOTSPOT", t.message, t)
    }
  }

  /**
   * Simple boolean toggle for hotspot — delegates to setHotspot with no SSID/password override.
   * Called from React Native as PresenceDeviceControl.setHotspotEnabled(enabled).
   */
  @ReactMethod
  fun setHotspotEnabled(enabled: Boolean, promise: Promise) {
    setHotspot(enabled, null, null, promise)
  }

  // ── Mobile Data ───────────────────────────────────────────────────────────

  /**
   * Toggle mobile data (cellular data) on or off.
   *
   * Attempt 1: TelephonyManager.setDataEnabled(boolean) — API 26+, requires
   *            MODIFY_PHONE_STATE (auto-granted to system/priv apps).
   * Attempt 2: Settings.Global "mobile_data" — requires WRITE_SECURE_SETTINGS.
   * Attempt 3: ITelephony binder (legacy hidden API) — final fallback.
   * Resolves "ok" on success, "failed" otherwise.
   */
  @ReactMethod
  fun setMobileDataEnabled(enabled: Boolean, promise: Promise) {
    try {
      val tm = reactContext.applicationContext
        .getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

      // Attempt 1: TelephonyManager.setDataEnabled (API 26+, MODIFY_PHONE_STATE)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        try {
          tm.javaClass.getMethod("setDataEnabled", Boolean::class.java).invoke(tm, enabled)
          promise.resolve("ok")
          return
        } catch (se: SecurityException) {
          Log.w(TAG, "setDataEnabled denied: ${se.message}")
        } catch (e: Throwable) {
          Log.w(TAG, "setDataEnabled failed: ${e.message}")
        }
      }

      // Attempt 2: Settings.Global "mobile_data" (WRITE_SECURE_SETTINGS)
      try {
        Settings.Global.putInt(
          reactContext.applicationContext.contentResolver,
          "mobile_data",
          if (enabled) 1 else 0
        )
        promise.resolve("ok")
        return
      } catch (se: SecurityException) {
        Log.w(TAG, "mobile_data global write denied: ${se.message}")
      }

      // Attempt 3: ITelephony binder (legacy hidden API)
      try {
        val method = tm.javaClass.getDeclaredMethod("getITelephony").apply { isAccessible = true }
        val iTelephony = method.invoke(tm)
        if (iTelephony != null) {
          val fn = if (enabled) "enableDataConnectivity" else "disableDataConnectivity"
          iTelephony.javaClass.getMethod(fn).invoke(iTelephony)
          promise.resolve("ok")
          return
        }
      } catch (e: Throwable) {
        Log.w(TAG, "ITelephony data toggle failed: ${e.message}")
      }

      promise.resolve("failed")
    } catch (t: Throwable) {
      promise.reject("E_MOBILE_DATA", t.message, t)
    }
  }

  @ReactMethod
  fun openDataSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_DATA_ROAMING_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val act = reactContext.currentActivity
      if (act != null) act.startActivity(intent)
      else reactContext.applicationContext.startActivity(intent)
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_DATA_SETTINGS", t.message, t)
    }
  }

  // ── NFC ───────────────────────────────────────────────────────────────────

  @ReactMethod
  fun setNfcEnabled(enabled: Boolean, promise: Promise) {
    try {
      val nfcAdapter = NfcAdapter.getDefaultAdapter(reactContext.applicationContext)
      if (nfcAdapter == null) { promise.resolve(false); return }
      // Direct method via reflection (requires system/priv app)
      try {
        val method = nfcAdapter.javaClass.getDeclaredMethod(if (enabled) "enable" else "disable").apply {
          isAccessible = true
        }
        method.invoke(nfcAdapter)
        promise.resolve("ok")
        return
      } catch (ignored: Throwable) { }
      // Fallback: write Settings.Global (requires WRITE_SECURE_SETTINGS)
      Settings.Global.putInt(reactContext.contentResolver, "nfc_on", if (enabled) 1 else 0)
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_NFC", t.message, t)
    }
  }

  // ── Location ─────────────────────────────────────────────────────────────

  /**
   * Toggle device location (precise) on or off without opening Settings.
   *
   * Attempt 1: LocationManager.setLocationEnabledForUser (API 28+, hidden @SystemApi)
   * Attempt 2: Settings.Secure.LOCATION_MODE (WRITE_SECURE_SETTINGS)
   * Attempt 3: Settings.Secure.LOCATION_PROVIDERS_ALLOWED legacy toggle
   * Resolves "ok" on success, "failed" otherwise.
   */
  @ReactMethod
  fun setLocationEnabled(enabled: Boolean, promise: Promise) {
    try {
      // Attempt 1: LocationManager.setLocationEnabledForUser (API 28+)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val locationManager = reactContext.applicationContext
          .getSystemService(Context.LOCATION_SERVICE) as LocationManager
        try {
          val method = locationManager.javaClass.getDeclaredMethod(
            "setLocationEnabledForUser",
            Boolean::class.java,
            android.os.UserHandle::class.java
          ).apply { isAccessible = true }
          method.invoke(locationManager, enabled, android.os.Process.myUserHandle())
          promise.resolve("ok")
          return
        } catch (se: SecurityException) {
          Log.w(TAG, "setLocationEnabledForUser denied: ${se.message}")
        } catch (e: Throwable) {
          Log.w(TAG, "setLocationEnabledForUser failed: ${e.message}")
        }
      }

      // Attempt 2: Settings.Secure.LOCATION_MODE (requires WRITE_SECURE_SETTINGS)
      try {
        @Suppress("DEPRECATION")
        val mode = if (enabled) Settings.Secure.LOCATION_MODE_HIGH_ACCURACY else Settings.Secure.LOCATION_MODE_OFF
        @Suppress("DEPRECATION")
        Settings.Secure.putInt(
          reactContext.applicationContext.contentResolver,
          Settings.Secure.LOCATION_MODE,
          mode
        )
        promise.resolve("ok")
        return
      } catch (se: SecurityException) {
        Log.w(TAG, "LOCATION_MODE write denied: ${se.message}")
      }

      // Attempt 3: LOCATION_PROVIDERS_ALLOWED legacy approach
      try {
        val providers = if (enabled) "+gps,+network,+wifi" else "-gps,-network,-wifi"
        Settings.Secure.putString(
          reactContext.applicationContext.contentResolver,
          Settings.Secure.LOCATION_PROVIDERS_ALLOWED,
          providers
        )
        promise.resolve("ok")
        return
      } catch (se: SecurityException) {
        Log.w(TAG, "LOCATION_PROVIDERS_ALLOWED write denied: ${se.message}")
      }

      promise.resolve("failed")
    } catch (t: Throwable) {
      promise.reject("E_LOCATION", t.message, t)
    }
  }

  @ReactMethod
  fun scanWifi(promise: Promise) {
    val appContext = reactContext.applicationContext
    try {
      val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

      if (!wifiManager.isWifiEnabled) {
        promise.reject("E_WIFI_OFF", "Wi-Fi is disabled")
        return
      }

      /** Reads current scanResults into a WritableArray, safely. */
      fun buildResultArray(): WritableArray {
        val arr = Arguments.createArray()
        val results = try {
          wifiManager.scanResults
            .filter { it.SSID != null && it.SSID.isNotBlank() && it.SSID != "<unknown ssid>" }
            .sortedByDescending { it.level }
            .distinctBy { it.SSID }
        } catch (e: SecurityException) {
          Log.w(TAG, "getScanResults denied: ${e.message}")
          emptyList()
        }
        for (r in results) {
          val m = Arguments.createMap()
          m.putString("ssid", r.SSID)
          m.putString("bssid", r.BSSID)
          m.putInt("level", r.level)
          m.putInt("frequency", r.frequency)
          m.putString("capabilities", r.capabilities)
          arr.pushMap(m)
        }
        return arr
      }

      val settled = AtomicBoolean(false)

      fun settle(src: String, receiver: BroadcastReceiver?) {
        if (!settled.compareAndSet(false, true)) return
        if (receiver != null) try { appContext.unregisterReceiver(receiver) } catch (ignored: Throwable) {}
        Log.d(TAG, "[WiFi] scan resolved via $src")
        reactContext.runOnUiQueueThread { promise.resolve(buildResultArray()) }
      }

      // Register receiver on applicationContext so system broadcasts always arrive
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          val updated = intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false)
          settle(if (updated) "fresh-scan" else "cached-broadcast", this)
        }
      }
      // API 34+: must specify RECEIVER_EXPORTED for system broadcasts (SCAN_RESULTS_AVAILABLE_ACTION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appContext.registerReceiver(receiver, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION), Context.RECEIVER_EXPORTED)
      } else {
        appContext.registerReceiver(receiver, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION))
      }

      // Safety timeout: resolve with whatever is cached if broadcast never fires
      Handler(Looper.getMainLooper()).postDelayed({
        settle("timeout", receiver)
      }, 6_000)

      // Try system-app bypass: startScan(WorkSource) skips throttle on priv-apps
      var scanStarted = false
      try {
        val wsClass = Class.forName("android.os.WorkSource")
        val ws = wsClass.newInstance()
        val method = wifiManager.javaClass.getDeclaredMethod("startScan", wsClass)
        method.isAccessible = true
        method.invoke(wifiManager, ws)
        scanStarted = true
        Log.d(TAG, "[WiFi] startScan(WorkSource) succeeded")
      } catch (ignored: Throwable) {}

      if (!scanStarted) {
        // Standard path — may be throttled; OS will still fire broadcast with cached results
        try {
          @Suppress("DEPRECATION")
          wifiManager.startScan()
          scanStarted = true
          Log.d(TAG, "[WiFi] startScan() succeeded")
        } catch (ignored: Throwable) {}
      }

      // If neither scan path worked, return cached results immediately
      if (!scanStarted) {
        settle("cached-immediate", receiver)
      }
    } catch (t: Throwable) {
      promise.reject("E_WIFI_SCAN", t.message, t)
    }
  }

  @ReactMethod
  fun connectWifi(ssid: String, password: String?, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.reject("E_UNSUPPORTED", "Wi\u2011Fi connect is only implemented for Android 10+ in this build.")
        return
      }

      disconnectWifiRequestInternal()

      val cm = reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val specBuilder = WifiNetworkSpecifier.Builder().setSsid(ssid)
      if (!password.isNullOrBlank()) {
        specBuilder.setWpa2Passphrase(password)
      }
      val spec = specBuilder.build()

      val request = NetworkRequest.Builder()
        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
        .setNetworkSpecifier(spec)
        .build()

      val settled = AtomicBoolean(false)
      val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          if (settled.compareAndSet(false, true)) {
            try {
              cm.bindProcessToNetwork(network)
            } catch (t: Throwable) {
              Log.w(TAG, "bindProcessToNetwork failed: ${t.message}")
            }
            reactContext.runOnUiQueueThread { promise.resolve(true) }
          }
        }

        override fun onUnavailable() {
          if (settled.compareAndSet(false, true)) {
            reactContext.runOnUiQueueThread { promise.reject("E_WIFI_UNAVAILABLE", "Network unavailable") }
          }
        }

        override fun onLost(network: Network) {
          try {
            cm.bindProcessToNetwork(null)
          } catch (ignored: Throwable) {
            // ignore
          }
        }
      }

      wifiNetworkCallback = callback
      cm.requestNetwork(request, callback)
    } catch (t: Throwable) {
      promise.reject("E_WIFI_CONNECT", t.message, t)
    }
  }

  @ReactMethod
  fun disconnectWifiRequest(promise: Promise) {
    try {
      disconnectWifiRequestInternal()
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_WIFI_DISCONNECT", t.message, t)
    }
  }

  private fun disconnectWifiRequestInternal() {
    val cm = reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    wifiNetworkCallback?.let {
      try {
        cm.unregisterNetworkCallback(it)
      } catch (ignored: Throwable) {
        // ignore
      }
    }
    wifiNetworkCallback = null
    try {
      cm.bindProcessToNetwork(null)
    } catch (ignored: Throwable) {
      // ignore
    }
  }

  /** Legacy — delegates to setBluetoothEnabled. */
  @ReactMethod
  fun requestEnableBluetooth(promise: Promise) = setBluetoothEnabled(true, promise)

  /** Legacy — delegates to setBluetoothEnabled. */
  @ReactMethod
  fun disableBluetooth(promise: Promise) = setBluetoothEnabled(false, promise)

  @ReactMethod
  fun setBrightness(value: Int, promise: Promise) {
    if (!Settings.System.canWrite(reactContext.applicationContext)) {
      promise.reject("E_WRITE_SETTINGS_DENIED", "WRITE_SETTINGS not granted — grant it in System Settings > Apps > Special App Access > Modify system settings")
      return
    }
    try {
      val brightness = (value.toFloat() / 100f * 255f).toInt().coerceIn(0, 255)
      // Disable auto-brightness so the manual value sticks
      Settings.System.putInt(
        reactContext.applicationContext.contentResolver,
        Settings.System.SCREEN_BRIGHTNESS_MODE,
        Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
      )
      Settings.System.putInt(
        reactContext.applicationContext.contentResolver,
        Settings.System.SCREEN_BRIGHTNESS,
        brightness
      )
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_BRIGHTNESS", t.message, t)
    }
  }

  @ReactMethod
  fun setScreenTimeout(ms: Int, promise: Promise) {
    if (!Settings.System.canWrite(reactContext.applicationContext)) {
      promise.reject("E_WRITE_SETTINGS_DENIED", "WRITE_SETTINGS not granted")
      return
    }
    try {
      Settings.System.putInt(
        reactContext.applicationContext.contentResolver,
        Settings.System.SCREEN_OFF_TIMEOUT,
        ms
      )
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_TIMEOUT", t.message, t)
    }
  }

  /**
   * Write the system font scale to Settings.System.FONT_SCALE.
   * Accepted values: 0.75 (XS) / 0.85 (Small) / 1.00 (Medium) / 1.15 (Large) / 1.30 (XL)
   * Requires WRITE_SETTINGS (auto-granted to system/priv apps).
   */
  @ReactMethod
  fun setFontScale(scale: Float, promise: Promise) {
    if (!Settings.System.canWrite(reactContext.applicationContext)) {
      promise.reject("E_WRITE_SETTINGS_DENIED", "WRITE_SETTINGS not granted")
      return
    }
    try {
      Settings.System.putFloat(
        reactContext.applicationContext.contentResolver,
        Settings.System.FONT_SCALE,
        scale
      )
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_FONT_SCALE", t.message, t)
    }
  }

  /**
   * Checks whether the WRITE_SETTINGS AppOp is granted.
   * If not, opens ACTION_MANAGE_WRITE_SETTINGS for this package so the user can
   * enable "Modify system settings" in one tap.
   * Resolves true if already granted, false after opening the settings page.
   */
  @ReactMethod
  fun checkWriteSettings(promise: Promise) {
    val ctx = reactContext.applicationContext
    val canWrite = Settings.System.canWrite(ctx)
    if (!canWrite) {
      try {
        val intent = Intent(
          Settings.ACTION_MANAGE_WRITE_SETTINGS,
          Uri.parse("package:${ctx.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
      } catch (ignored: Throwable) {}
    }
    promise.resolve(canWrite)
  }

  // ── Do Not Disturb ───────────────────────────────────────────────────────

  /**
   * Set DND interruption filter.
   * Resolves "ok" on success, "need_permission" if ACCESS_NOTIFICATION_POLICY
   * has not been granted (and opens the settings page automatically).
   */
  @ReactMethod
  fun setDoNotDisturb(enabled: Boolean, promise: Promise) {
    try {
      val nm = reactContext.applicationContext
        .getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      if (!nm.isNotificationPolicyAccessGranted) {
        Log.w(TAG, "[DND] Notification policy access not granted — opening settings")
        val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.applicationContext.startActivity(intent)
        promise.resolve("need_permission")
        return
      }
      val filter = if (enabled)
        android.app.NotificationManager.INTERRUPTION_FILTER_NONE
      else
        android.app.NotificationManager.INTERRUPTION_FILTER_ALL
      nm.setInterruptionFilter(filter)
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_DND", t.message, t)
    }
  }

  /** Opens a special app access settings page for the given type. */
  @ReactMethod
  fun openSpecialAccess(type: String, promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      val intent: Intent = when (type) {
        "dnd" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        "notification_listener" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        "all_files" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          try {
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
              Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          } catch (e: Throwable) {
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        "write_settings" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
          Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_SPECIAL_ACCESS", t.message, t)
    }
  }

  // ── Notification icon scan (WiFi sort fix) ────────────────────────────────

  /**
   * Returns a list of SMS conversation threads.
   * Each item: { threadId, address, snippet, msgCount, date }
   */
  @ReactMethod
  fun getSmsConversations(promise: Promise) {
    try {
      val cr = reactContext.applicationContext.contentResolver
      val uri = Telephony.Sms.CONTENT_URI
      val cursor = cr.query(
        uri,
        arrayOf(Telephony.Sms.THREAD_ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE),
        null, null,
        "${Telephony.Sms.THREAD_ID} ASC, ${Telephony.Sms.DATE} DESC"
      )

      val threads = linkedMapOf<String, WritableMap>()
      cursor?.use { c ->
        val tidIdx = c.getColumnIndex(Telephony.Sms.THREAD_ID)
        val addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS)
        val bodyIdx = c.getColumnIndex(Telephony.Sms.BODY)
        val dateIdx = c.getColumnIndex(Telephony.Sms.DATE)
        val typeIdx = c.getColumnIndex(Telephony.Sms.TYPE)
        while (c.moveToNext()) {
          val tid = c.getString(tidIdx) ?: continue
          if (!threads.containsKey(tid)) {
            val map = Arguments.createMap().apply {
              putString("threadId", tid)
              putString("address", c.getString(addrIdx) ?: "")
              putString("snippet", c.getString(bodyIdx) ?: "")
              putDouble("date", c.getLong(dateIdx).toDouble())
              putInt("msgCount", 1)
            }
            threads[tid] = map
          }
        }
      }

      val arr = Arguments.createArray()
      threads.values.forEach { arr.pushMap(it) }
      promise.resolve(arr)
    } catch (t: Throwable) {
      promise.reject("E_SMS_CONV", t.message, t)
    }
  }

  /**
   * Returns SMS messages for a given threadId.
   * Each item: { id, address, body, date, type, read }
   */
  @ReactMethod
  fun getSmsMessages(threadId: String, promise: Promise) {
    try {
      val cr = reactContext.applicationContext.contentResolver
      val uri = Telephony.Sms.CONTENT_URI
      val cursor = cr.query(
        uri,
        arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY,
          Telephony.Sms.DATE, Telephony.Sms.TYPE, Telephony.Sms.READ),
        "${Telephony.Sms.THREAD_ID} = ?",
        arrayOf(threadId),
        "${Telephony.Sms.DATE} ASC"
      )

      val arr = Arguments.createArray()
      cursor?.use { c ->
        val idIdx = c.getColumnIndex(Telephony.Sms._ID)
        val addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS)
        val bodyIdx = c.getColumnIndex(Telephony.Sms.BODY)
        val dateIdx = c.getColumnIndex(Telephony.Sms.DATE)
        val typeIdx = c.getColumnIndex(Telephony.Sms.TYPE)
        val readIdx = c.getColumnIndex(Telephony.Sms.READ)
        while (c.moveToNext()) {
          arr.pushMap(Arguments.createMap().apply {
            putString("id", c.getString(idIdx))
            putString("address", c.getString(addrIdx) ?: "")
            putString("body", c.getString(bodyIdx) ?: "")
            putDouble("date", c.getLong(dateIdx).toDouble())
            putInt("type", c.getInt(typeIdx))
            putInt("read", c.getInt(readIdx))
          })
        }
      }

      promise.resolve(arr)
    } catch (t: Throwable) {
      promise.reject("E_SMS_MSGS", t.message, t)
    }
  }

  /**
   * Sends an SMS to the given address.
   */
  @ReactMethod
  fun sendSms(address: String, body: String, promise: Promise) {
    try {
      @Suppress("DEPRECATION")
      val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        reactContext.applicationContext.getSystemService(SmsManager::class.java)
          ?: SmsManager.getDefault()
      } else {
        SmsManager.getDefault()
      }
      if (body.length > 160) {
        val parts = smsManager.divideMessage(body)
        smsManager.sendMultipartTextMessage(address, null, parts, null, null)
      } else {
        smsManager.sendTextMessage(address, null, body, null, null)
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_SMS_SEND", t.message, t)
    }
  }

  /**
   * Requests presenceOS to be set as the default SMS app via RoleManager (API 29+).
   */
  @ReactMethod
  fun requestSmsRole(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = reactContext.applicationContext.getSystemService(RoleManager::class.java)
        if (roleManager == null) { promise.reject("E_SMS_ROLE", "RoleManager unavailable"); return }
        if (roleManager.isRoleAvailable(RoleManager.ROLE_SMS)) {
          val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_SMS)
          reactContext.currentActivity?.startActivityForResult(intent, 9002)
          promise.resolve(true)
        } else {
          promise.reject("E_SMS_ROLE", "SMS role not available", null)
        }
      } else {
        promise.reject("E_SMS_ROLE", "Requires Android 10+", null)
      }
    } catch (t: Throwable) {
      promise.reject("E_SMS_ROLE", t.message, t)
    }
  }

  /**
   * Looks up a display name for a phone number via ContactsContract.
   * Returns null / empty string if no contact matches.
   */
  @ReactMethod
  fun getContactForNumber(number: String, promise: Promise) {
    try {
      val cr = reactContext.applicationContext.contentResolver
      val uri = android.net.Uri.withAppendedPath(
        ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
        android.net.Uri.encode(number)
      )
      val cursor = cr.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)
      var name: String? = null
      cursor?.use { c ->
        if (c.moveToFirst()) {
          name = c.getString(c.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME))
        }
      }
      promise.resolve(name ?: "")
    } catch (t: Throwable) {
      promise.reject("E_CONTACT_LOOKUP", t.message, t)
    }
  }

  /**
   * Search contacts by name or number prefix. Returns up to 10 results as
   * [{ name, number }] sorted by display name.
   */
  @ReactMethod
  fun searchContacts(query: String, promise: Promise) {
    try {
      val arr = Arguments.createArray()
      if (query.isBlank()) { promise.resolve(arr); return }
      val cr = reactContext.applicationContext.contentResolver
      val q = "%$query%"
      val cursor = cr.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER,
        ),
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ? OR ${ContactsContract.CommonDataKinds.Phone.NUMBER} LIKE ?",
        arrayOf(q, q),
        "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
      )
      val seen = mutableSetOf<String>()
      cursor?.use { c ->
        val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        while (c.moveToNext() && seen.size < 10) {
          val name = c.getString(nameIdx)?.takeIf { it.isNotBlank() } ?: continue
          val number = c.getString(numIdx)?.replace("\\s".toRegex(), "") ?: continue
          if (seen.add(number)) {
            val m = Arguments.createMap()
            m.putString("name", name)
            m.putString("number", number)
            arr.pushMap(m)
          }
        }
      }
      promise.resolve(arr)
    } catch (t: Throwable) {
      promise.resolve(Arguments.createArray())
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    // No pending activity results at this time.
  }

  // ── Music foreground service ───────────────────────────────────────────────
  // Starts/stops MusicPlaybackService so Android keeps the audio process alive
  // when the app is in the background.

  @ReactMethod
  fun startMusicForeground(title: String, artist: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, MusicPlaybackService::class.java).apply {
        putExtra("title", title)
        putExtra("artist", artist)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.applicationContext.startForegroundService(intent)
      } else {
        reactContext.applicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_FG_START", t.message, t)
    }
  }

  @ReactMethod
  fun stopMusicForeground(promise: Promise) {
    try {
      reactContext.applicationContext.stopService(
        Intent(reactContext, MusicPlaybackService::class.java)
      )
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_FG_STOP", t.message, t)
    }
  }

  // ── Default app choosers ─────────────────────────────────────────

  /** Opens system dialog to choose the default phone/dialer app. */
  @ReactMethod
  fun openDefaultDialerChooser(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = ctx.getSystemService(RoleManager::class.java)
        if (roleManager != null) {
          val roleIntent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
          val activity = reactContext.currentActivity
          if (activity != null) {
            activity.startActivityForResult(roleIntent, 9901)
            promise.resolve(true)
            return
          }
        }
      }
      // Fallback: open system default dialer chooser via TelecomManager
      val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).apply {
        putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, ctx.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_DIALER", t.message, t)
    }
  }

  /** Opens system home screen / launcher chooser settings. */
  @ReactMethod
  fun openDefaultHomeChooser(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_HOME_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.applicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_HOME", t.message, t)
    }
  }

  /** Opens system dialog to choose the default browser app. */
  @ReactMethod
  fun openDefaultBrowserChooser(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = ctx.getSystemService(RoleManager::class.java)
        if (roleManager != null) {
          val roleIntent = roleManager.createRequestRoleIntent(RoleManager.ROLE_BROWSER)
          val activity = reactContext.currentActivity
          if (activity != null) {
            activity.startActivityForResult(roleIntent, 9902)
            promise.resolve(true)
            return
          }
        }
      }
      // Fallback: open manage default apps settings
      val intent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_BROWSER", t.message, t)
    }
  }

  // ── Torch ─────────────────────────────────────────────────────

  @ReactMethod
  fun setTorchEnabled(enabled: Boolean, promise: Promise) {
    try {
      val cameraManager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val cameraId = cameraManager.cameraIdList.firstOrNull()
        ?: throw Exception("No camera found")
      cameraManager.setTorchMode(cameraId, enabled)
      promise.resolve("ok")
    } catch (t: Throwable) {
      promise.reject("E_TORCH", t.message, t)
    }
  }

  // ── Storage (Files) ───────────────────────────────────────────────────

  /**
   * Checks whether the app has All Files Access (MANAGE_EXTERNAL_STORAGE).
   * Required on Android 11+ to list arbitrary directories under
   * /storage/emulated/0. For Android ≤10 we fall back to the legacy
   * READ_EXTERNAL_STORAGE permission.
   */
  @ReactMethod
  fun hasManageStoragePermission(promise: Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        // Pre-R: presence of READ_EXTERNAL_STORAGE is implied by install,
        // assume true and let file ops fail gracefully if revoked.
        true
      }
      promise.resolve(ok)
    } catch (t: Throwable) {
      promise.reject("E_STORAGE_CHECK", t.message, t)
    }
  }

  /**
   * Launches the system UI for granting All Files Access. Returns once the
   * system Settings activity has been started — the user must grant manually
   * and the JS side should re-check `hasManageStoragePermission` when the
   * app resumes.
   */
  @ReactMethod
  fun requestManageStoragePermission(promise: Promise) {
    try {
      val ctx = reactContext.applicationContext
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
          data = Uri.parse("package:${ctx.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${ctx.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      }
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.reject("E_STORAGE_REQ", t.message, t)
    }
  }

  /**
   * Lists the contents of `path`. Returns an array of
   *   { name, isDir, size, modTime }
   * where size is bytes (0 for directories) and modTime is epoch-ms.
   *
   * Hidden entries (dotfiles) are excluded. Unreadable entries are skipped
   * silently rather than failing the whole listing. Special-cases `path` ==
   * null or empty to mean "primary external storage root".
   */
  @ReactMethod
  fun listDirectory(path: String?, promise: Promise) {
    try {
      val dir = if (path.isNullOrBlank()) {
        Environment.getExternalStorageDirectory()
      } else {
        File(path)
      }
      if (!dir.exists()) {
        promise.reject("E_ENOENT", "Directory does not exist: ${dir.absolutePath}")
        return
      }
      if (!dir.isDirectory) {
        promise.reject("E_ENOTDIR", "Not a directory: ${dir.absolutePath}")
        return
      }
      val entries = dir.listFiles() ?: emptyArray<File>()
      val result: WritableArray = Arguments.createArray()
      for (f in entries) {
        if (f.name.startsWith(".")) continue  // hide dotfiles
        try {
          val entry: WritableMap = Arguments.createMap().apply {
            putString("name", f.name)
            putBoolean("isDir", f.isDirectory)
            putDouble("size", if (f.isDirectory) 0.0 else f.length().toDouble())
            putDouble("modTime", f.lastModified().toDouble())
          }
          result.pushMap(entry)
        } catch (_: SecurityException) {
          // Skip entries we can't stat — don't fail the whole listing.
        }
      }
      promise.resolve(result)
    } catch (t: Throwable) {
      promise.reject("E_LIST", t.message, t)
    }
  }

  // ── Default dialer ────────────────────────────────────────────────────

  /**
   * Returns the package name currently registered as the system default
   * phone app, or null if none is set (rare). Used by the phone screen to
   * gate the "Set as default dialer" prompt.
   */
  @ReactMethod
  fun getDefaultDialerPackage(promise: Promise) {
    try {
      val tm = reactContext.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      val pkg = tm?.defaultDialerPackage
      if (pkg.isNullOrBlank()) promise.resolve(null) else promise.resolve(pkg)
    } catch (t: Throwable) {
      promise.reject("E_DIALER_PKG", t.message, t)
    }
  }

  // ── Network stats ─────────────────────────────────────────────────────

  /**
   * Returns cumulative network byte totals since boot and the per-second
   * throughput measured against the previous call. First call returns
   * throughputBps = 0 since there's no delta yet.
   *
   *   {
   *     rxBytes, txBytes, totalBytes,   // cumulative since boot
   *     throughputBps,                  // bytes/sec since last call
   *     formatted: { rx, tx, total, rate }  // human-readable strings
   *   }
   */
  @ReactMethod
  fun getNetworkStats(promise: Promise) {
    try {
      val rx = TrafficStats.getTotalRxBytes()
      val tx = TrafficStats.getTotalTxBytes()
      val total = if (rx == TrafficStats.UNSUPPORTED.toLong() ||
                      tx == TrafficStats.UNSUPPORTED.toLong()) 0L
                  else (rx + tx)
      val delta = if (lastNetTotal == 0L) 0L else (total - lastNetTotal).coerceAtLeast(0L)
      lastNetTotal = total

      val result: WritableMap = Arguments.createMap().apply {
        putDouble("rxBytes", rx.toDouble())
        putDouble("txBytes", tx.toDouble())
        putDouble("totalBytes", total.toDouble())
        putDouble("throughputBps", delta.toDouble())
        val fmt: WritableMap = Arguments.createMap().apply {
          putString("rx",    formatBytes(rx))
          putString("tx",    formatBytes(tx))
          putString("total", formatBytes(total))
          putString("rate",  formatBytes(delta) + "/s")
        }
        putMap("formatted", fmt)
      }
      promise.resolve(result)
    } catch (t: Throwable) {
      promise.reject("E_NETSTATS", t.message, t)
    }
  }

  /** Human-readable byte formatter — used by getNetworkStats. */
  private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unitIdx = 0
    while (value >= 1024.0 && unitIdx < units.size - 1) {
      value /= 1024.0
      unitIdx++
    }
    return if (unitIdx == 0) "${bytes} B"
           else String.format("%.1f %s", value, units[unitIdx])
  }

  @ReactMethod
  fun createDirectory(path: String, promise: Promise) {
    try {
      val dir = java.io.File(path)
      if (dir.exists()) { promise.resolve("exists"); return }
      val ok = dir.mkdirs()
      if (ok) promise.resolve("created")
      else promise.reject("E_MKDIR", "Failed to create directory: $path")
    } catch (t: Throwable) {
      promise.reject("E_MKDIR", t.message, t)
    }
  }

  @ReactMethod
  fun deleteFile(path: String, promise: Promise) {
    try {
      val f = java.io.File(path)
      if (!f.exists()) { promise.resolve("not_found"); return }
      val ok = if (f.isDirectory) f.deleteRecursively() else f.delete()
      if (ok) promise.resolve("deleted")
      else promise.reject("E_DELETE", "Failed to delete: $path")
    } catch (t: Throwable) {
      promise.reject("E_DELETE", t.message, t)
    }
  }

  override fun onNewIntent(intent: Intent) {
    // no-op
  }
}
