/**
 * developer.tsx — Developer Options
 * Uses useRoot() → RootAccessModule (Magisk su pattern) for all shell commands.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch,
  Alert, NativeModules, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useRoot } from '@/hooks/useRoot';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Globe, QrCode, Usb, Settings as SettingsIcon,
  AlertTriangle, RotateCcw, Wifi, Terminal, Type,
} from 'lucide-react-native';

const { PresenceDeviceControl } = NativeModules;

function Row({ icon, label, sub, value, onToggle, color, t, disabled }: {
  icon: React.ReactNode; label: string; sub?: string;
  value: boolean; onToggle: () => void; color: string; t: any; disabled?: boolean;
}) {
  return (
    <View style={[D.row, { borderBottomColor: t.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={[D.label, { color: disabled ? t.textMuted : t.text }]}>{label}</Text>
          {sub && <Text style={[D.sub, { color: t.textMuted }]} numberOfLines={2}>{sub}</Text>}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onToggle}
        disabled={disabled}
        trackColor={{ false: t.border, true: color + '60' }}
        thumbColor={value ? color : t.textMuted}
      />
    </View>
  );
}

export default function DeveloperScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeTheme: t, settings, updateSetting } = useSettings();

  const [socialEnabled,  setSocialEnabled]  = useState(!(settings as any).browserSocialBlock);
  const [qrEnabled,      setQrEnabled]      = useState(!!(settings as any).qrPairingEnabled);
  const [keyboardEnabled, setKeyboardEnabled] = useState((settings as any).presenceKeyboardEnabled !== false);
  const { execAsRoot, isGranted: rootAvailable, isChecking, status, requestRoot } = useRoot();
  const [usbDebug,       setUsbDebug]       = useState(false);
  const [wirelessDebug,  setWirelessDebug]  = useState(false);
  const [hotspotEnabled, setHotspotEnabled] = useState(!!(settings as any).hotspotEnabled);

  const haptic = useCallback(() => {
    if (settings.hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [settings.hapticFeedback]);

  // Magisk doesn't grant on a bare checkRoot() — that exits the su shell too
  // fast for the user to tap "Allow". When status comes back "denied" but su
  // is present on the device, ask explicitly so the Magisk dialog appears.
  useEffect(() => {
    if (status === 'denied') { requestRoot().catch(() => {}); }
  }, [status, requestRoot]);

  // Read current ADB state once root is confirmed via useRoot()
  useEffect(() => {
    if (!rootAvailable) return;
    (async () => {
      try {
        const adbVal = await execAsRoot('settings get global adb_enabled').catch(() => '0');
        setUsbDebug(adbVal.trim() === '1');
        const wadbVal = await execAsRoot('settings get global adb_wifi_enabled').catch(() => '0');
        setWirelessDebug(wadbVal.trim() === '1');
      } catch {}
    })();
  }, [rootAvailable, execAsRoot]);

  const toggleSocial = useCallback(() => {
    haptic();
    const next = !socialEnabled;
    setSocialEnabled(next);
    updateSetting('browserSocialBlock' as any, !next);
  }, [socialEnabled, haptic, updateSetting]);

  const toggleQr = useCallback(() => {
    haptic();
    const next = !qrEnabled;
    setQrEnabled(next);
    updateSetting('qrPairingEnabled' as any, next);
  }, [qrEnabled, haptic, updateSetting]);

  const toggleKeyboard = useCallback(() => {
    haptic();
    const next = !keyboardEnabled;
    setKeyboardEnabled(next);
    updateSetting('presenceKeyboardEnabled' as any, next);
  }, [keyboardEnabled, haptic, updateSetting]);

  const toggleUsbDebug = useCallback(async () => {
    haptic();
    const next = !usbDebug;
    try {
      if (rootAvailable) {
        await execAsRoot(`settings put global adb_enabled ${next ? 1 : 0}`);
        if (next) {
          await execAsRoot('setprop service.adb.tcp.port -1').catch(() => {});
          await execAsRoot('stop adbd; start adbd').catch(() => {});
        }
        setUsbDebug(next);
      } else {
        const result = await PresenceDeviceControl?.setAdbDebugging?.(next, wirelessDebug);
        if (result === 'ok') setUsbDebug(next);
        else throw new Error('Native toggle failed');
      }
    } catch (e: any) {
      Alert.alert(
        'ADB Toggle',
        rootAvailable
          ? `Root command failed: ${e?.message}`
          : 'Could not toggle ADB. Device may need root or the PresenceOS native module does not support this.',
        [{ text: 'OK' }]
      );
    }
  }, [usbDebug, wirelessDebug, rootAvailable, haptic]);

  const toggleWirelessDebug = useCallback(async () => {
    haptic();
    const next = !wirelessDebug;
    try {
      if (rootAvailable) {
        if (next) {
          await execAsRoot('settings put global adb_wifi_enabled 1');
          await execAsRoot('setprop service.adb.tcp.port 5555');
          await execAsRoot('stop adbd; start adbd').catch(() => {});
          const ip = await execAsRoot("ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1").catch(() => '');
          const ipClean = ip.trim();
          setWirelessDebug(true);
          if (ipClean) {
            Alert.alert('Wireless ADB Enabled', `Connect with:\nadb connect ${ipClean}:5555`, [{ text: 'OK' }]);
          }
        } else {
          await execAsRoot('settings put global adb_wifi_enabled 0');
          await execAsRoot('setprop service.adb.tcp.port -1');
          await execAsRoot('stop adbd; start adbd').catch(() => {});
          setWirelessDebug(false);
        }
      } else {
        const result = await PresenceDeviceControl?.setAdbDebugging?.(usbDebug, next);
        if (result === 'ok') setWirelessDebug(next);
        else throw new Error('Native toggle failed');
      }
    } catch (e: any) {
      Alert.alert('Wireless ADB', `Failed: ${e?.message ?? 'Unknown error'}`, [{ text: 'OK' }]);
    }
  }, [wirelessDebug, usbDebug, rootAvailable, haptic]);

  const toggleHotspot = useCallback(async () => {
    haptic();
    const next = !hotspotEnabled;
    try {
      if (rootAvailable) {
        if (next) {
          // Root: force start hotspot via service call
          await execAsRoot('svc wifi hotspot enable').catch(async () => {
            await execAsRoot('cmd wifi start-softap PresenceOS WPA2 presenceos123 false');
          });
        } else {
          await execAsRoot('svc wifi hotspot disable').catch(async () => {
            await execAsRoot('cmd wifi stop-softap');
          });
        }
        setHotspotEnabled(next);
        updateSetting('hotspotEnabled' as any, next);
      } else {
        await PresenceDeviceControl?.setHotspot?.(next, 'PresenceOS', null);
        setHotspotEnabled(next);
        updateSetting('hotspotEnabled' as any, next);
      }
    } catch (e: any) {
      Alert.alert('Hotspot', `Failed: ${e?.message}`, [{ text: 'OK' }]);
    }
  }, [hotspotEnabled, rootAvailable, haptic, updateSetting]);

  const openAndroidSettings = useCallback(() => {
    haptic();
    Linking.openURL('intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;component=com.android.settings/.Settings;end')
      .catch(() => PresenceDeviceControl?.openSystemSettings?.('general').catch(() => {}));
  }, [haptic]);

  const handleReset = useCallback(() => {
    haptic();
    Alert.alert('Reset PresenceOS', 'Erase all PresenceOS user data?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase & Reboot', style: 'destructive', onPress: async () => {
        await AsyncStorage.clear().catch(() => {});
        if (rootAvailable) {
          await execAsRoot('reboot').catch(() => {});
        } else {
          await PresenceDeviceControl?.rebootDevice?.(null).catch(() => {});
        }
      }},
    ]);
  }, [haptic, rootAvailable]);

  return (
    <View style={[D.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />
      <View style={[D.header, { borderBottomColor: t.border }]}>
        <Text style={[D.title, { color: t.text }]}>Developer Options</Text>
      </View>

      <ScrollView contentContainerStyle={D.scroll}>

        {/* Root status banner */}
        <Pressable
          onPress={() => { if (!rootAvailable && !isChecking) requestRoot().catch(() => {}); }}
          style={[D.banner, {
            backgroundColor:
              rootAvailable ? (t.greenDim ?? '#1a2e1a')
              : isChecking ? (t.surface ?? '#1f1f1f')
              : (t.redDim ?? '#2e1a1a'),
            borderColor:
              rootAvailable ? t.green + '40'
              : isChecking ? t.border
              : t.red + '40',
          }]}
        >
          <Terminal size={14} color={rootAvailable ? t.green : isChecking ? t.textMuted : t.red} />
          <Text style={{
            color: rootAvailable ? t.green : isChecking ? t.textMuted : t.red,
            fontSize: 12, flex: 1,
          }}>
            {rootAvailable
              ? 'Root access confirmed — all toggles use root shell commands'
              : isChecking
                ? 'Checking root access…'
                : status === 'not_rooted'
                  ? 'Device not rooted — install Magisk to enable system toggles'
                  : 'Root not granted — tap to request (Magisk dialog will appear)'}
          </Text>
        </Pressable>

        <View style={[D.warn, { backgroundColor: t.redDim ?? '#2e1a1a', borderColor: t.red + '40' }]}>
          <AlertTriangle size={14} color={t.red} />
          <Text style={[D.warnText, { color: t.red }]}>
            Developer options can affect device stability. Use with care.
          </Text>
        </View>

        {/* App toggles */}
        <View style={[D.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[D.cardHeader, { color: t.textMuted }]}>APP BEHAVIOUR</Text>
          <Row
            icon={<Globe size={18} color={socialEnabled ? '#26A69A' : t.textMuted} />}
            label="Social & Logins"
            sub="Allow browser to access social media and login pages"
            value={socialEnabled} onToggle={toggleSocial} color="#26A69A" t={t}
          />
          <Row
            icon={<QrCode size={18} color={qrEnabled ? t.accent : t.textMuted} />}
            label="Enable QR Pairing"
            sub="Show QR scan button in Contacts"
            value={qrEnabled} onToggle={toggleQr} color={t.accent} t={t}
          />
          <Row
            icon={<Type size={18} color={keyboardEnabled ? t.accent : t.textMuted} />}
            label="PresenceKeyboard"
            sub="Use built-in keyboard. Off = system soft keyboard"
            value={keyboardEnabled} onToggle={toggleKeyboard} color={t.accent} t={t}
          />
        </View>

        {/* System toggles */}
        <View style={[D.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[D.cardHeader, { color: t.textMuted }]}>SYSTEM{!rootAvailable ? ' (limited — no root)' : ''}</Text>
          <Row
            icon={<Usb size={18} color={usbDebug ? '#8B5CF6' : t.textMuted} />}
            label="USB Debugging (ADB)"
            sub={rootAvailable ? "Root: settings put global adb_enabled" : "Via native module"}
            value={usbDebug} onToggle={toggleUsbDebug} color="#8B5CF6" t={t}
          />
          <Row
            icon={<Wifi size={18} color={wirelessDebug ? '#8B5CF6' : t.textMuted} />}
            label="Wireless Debugging"
            sub={rootAvailable ? "Root: enables ADB on port 5555 + shows IP" : "Via native module"}
            value={wirelessDebug} onToggle={toggleWirelessDebug} color="#8B5CF6" t={t}
          />
          <Row
            icon={<Wifi size={18} color={hotspotEnabled ? t.accent : t.textMuted} />}
            label="Mobile Hotspot"
            sub={rootAvailable ? "Root: svc wifi hotspot enable/disable" : "Via native module"}
            value={hotspotEnabled} onToggle={toggleHotspot} color={t.accent} t={t}
          />
        </View>

        {/* Action buttons */}
        <View style={[D.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Pressable style={[D.actionRow, { borderBottomColor: t.border }]} onPress={openAndroidSettings}>
            <SettingsIcon size={18} color={t.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[D.label, { color: t.text }]}>Android Settings</Text>
              <Text style={[D.sub, { color: t.textMuted }]}>Open system settings app</Text>
            </View>
            <ChevronLeft size={16} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
          <Pressable style={[D.actionRow, { borderBottomWidth: 0 }]} onPress={handleReset}>
            <RotateCcw size={18} color={t.red} />
            <View style={{ flex: 1 }}>
              <Text style={[D.label, { color: t.red }]}>Reset PresenceOS</Text>
              <Text style={[D.sub, { color: t.textMuted }]}>
                {rootAvailable ? 'Clears AsyncStorage then reboots via root' : 'Clears AsyncStorage + reboot attempt'}
              </Text>
            </View>
          </Pressable>
        </View>

      </ScrollView>
      <BottomBackBar />
    </View>
  );
}

const D = StyleSheet.create({
  root:       { flex: 1 },
  header:     { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:      { fontSize: 17, fontWeight: '600' as const },
  scroll:     { padding: 20, gap: 14, paddingBottom: 96 },
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  warn:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  warnText:   { flex: 1, fontSize: 12, lineHeight: 18 },
  card:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  label:      { fontSize: 15, fontWeight: '500' as const },
  sub:        { fontSize: 12, marginTop: 1 },
});
