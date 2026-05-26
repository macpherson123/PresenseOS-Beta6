/**
 * useRoot — Root access detection, permission request, and privileged ops.
 *
 * Uses RootAccessModule (Kotlin) which uses the DataOutputStream su pattern
 * that correctly triggers the Magisk grant dialog.
 */

import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

const { RootAccess, PresenceSystem } = NativeModules;

export type RootStatus = 'checking' | 'not_supported' | 'not_rooted' | 'denied' | 'granted';

export function useRoot() {
  const [status, setStatus] = useState<RootStatus>('checking');

  const check = useCallback(async (): Promise<RootStatus> => {
    if (Platform.OS !== 'android') { setStatus('not_supported'); return 'not_supported'; }
    if (!RootAccess?.checkRoot)    { setStatus('not_supported'); return 'not_supported'; }
    try {
      const result: RootStatus = await RootAccess.checkRoot();
      setStatus(result);
      return result;
    } catch {
      setStatus('denied');
      return 'denied';
    }
  }, []);

  const requestRoot = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !RootAccess?.requestRoot) return false;
    try {
      const granted: boolean = await RootAccess.requestRoot();
      setStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch {
      setStatus('denied');
      return false;
    }
  }, []);

  const execAsRoot = useCallback(async (cmd: string): Promise<string> => {
    if (!RootAccess?.execAsRoot) throw new Error('RootAccess module missing');
    return RootAccess.execAsRoot(cmd);
  }, []);

  const putSetting = useCallback(async (
    namespace: 'system' | 'global' | 'secure',
    key: string,
    value: string
  ): Promise<boolean> => {
    if (RootAccess?.putSetting) {
      try { return await RootAccess.putSetting(namespace, key, value); } catch { return false; }
    }
    try { await execAsRoot(`settings put ${namespace} ${key} ${value}`); return true; } catch { return false; }
  }, [execAsRoot]);

  const reboot = useCallback(async (reason = ''): Promise<void> => {
    if (RootAccess?.reboot) { await RootAccess.reboot(reason); return; }
    await execAsRoot(reason ? `reboot ${reason}` : 'reboot');
  }, [execAsRoot]);

  const setScreenTimeout = useCallback(async (ms: number): Promise<boolean> => {
    if (PresenceSystem?.setScreenTimeout) return PresenceSystem.setScreenTimeout(ms);
    return putSetting('system', 'screen_off_timeout', String(ms));
  }, [putSetting]);

  const toggleAdb = useCallback(async (enable: boolean): Promise<boolean> => {
    if (PresenceSystem?.toggleAdb) return PresenceSystem.toggleAdb(enable);
    return putSetting('global', 'adb_enabled', enable ? '1' : '0');
  }, [putSetting]);

  const toggleWirelessAdb = useCallback(async (enable: boolean): Promise<boolean> => {
    if (PresenceSystem?.toggleWirelessAdb) return PresenceSystem.toggleWirelessAdb(enable);
    return putSetting('global', 'adb_wifi_enabled', enable ? '1' : '0');
  }, [putSetting]);

  useEffect(() => { check(); }, [check]);

  return {
    status,
    isGranted:        status === 'granted',
    isChecking:       status === 'checking',
    check,
    requestRoot,
    execAsRoot,
    putSetting,
    reboot,
    setScreenTimeout,
    toggleAdb,
    toggleWirelessAdb,
  };
}
