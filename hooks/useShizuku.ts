/**
 * presenceOS — Shizuku Integration Utility
 *
 * Shizuku allows privileged binder calls without root by running a
 * background service with adb/root that apps can bind to.
 *
 * Setup steps (once per device):
 *   adb shell sh /storage/emulated/0/Android/data/moe.shizuku.privileged.api/start.sh
 *   OR install Shizuku from Play Store and start via wireless ADB.
 *
 * This hook:
 *   - Checks if Shizuku is available and running
 *   - Requests permission from the user
 *   - Exposes helper to run privileged commands via PresenceDeviceControl
 *
 * The native module (PresenceDeviceControl) must implement:
 *   checkShizukuAvailable() -> boolean
 *   requestShizukuPermission() -> boolean
 *   runShizukuCommand(cmd: string) -> string
 */

import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Alert, Platform } from 'react-native';

const { PresenceDeviceControl } = NativeModules;

export type ShizukuStatus = 'unavailable' | 'not_running' | 'no_permission' | 'ready';

export function useShizuku() {
  const [status, setStatus] = useState<ShizukuStatus>('unavailable');

  const check = useCallback(async () => {
    if (Platform.OS !== 'android' || !PresenceDeviceControl?.checkShizukuAvailable) {
      setStatus('unavailable');
      return 'unavailable' as ShizukuStatus;
    }
    try {
      const available = await PresenceDeviceControl.checkShizukuAvailable();
      if (!available) { setStatus('not_running'); return 'not_running' as ShizukuStatus; }
      const hasPermission = await PresenceDeviceControl.checkShizukuPermission?.();
      if (!hasPermission) { setStatus('no_permission'); return 'no_permission' as ShizukuStatus; }
      setStatus('ready');
      return 'ready' as ShizukuStatus;
    } catch {
      setStatus('unavailable');
      return 'unavailable' as ShizukuStatus;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!PresenceDeviceControl?.requestShizukuPermission) return false;
    try {
      const granted = await PresenceDeviceControl.requestShizukuPermission();
      if (granted) setStatus('ready');
      return granted;
    } catch { return false; }
  }, []);

  const runCommand = useCallback(async (cmd: string): Promise<string> => {
    if (status !== 'ready') {
      throw new Error('Shizuku not ready. Status: ' + status);
    }
    if (!PresenceDeviceControl?.runShizukuCommand) {
      throw new Error('runShizukuCommand not implemented in native module');
    }
    return PresenceDeviceControl.runShizukuCommand(cmd);
  }, [status]);

  // Privileged operations via Shizuku
  const setDefaultSmsApp = useCallback(async (packageName: string) => {
    return runCommand(`cmd role add-role-holder android.app.role.SMS ${packageName}`);
  }, [runCommand]);

  const grantPermission = useCallback(async (permission: string, packageName: string) => {
    return runCommand(`pm grant ${packageName} ${permission}`);
  }, [runCommand]);

  const setDefaultLauncher = useCallback(async (packageName: string) => {
    return runCommand(`cmd package set-home-activity ${packageName}/.MainActivity`);
  }, [runCommand]);

  const installSilent = useCallback(async (apkPath: string) => {
    return runCommand(`pm install -r ${apkPath}`);
  }, [runCommand]);

  useEffect(() => { check(); }, [check]);

  return {
    status,
    isReady: status === 'ready',
    check,
    requestPermission,
    runCommand,
    setDefaultSmsApp,
    grantPermission,
    setDefaultLauncher,
    installSilent,
  };
}

// ── Shizuku setup instructions for the developer screen ───────────────────
export const SHIZUKU_SETUP_STEPS = [
  'Install Shizuku from Play Store on the device.',
  'Enable wireless debugging in Android Developer Options.',
  'Pair your device via adb: adb pair <ip>:<port>',
  'In Shizuku, tap "Start via Wireless Debugging".',
  'Grant presenceOS Shizuku permission when prompted.',
  'Privileged operations (SMS default, permissions, silent install) now available.',
];

export const SHIZUKU_PACKAGE = 'moe.shizuku.privileged.api';
