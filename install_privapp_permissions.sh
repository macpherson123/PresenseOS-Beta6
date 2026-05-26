#!/bin/bash
# install_privapp_permissions.sh
#
# Installs the presenceOS privileged-app permissions whitelist onto a real Android device.
# Required on Android 12+ (and all MTK Android 14 builds) for BLUETOOTH_PRIVILEGED,
# WRITE_SECURE_SETTINGS, TETHER_PRIVILEGED, MODIFY_PHONE_STATE etc. to actually
# be granted to /system/priv-app installs.
#
# Usage:
#   METHOD 1 — direct (root device, fastboot-unlocked):
#     adb root && bash install_privapp_permissions.sh
#
#   METHOD 2 — Magisk module (no unlock needed if Magisk already installed):
#     bash install_privapp_permissions.sh --magisk
#
#   After either method: reboot the device and test toggles.

set -e

PACKAGE="com.presenceoslite"
PERM_FILE="android/app/src/main/res/xml/privapp_permissions.xml"
DEST_FILENAME="privapp-permissions-${PACKAGE}.xml"
DEVICE_PATH="/system/etc/permissions/${DEST_FILENAME}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

if [ ! -f "$PERM_FILE" ]; then
  echo -e "${RED}✗ $PERM_FILE not found. Run from project root.${NC}"
  exit 1
fi

if [ "$1" == "--magisk" ]; then
  # ── Magisk overlay method ──────────────────────────────────────────────────
  echo -e "${YELLOW}Installing via Magisk module overlay...${NC}"
  MODULE_DIR="/data/adb/modules/presenceos_privapp"
  OVERLAY="${MODULE_DIR}/system/etc/permissions"

  adb shell "su -c 'mkdir -p ${OVERLAY}'"
  adb push "$PERM_FILE" /sdcard/tmp_privapp.xml
  adb shell "su -c 'cp /sdcard/tmp_privapp.xml ${OVERLAY}/${DEST_FILENAME}'"
  adb shell "su -c 'chmod 644 ${OVERLAY}/${DEST_FILENAME}'"
  adb shell "su -c 'rm /sdcard/tmp_privapp.xml'"

  # Write module meta files if not present
  adb shell "su -c '[ -f ${MODULE_DIR}/module.prop ] || echo -e \"id=presenceos_privapp\nname=presenceOS priv-app perms\nversion=v1\nversionCode=1\nauthor=presenceOS\ndescription=Whitelist for BLUETOOTH_PRIVILEGED etc.\" > ${MODULE_DIR}/module.prop'"

  echo -e "${GREEN}✓ Magisk overlay installed at ${OVERLAY}/${DEST_FILENAME}${NC}"
  echo -e "${YELLOW}⚡ Reboot required for Magisk to apply the overlay.${NC}"
  echo ""
  echo "  adb reboot"
else
  # ── Direct root method ─────────────────────────────────────────────────────
  echo -e "${YELLOW}Checking for root ADB...${NC}"
  if ! adb root 2>&1 | grep -q "restarting"; then
    # Already root or daemon already running as root
    sleep 1
  fi
  adb remount 2>/dev/null || true   # make /system writable (may need fastboot -w first)

  echo -e "${YELLOW}Pushing permissions whitelist to ${DEVICE_PATH}...${NC}"
  adb push "$PERM_FILE" "$DEVICE_PATH"
  adb shell "chmod 644 ${DEVICE_PATH}"

  echo -e "${GREEN}✓ Installed at ${DEVICE_PATH}${NC}"
  echo -e "${YELLOW}⚡ Reboot required for the platform to re-read permissions.${NC}"
  echo ""
  echo "  adb reboot"
fi

echo ""
echo -e "${GREEN}After reboot, verify permissions are granted:${NC}"
echo "  adb shell pm get-install-permissions ${PACKAGE}"
echo "  # Look for BLUETOOTH_PRIVILEGED, WRITE_SECURE_SETTINGS, TETHER_PRIVILEGED etc."
