#!/usr/bin/env bash
# ============================================================
# install_as_privapp.sh
# Installs PresenceOS as a privileged system app.
#
# Requirements:
#   - Android device connected via USB with USB debugging ON
#   - Device must be rooted (adb root must succeed)
#   - Build the APK first via EAS: eas build -p android --profile development
#   - Set APK_PATH below to the downloaded .apk file path
# ============================================================

set -e

APK_PATH="${1:-}"   # pass as first argument, e.g.: ./install_as_privapp.sh ~/Downloads/presenceos.apk
PACKAGE="com.presenceoslite"
PRIV_DIR="/system/priv-app/PresenceOS"
PERMS_FILE="android/privapp-permissions-com.presenceoslite.xml"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PresenceOS priv-app installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$APK_PATH" ]; then
  echo "Usage: $0 /path/to/presenceos.apk"
  echo ""
  echo "Download the APK from:"
  echo "  https://expo.dev/accounts/macpherson123/projects/presenceos-pilot/builds"
  exit 1
fi

if [ ! -f "$APK_PATH" ]; then
  echo "ERROR: APK not found: $APK_PATH"
  exit 1
fi

echo ""
echo "1/6  Obtaining root access..."
adb root
sleep 2

echo "2/6  Remounting /system as read-write..."
adb remount || {
  echo "  adb remount failed — trying manual method..."
  adb shell "mount -o rw,remount /system" || \
  adb shell "mount -o rw,remount /" || true
}
sleep 1

echo "3/6  Removing old install from /system/app (if present)..."
adb shell "rm -rf /system/app/PresenceOS 2>/dev/null || true"

echo "4/6  Installing APK to /system/priv-app/PresenceOS/..."
adb shell "mkdir -p $PRIV_DIR"
adb push "$APK_PATH" "$PRIV_DIR/PresenceOS.apk"
adb shell "chmod 644 $PRIV_DIR/PresenceOS.apk"
adb shell "chown root:root $PRIV_DIR/PresenceOS.apk"

echo "5/6  Pushing priv-app permissions whitelist..."
adb push "$PERMS_FILE" "/system/etc/permissions/privapp-permissions-${PACKAGE}.xml"
adb shell "chmod 644 /system/etc/permissions/privapp-permissions-${PACKAGE}.xml"
adb shell "chown root:root /system/etc/permissions/privapp-permissions-${PACKAGE}.xml"

echo "6/6  Rebooting device..."
adb reboot

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! Device is rebooting."
echo ""
echo "  After reboot, ALL toggles in PresenceOS should"
echo "  work directly without opening system settings:"
echo "    ✓ Mobile Data"
echo "    ✓ NFC"
echo "    ✓ Location"
echo "    ✓ Hotspot"
echo "    ✓ WiFi"
echo "    ✓ Bluetooth"
echo "    ✓ Brightness / Timeout / Font size"
echo "    ✓ Do Not Disturb"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
