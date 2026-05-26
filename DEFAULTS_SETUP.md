# PresenceOS — Default App Setup Guide

## What this does

Makes Android actually offer PresenceOS as a candidate for:
- 🏠 Default **Home / Launcher**
- 🌐 Default **Browser** (http/https links)
- 📞 Default **Phone / Dialer** (tel: links, incoming calls)
- 💬 Default **SMS app** (incoming & outgoing SMS/MMS)

## Why it requires more than just app.json

Android's Role system (Android 10+) validates the manifest before showing an
app in "Choose default" dialogs. For SMS especially, it requires:

| What | Why | How |
|------|-----|-----|
| `android.provider.Telephony.SMS_DELIVER` BroadcastReceiver | Android sends incoming SMS here when we're default | `PresenceSmsReceiver.kt` |
| `android.provider.Telephony.WAP_PUSH_DELIVER` BroadcastReceiver | Android sends incoming MMS here | `PresenceMmsReceiver.kt` |
| `RESPOND_VIA_MESSAGE` intent filter | "Reply" from notification requires this | Added via plugin |
| `android.intent.action.ANSWER` | Dialer role eligibility | Added via plugin |
| `voicemail` scheme VIEW filter | Dialer role eligibility | Added via plugin |

**The Expo config plugin (`plugins/withDefaultApps.js`) injects all of this
automatically into your AndroidManifest.xml at build time.**

---

## Step 1 — After `expo prebuild`, copy the Kotlin stubs

```bash
# Run prebuild first (generates android/ folder)
npx expo prebuild --platform android --clean

# Copy the receiver stubs
cp plugins/stubs/PresenceSmsReceiver.kt \
   android/app/src/main/java/com/presenceoslite/PresenceSmsReceiver.kt

cp plugins/stubs/PresenceMmsReceiver.kt \
   android/app/src/main/java/com/presenceoslite/PresenceMmsReceiver.kt
```

Or automate it — add to your build script before `eas build`:
```bash
#!/bin/bash
rm -rf android/
npm install --legacy-peer-deps
npx expo prebuild --platform android --clean
cp plugins/stubs/*.kt android/app/src/main/java/com/presenceoslite/
eas build --platform android --profile development --local
```

## Step 2 — Verify the manifest was generated correctly

```bash
grep -A5 "PresenceSmsReceiver" android/app/src/main/AndroidManifest.xml
grep -A5 "SMS_DELIVER" android/app/src/main/AndroidManifest.xml
grep -A5 "RESPOND_VIA_MESSAGE" android/app/src/main/AndroidManifest.xml
grep -A5 "CATEGORY_HOME" android/app/src/main/AndroidManifest.xml
```

Expected output for SMS:
```xml
<receiver android:name="com.presenceoslite.PresenceSmsReceiver"
          android:exported="true"
          android:permission="android.permission.BROADCAST_SMS">
  <intent-filter android:priority="999">
    <action android:name="android.provider.Telephony.SMS_DELIVER"/>
  </intent-filter>
</receiver>
```

## Step 3 — Install and set defaults on device

### Home / Launcher
Android will prompt "Which app would you like to use as your home?" the first
time you press the home button after install. Select PresenceOS → Always.

If it doesn't prompt:
```
Settings → Apps → Default apps → Home app → PresenceOS
```

### SMS
```
Settings → Apps → Default apps → SMS app → PresenceOS
```
Or from within PresenceOS: Settings → Apps & Permissions → Default Apps → Default SMS App

### Phone / Dialer
```
Settings → Apps → Default apps → Phone app → PresenceOS
```

### Browser
```
Settings → Apps → Default apps → Browser app → PresenceOS
```

---

## How the Settings screen triggers these

The Settings → Apps & Permissions → DEFAULT APPS section calls:
- **Phone/Dialer**: `PresenceDeviceControl.openDefaultDialerChooser()` → opens system dialer chooser
- **Launcher**: `PresenceDeviceControl.openDefaultHomeChooser()` → opens home chooser
- **Browser**: `PresenceDeviceControl.openDefaultBrowserChooser()` → opens browser chooser
- **SMS**: `PresenceDeviceControl.requestSmsRole()` → uses RoleManager API (Android 10+)

If the native module isn't available, it falls back to `Linking.openSettings()`.

---

## Persistence

Once the user selects PresenceOS as the default via the system dialog:
- Android stores this in its own package manager database
- It persists across app restarts, reboots, and OS updates
- It is only cleared if: user manually changes it, or the app is uninstalled

The RoleManager API (SMS, Dialer) is more persistent than the legacy
`PackageManager.setDefaultPreferredActivity` — it requires explicit user
confirmation to remove.

---

## Troubleshooting

**"PresenceOS doesn't appear in the default app list"**
→ The manifest is missing a required filter. Run Step 2 verification above.
→ For SMS: confirm both BroadcastReceiver entries exist in the manifest.

**"Android keeps reverting to the old default"**
→ This usually means another app is declaring the same role with higher priority.
→ Check `android:priority` in intent filters — ours is set to 999.

**"SMS role prompt doesn't appear"**
→ The app must have `READ_SMS`, `RECEIVE_SMS`, `SEND_SMS`, `RECEIVE_MMS`,
  `RECEIVE_WAP_PUSH` permissions granted before the SMS role prompt appears.
