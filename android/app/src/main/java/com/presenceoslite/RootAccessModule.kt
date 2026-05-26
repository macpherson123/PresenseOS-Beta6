package com.presenceoslite

import com.facebook.react.bridge.*
import java.io.DataOutputStream
import java.io.IOException

/**
 * RootAccessModule — Magisk-compatible root bridge
 *
 * Uses the DataOutputStream pattern to keep a persistent su shell open.
 * This is the approach that correctly triggers the Magisk grant dialog
 * because the shell stays alive long enough for Magisk to intercept it.
 *
 * Runtime.exec(arrayOf("su", "-c", "...")) fails silently on Magisk because
 * the process exits before Magisk's zygote hook can prompt the user.
 *
 * Register in MainApplication.kt:
 *   packages.add(RootAccessPackage())
 */
class RootAccessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RootAccess"

    @ReactMethod
    fun checkRoot(promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("id\n")
                os.writeBytes("exit\n")
                os.flush()
                val output = process.inputStream.bufferedReader().readText().trim()
                val exitCode = process.waitFor()
                when {
                    exitCode == 0 && output.contains("uid=0") -> promise.resolve("granted")
                    exitCode == 0 -> promise.resolve("denied")
                    else -> {
                        // su binary not found or access denied
                        val suPaths = listOf(
                            "/system/xbin/su", "/system/bin/su",
                            "/sbin/su", "/su/bin/su", "/magisk/.core/bin/su"
                        )
                        if (suPaths.any { java.io.File(it).exists() }) {
                            promise.resolve("denied")
                        } else {
                            promise.resolve("not_rooted")
                        }
                    }
                }
            } catch (e: IOException) {
                promise.resolve("not_rooted")
            } catch (e: Exception) {
                promise.resolve("denied")
            }
        }.start()
    }

    @ReactMethod
    fun requestRoot(promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("echo presenceOS_root_ok\n")
                os.writeBytes("exit\n")
                os.flush()
                val output = process.inputStream.bufferedReader().readText().trim()
                process.waitFor()
                promise.resolve(output.contains("presenceOS_root_ok"))
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }.start()
    }

    /**
     * Execute a shell command as root via persistent su shell.
     * Returns stdout. Throws on non-zero exit or exception.
     */
    @ReactMethod
    fun execAsRoot(cmd: String, promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("$cmd\n")
                os.writeBytes("exit\n")
                os.flush()
                val stdout = process.inputStream.bufferedReader().readText().trim()
                val stderr = process.errorStream.bufferedReader().readText().trim()
                val exitCode = process.waitFor()
                if (exitCode == 0) {
                    promise.resolve(stdout)
                } else {
                    promise.reject("ROOT_EXEC_FAILED", "Exit $exitCode: $stderr")
                }
            } catch (e: Exception) {
                promise.reject("ROOT_EXEC_ERROR", e.message ?: "Unknown error")
            }
        }.start()
    }

    /**
     * Apply a system/global setting via root shell.
     * namespace: "system" | "global" | "secure"
     */
    @ReactMethod
    fun putSetting(namespace: String, key: String, value: String, promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                os.writeBytes("settings put $namespace $key $value\n")
                os.writeBytes("exit\n")
                os.flush()
                process.inputStream.bufferedReader().readText()
                val exitCode = process.waitFor()
                promise.resolve(exitCode == 0)
            } catch (e: Exception) {
                promise.reject("ROOT_SETTING_ERROR", e.message ?: "Failed")
            }
        }.start()
    }

    /**
     * Reboot the device. Requires root.
     */
    @ReactMethod
    fun reboot(reason: String, promise: Promise) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("su")
                val os = DataOutputStream(process.outputStream)
                val cmd = if (reason.isBlank()) "reboot" else "reboot $reason"
                os.writeBytes("$cmd\n")
                os.flush()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("REBOOT_ERROR", e.message ?: "Reboot failed")
            }
        }.start()
    }
}
