package com.presenceoslite

import android.content.Context
import android.net.TrafficStats
import android.os.Build
import android.content.pm.PackageManager
import com.facebook.react.bridge.*
import java.io.DataOutputStream
import java.io.File

/**
 * PresenceSystemModule
 *
 * Implements the native methods that settings.tsx and home.tsx call but that
 * weren't wired in the original PresenceDeviceControlModule:
 *
 *   getNetworkStats()     → { rx, tx, connections, idle }
 *   getNodeVersion()      → "v20.x.x" or "—"
 *   getPackageInfo()      → { appSize: "12.4 MB", versionName, versionCode }
 *   setScreenTimeout(ms)  → sets screen_off_timeout via root shell
 *   toggleAdb(enable)     → sets adb_enabled via root shell
 *   toggleWirelessAdb(en) → sets adb_wifi_enabled via root shell
 *
 * Register in MainApplication.kt:
 *   packages.add(PresenceSystemPackage())
 */
class PresenceSystemModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PresenceSystem"

    // Track previous TrafficStats readings to calculate rate
    private var lastRxBytes = 0L
    private var lastTxBytes = 0L
    private var lastStatsTime = 0L

    @ReactMethod
    fun getNetworkStats(promise: Promise) {
        Thread {
            try {
                val uid = android.os.Process.myUid()
                val rxBytes = TrafficStats.getUidRxBytes(uid)
                val txBytes = TrafficStats.getUidTxBytes(uid)
                val now = System.currentTimeMillis()

                val result = Arguments.createMap()

                if (lastStatsTime == 0L || now - lastStatsTime < 500) {
                    // First call or too soon — return last known
                    result.putString("rx", if (lastRxBytes == 0L) "0 B/s" else formatRate(lastRxBytes))
                    result.putString("tx", if (lastTxBytes == 0L) "0 B/s" else formatRate(lastTxBytes))
                    result.putBoolean("idle", true)
                    result.putInt("connections", 0)
                } else {
                    val elapsed = (now - lastStatsTime).toFloat() / 1000f
                    val rxRate = ((rxBytes - lastRxBytes) / elapsed).toLong().coerceAtLeast(0)
                    val txRate = ((txBytes - lastTxBytes) / elapsed).toLong().coerceAtLeast(0)

                    result.putString("rx", formatRate(rxRate))
                    result.putString("tx", formatRate(txRate))
                    result.putBoolean("idle", rxRate < 1024 && txRate < 1024)
                    // Approximate active connections from /proc/net/tcp count
                    val conns = countTcpConnections()
                    result.putInt("connections", conns)
                }

                lastRxBytes = rxBytes
                lastTxBytes = txBytes
                lastStatsTime = now

                promise.resolve(result)
            } catch (e: Exception) {
                val err = Arguments.createMap()
                err.putString("rx", "—")
                err.putString("tx", "—")
                err.putBoolean("idle", true)
                err.putInt("connections", 0)
                promise.resolve(err)
            }
        }.start()
    }

    private fun formatRate(bytesPerSec: Long): String {
        return when {
            bytesPerSec < 0         -> "0 B/s"
            bytesPerSec < 1024      -> "${bytesPerSec} B/s"
            bytesPerSec < 1024*1024 -> "${"%.1f".format(bytesPerSec/1024.0)} KB/s"
            else                    -> "${"%.1f".format(bytesPerSec/(1024.0*1024.0))} MB/s"
        }
    }

    private fun countTcpConnections(): Int {
        return try {
            val tcp  = File("/proc/net/tcp").readLines().filter { it.trim().startsWith("").not() }.size - 1
            val tcp6 = File("/proc/net/tcp6").readLines().size - 1
            (tcp + tcp6).coerceAtLeast(0)
        } catch (e: Exception) { 0 }
    }

    @ReactMethod
    fun getNodeVersion(promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec(arrayOf("node", "--version"))
                val output  = process.inputStream.bufferedReader().readText().trim()
                process.waitFor()
                promise.resolve(output.ifBlank { "—" })
            } catch (e: Exception) {
                // Try via root in case node is in /usr/local/bin
                try {
                    val p = Runtime.getRuntime().exec("su")
                    val os = DataOutputStream(p.outputStream)
                    os.writeBytes("node --version\n")
                    os.writeBytes("exit\n")
                    os.flush()
                    val out = p.inputStream.bufferedReader().readText().trim()
                    p.waitFor()
                    promise.resolve(out.ifBlank { "—" })
                } catch (e2: Exception) {
                    promise.resolve("—")
                }
            }
        }.start()
    }

    @ReactMethod
    fun getPackageInfo(promise: Promise) {
        Thread {
            try {
                val ctx = reactApplicationContext
                val pm  = ctx.packageManager
                val pi  = if (Build.VERSION.SDK_INT >= 33) {
                    pm.getPackageInfo(ctx.packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    pm.getPackageInfo(ctx.packageName, 0)
                }

                // Measure installed APK size
                val apkFile = File(pi.applicationInfo?.sourceDir)
                val apkSize = apkFile.length()
                val fmt = when {
                    apkSize < 1024 * 1024       -> "${"%.1f".format(apkSize/1024.0)} KB"
                    apkSize < 1024 * 1024 * 1024 -> "${"%.1f".format(apkSize/(1024.0*1024.0))} MB"
                    else                         -> "${"%.1f".format(apkSize/(1024.0*1024.0*1024.0))} GB"
                }

                val result = Arguments.createMap()
                result.putString("appSize", fmt)
                result.putString("versionName", pi.versionName ?: "—")
                result.putInt("versionCode", if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode.toInt() else @Suppress("DEPRECATION") pi.versionCode)
                promise.resolve(result)
            } catch (e: Exception) {
                val err = Arguments.createMap()
                err.putString("appSize", "—")
                err.putString("versionName", "—")
                err.putInt("versionCode", 0)
                promise.resolve(err)
            }
        }.start()
    }

    /**
     * Set screen timeout via root settings shell.
     * Falls back to Settings.System if root is unavailable.
     */
    @ReactMethod
    fun setScreenTimeout(ms: Int, promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("settings put system screen_off_timeout $ms\n")
                os.writeBytes("exit\n")
                os.flush()
                process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                promise.resolve(exitCode == 0)
            } catch (e: Exception) {
                // Non-root fallback via ContentResolver (requires WRITE_SETTINGS granted)
                try {
                    android.provider.Settings.System.putInt(
                        reactApplicationContext.contentResolver,
                        android.provider.Settings.System.SCREEN_OFF_TIMEOUT,
                        ms
                    )
                    promise.resolve(true)
                } catch (e2: Exception) {
                    promise.reject("TIMEOUT_ERROR", "Root required: ${e2.message}")
                }
            }
        }.start()
    }

    @ReactMethod
    fun toggleAdb(enable: Boolean, promise: Promise) {
        Thread {
            try {
                val value = if (enable) "1" else "0"
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("settings put global adb_enabled $value\n")
                os.writeBytes("exit\n")
                os.flush()
                process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                promise.resolve(exitCode == 0)
            } catch (e: Exception) {
                promise.reject("ADB_ERROR", e.message ?: "Failed to toggle ADB")
            }
        }.start()
    }

    /**
     * Native vibrate fallback. Hits the platform Vibrator directly, then the
     * VibratorManager on API 31+. Useful when expo-haptics can't reach the
     * service (cut-down ROMs / no systemui).
     */
    @ReactMethod
    fun vibrate(durationMs: Int, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val ms = durationMs.coerceIn(1, 1000).toLong()
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                val vm = ctx.getSystemService(android.os.VibratorManager::class.java)
                val v = vm?.defaultVibrator
                v?.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    v?.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    v?.vibrate(ms)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            // Last-ditch root: poke the kernel sysfs node directly
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("echo ${durationMs.coerceIn(1, 1000)} > /sys/class/timed_output/vibrator/enable 2>/dev/null || cmd vibrator_manager vibrate -f oneshot ${durationMs.coerceIn(1, 1000)}\n")
                os.writeBytes("exit\n")
                os.flush()
                process.waitFor()
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("VIBRATE_ERROR", e2.message ?: "Vibrate failed")
            }
        }
    }

    /**
     * Force the screen off via root. The keyguard then routes wake-up to
     * PresenceOS' PIN overlay (lockApp() should be called from JS first).
     */
    @ReactMethod
    fun goToSleep(promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("input keyevent 26\n")  // KEYCODE_POWER
                os.writeBytes("exit\n")
                os.flush()
                process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                promise.resolve(exitCode == 0)
            } catch (e: Exception) {
                promise.reject("SLEEP_ERROR", e.message ?: "Failed to sleep")
            }
        }.start()
    }

    @ReactMethod
    fun toggleWirelessAdb(enable: Boolean, promise: Promise) {
        Thread {
            try {
                val value = if (enable) "1" else "0"
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                // Enable wireless debugging (ADB over Wi-Fi)
                os.writeBytes("settings put global adb_wifi_enabled $value\n")
                if (enable) {
                    // Also restart adbd to pick up the new setting
                    os.writeBytes("setprop persist.adb.tcp.port 5555\n")
                    os.writeBytes("stop adbd && start adbd\n")
                }
                os.writeBytes("exit\n")
                os.flush()
                process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                promise.resolve(exitCode == 0)
            } catch (e: Exception) {
                promise.reject("WIRELESS_ADB_ERROR", e.message ?: "Failed")
            }
        }.start()
    }
}
