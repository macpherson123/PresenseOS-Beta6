package com.presenceoslite

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

/**
 * Receiver that allows presenceOS to act as a device administrator.
 *
 * The only policy we request is LOCK_NOW (declared in
 * res/xml/device_admin_policies.xml). This lets the Lock quick-toggle in
 * the home screen call DevicePolicyManager.lockNow() to turn the screen off.
 *
 * Registered in AndroidManifest.xml as:
 *   <receiver android:name=".PresenceAdminReceiver"
 *             android:exported="true"
 *             android:permission="android.permission.BIND_DEVICE_ADMIN">
 *     <meta-data android:name="android.app.device_admin"
 *                android:resource="@xml/device_admin_policies"/>
 *     <intent-filter>
 *       <action android:name="android.app.action.DEVICE_ADMIN_ENABLED"/>
 *     </intent-filter>
 *   </receiver>
 */
class PresenceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "PresenceAdmin"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device admin enabled")
        // Silent — the user just granted this, no need for a toast
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "Device admin disabled")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        // Shown when the user tries to remove presenceOS as a device admin.
        // Keeps the warning concise and honest — we only use this for lockNow().
        return "Disabling will prevent presenceOS from locking the screen from the home launcher."
    }
}
