import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Pressable, Platform, Alert,
  NativeModules, AppState, Modal, TextInput, ActivityIndicator,
  PermissionsAndroid, Image, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Dimensions } from 'react-native';
const { width: SW } = Dimensions.get('window');
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import { THEME_LIST, type ThemePreset, type ThemeDefinition } from '@/constants/colors';
import { useRoot } from '@/hooks/useRoot';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, ChevronDown, Wifi, Bluetooth, Sun, Moon, Bell, Vibrate,
  Clock, MapPin, Nfc, Lock, Type, Contrast, Check, RotateCcw,
  ShieldCheck, Radio, Signal, Key, Delete, RefreshCw,
  Phone, Home, Globe, Eye, EyeOff, MessageSquare, Info, Camera,
  Terminal, Usb,
} from 'lucide-react-native';

const TIMEOUT_OPTIONS = [15, 30, 60, 120, 300];
const PIN_LENGTH = 6;

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, t }: { title: string; t: ReturnType<typeof useSettings>['activeTheme'] }) {
  const { uiTokens: s } = useSettings();
  return (
    <Text style={[styles.sectionHeader, {
      color: t.textMuted,
      letterSpacing: s.letterSpacing,
      fontWeight: s.labelWeight,
      textTransform: s.uppercase ? 'uppercase' : 'none',
    }]}>
      {title}
    </Text>
  );
}

// ─── Theme Preview Card ───────────────────────────────────────────────────────

function ThemeCard({
  def, active, onPress,
}: { def: ThemeDefinition; active: boolean; onPress: () => void }) {
  const c = def.preview;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.themeCard, {
        backgroundColor: c.bg,
        borderColor: active ? c.accent : 'transparent',
        opacity: pressed ? 0.85 : 1,
      }]}
    >
      {/* Mini UI preview inside card */}
      <View style={[styles.themeCardInner, { backgroundColor: c.surface }]}>
        <View style={[styles.themeCardDot,  { backgroundColor: c.accent }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[styles.themeCardLine, { backgroundColor: c.textMuted, width: '68%' }]} />
          <View style={[styles.themeCardLine, { backgroundColor: c.textMuted, width: '44%' }]} />
        </View>
      </View>

      <Text style={[styles.themeCardName, { color: active ? c.accent : c.textMuted }]}>
        {def.name}
      </Text>

      {active && (
        <View style={[styles.themeCardCheck, { backgroundColor: c.accent }]}>
          <Check size={10} color={c.bg} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Accent Colour Swatch Card ────────────────────────────────────────────────

const ACCENT_PRESETS = [
  { id: null,      name: 'Theme',   color: null   },   // use theme default
  { id: '#E8A838', name: 'Amber',   color: '#E8A838' },
  { id: '#3ABFAD', name: 'Teal',    color: '#3ABFAD' },
  { id: '#7C6AFA', name: 'Violet',  color: '#7C6AFA' },
  { id: '#E85490', name: 'Rose',    color: '#E85490' },
  { id: '#4ADE80', name: 'Lime',    color: '#4ADE80' },
  { id: '#38BDF8', name: 'Sky',     color: '#38BDF8' },
  { id: '#F97316', name: 'Orange',  color: '#F97316' },
  { id: '#EC4899', name: 'Pink',    color: '#EC4899' },
  { id: '#FFFFFF', name: 'White',   color: '#FFFFFF' },
] as const;

function AccentCard({
  preset, active, themeAccent, onPress,
}: { preset: typeof ACCENT_PRESETS[number]; active: boolean; themeAccent: string; onPress: () => void }) {
  const swatch = preset.color ?? themeAccent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.accentCard, {
        borderColor: active ? swatch : 'transparent',
        opacity: pressed ? 0.82 : 1,
      }]}
    >
      <View style={[styles.accentSwatch, { backgroundColor: swatch }]}>
        {preset.id === null && (
          <View style={[styles.accentSwatchDiag, { backgroundColor: themeAccent + '55' }]} />
        )}
      </View>
      <Text style={[styles.accentName, { color: active ? swatch : '#666' }]}>{preset.name}</Text>
      {active && <View style={[styles.accentCheck, { backgroundColor: swatch }]} />}
    </Pressable>
  );
}

// ─── UI Style Preview Card ────────────────────────────────────────────────────

const UI_STYLES = [
  { id: 'modern'    as const, name: 'Modern',    desc: 'Flip clock · HTC Sense',        Preview: ModernPreview    },
  { id: 'classic'   as const, name: 'Classic',   desc: 'Analogue hands · timeless',     Preview: ClassicPreview   },
  { id: 'geometric' as const, name: 'Geometric', desc: 'Angular digital · precise',     Preview: GeometricPreview },
  { id: 'simple'    as const, name: 'Simple',    desc: 'Plain text · minimal chrome',   Preview: SimplePreview    },
  { id: 'oldschool' as const, name: 'Old School', desc: 'Retro LCD · pixel grid',       Preview: OldSchoolPreview },
  { id: 'neon'      as const, name: 'Neon',      desc: 'Glow outlines · cyberpunk',     Preview: NeonPreview      },
];

function ModernPreview({ accent }: { accent: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      <View style={[styles.previewBox, { backgroundColor: accent + '22', borderColor: accent + '55' }]} />
      <View style={[styles.previewBox, { backgroundColor: accent + '22', borderColor: accent + '55' }]} />
    </View>
  );
}
function ClassicPreview({ accent }: { accent: string }) {
  return (
    <View style={[styles.previewCircle, { borderColor: accent }]}>
      <View style={[styles.previewHandH, { backgroundColor: '#222' }]} />
      <View style={[styles.previewHandM, { backgroundColor: '#222' }]} />
      <View style={[styles.previewHandS, { backgroundColor: accent }]} />
      <View style={[styles.previewCentre, { backgroundColor: accent }]} />
    </View>
  );
}
function GeometricPreview({ accent }: { accent: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={[styles.previewDiamond, { backgroundColor: accent }]} />
      <View style={{ gap: 3 }}>
        <View style={[styles.previewGeoLine, { backgroundColor: accent + '99' }]} />
        <View style={[styles.previewGeoLine, { backgroundColor: accent + '55', width: 20 }]} />
      </View>
    </View>
  );
}

function SimplePreview({ accent }: { accent: string }) {
  return (
    <View style={{ gap: 4, alignItems: 'flex-start' }}>
      <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: accent }} />
      <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: accent + '55' }} />
      <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: accent + '33' }} />
    </View>
  );
}
function OldSchoolPreview({ accent }: { accent: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {['8', '8', ':', '8', '8'].map((c, i) => (
        <View key={i} style={{
          width: c === ':' ? 6 : 12, height: 18, borderRadius: 2,
          backgroundColor: accent + '22', borderWidth: 1, borderColor: accent + '66',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ width: c === ':' ? 3 : 7, height: c === ':' ? 10 : 14,
            backgroundColor: accent + (c === ':' ? 'aa' : '77'), borderRadius: 1 }} />
        </View>
      ))}
    </View>
  );
}
function NeonPreview({ accent }: { accent: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 38, height: 38, borderRadius: 19,
        borderWidth: 2, borderColor: accent,
        shadowColor: accent, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1, shadowRadius: 6,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: accent + '11',
      }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
      </View>
    </View>
  );
}

function UIStyleCard({
  style, active, accent, onPress,
}: { style: typeof UI_STYLES[0]; active: boolean; accent: string; onPress: () => void }) {
  const { Preview } = style;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.uiStyleCard, {
        borderColor: active ? accent : 'transparent',
        opacity: pressed ? 0.85 : 1,
      }]}
    >
      <View style={styles.uiStylePreview}>
        <Preview accent={accent} />
      </View>
      <Text style={[styles.uiStyleName, { color: active ? accent : '#888' }]}>{style.name}</Text>
      {active && (
        <View style={[styles.uiStyleCheck, { backgroundColor: accent }]}>
          <Check size={8} color="#000" />
        </View>
      )}
    </Pressable>
  );
}

// ─── Main Settings Screen ─────────────────────────────────────────────────────

export function SettingsContent({ onBack, onNavigate, rootTransparent }: { onBack?: () => void; onNavigate?: (route: string) => void; rootTransparent?: boolean }) {
  const { settings, updateSetting, updateSettings, activeTheme: t, uiTokens: s } = useSettings();
  const { user, setPin, verifyPin } = useUser();

  // ── PIN change
  const [showPinChange,  setShowPinChange]  = useState(false);
  const [currentPin,     setCurrentPin]     = useState('');
  const [newPin,         setNewPin]         = useState('');
  const [confirmNewPin,  setConfirmNewPin]  = useState('');
  const [pinStep,        setPinStep]        = useState<'current' | 'new' | 'confirm'>('current');
  const [pinError,       setPinError]       = useState('');

  // ── WiFi
  const [wifiNetworks,  setWifiNetworks]  = useState<Array<{ ssid: string; bssid: string; level: number; secured: boolean }>>([]);
  const [wifiScanning,  setWifiScanning]  = useState(false);
  const [connectingTo,  setConnectingTo]  = useState<string | null>(null);
  const [connectedSsid, setConnectedSsid] = useState('');
  const [showNetworks,  setShowNetworks]  = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<{ ssid: string } | null>(null);
  const [passwordValue,  setPasswordValue]  = useState('');

  // ── Bluetooth
  const [showBluetooth,   setShowBluetooth]   = useState(false);
  const [btDevices,        setBtDevices]        = useState<Array<{ name: string; address: string; paired: boolean; rssi: number }>>([]);
  const [btScanning,       setBtScanning]       = useState(false);
  const [btDiscoverable,   setBtDiscoverable]   = useState(false);

  // ── Hotspot
  const [hotspotSsid,      setHotspotSsid]      = useState('PresenceOS');
  const [hotspotPassword,  setHotspotPassword]  = useState('');
  const [hotspotApplying,  setHotspotApplying]  = useState(false);
  const [defaultsExpanded,  setDefaultsExpanded]  = useState(false);
  const [showDevPassword,   setShowDevPassword]   = useState(false);
  const [devPasswordInput,  setDevPasswordInput]  = useState('');
  const [devTapCount,        setDevTapCount]       = useState(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dev mode: 10-tap on "About System" → password prompt → enable
  const DEV_PASSWORD = '12121212';
  const handleDevTap = React.useCallback(() => {
    if (settings.developerMode) return; // already on
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    const next = devTapCount + 1;
    setDevTapCount(next);
    if (next >= 10) {
      setDevTapCount(0);
      setDevPasswordInput('');
      setShowDevPassword(true);
    } else {
      const remaining = 10 - next;
      if (remaining <= 5) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (remaining <= 3) Alert.alert('', `${remaining} more tap${remaining !== 1 ? 's' : ''} to unlock developer mode`);
      devTapTimer.current = setTimeout(() => setDevTapCount(0), 3000);
    }
  }, [devTapCount, settings.developerMode]);
  // permsExpanded merged into defaultsExpanded — removed
  const [hotspotShowPass,  setHotspotShowPass]  = useState(false);
  const [hotspotExpanded,  setHotspotExpanded]  = useState(false);
  const hotspotDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── USB Tethering
  const [usbTetheringOn,   setUsbTetheringOn]   = useState(false);
  // ── ADB / USB Configuration
  const [adbEnabled,       setAdbEnabled]       = useState(false);
  const [wirelessAdbOn,    setWirelessAdbOn]    = useState(false);
  const [usbConfig,        setUsbConfig]        = useState('charging');

  // ── Appearance
  const [showAppearance, setShowAppearance] = useState(false);

  // ── Wallpaper
  const [wallpaperUri, setWallpaperUri] = useState<string | null>(settings.wallpaperUri ?? null);

  const { PresenceDeviceControl, RootAccess } = NativeModules;
  const { status: rootStatus, requestRoot, toggleAdb, toggleWirelessAdb, setScreenTimeout, reboot } = useRoot();

  // Request root access on settings mount — triggers Magisk dialog first time
  useEffect(() => {
    if (rootStatus === 'denied' || rootStatus === 'not_rooted') return;
    if (rootStatus === 'checking') return;
    // 'not_supported' means the Kotlin module isn't wired yet — skip silently
  }, [rootStatus]);

  // Prompt user when root is denied
  useEffect(() => {
    if (rootStatus !== 'denied') return;
    Alert.alert(
      'Root Access Denied',
      'presenceOS was denied root access. Some settings toggles require root to function. Open Magisk and grant presenceOS superuser permission, then return to Settings.',
      [
        { text: 'Try Again', onPress: () => requestRoot() },
        { text: 'Later', style: 'cancel' },
      ]
    );
  }, [rootStatus]); // eslint-disable-line

  const haptic = useCallback(() => {
    if (settings.hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [settings.hapticFeedback]);

  // ── Sync hardware on mount / foreground ──────────────────────────────────────
  useEffect(() => {
    const syncStates = async () => {
      if (!PresenceDeviceControl) return;
      try {
        const states = await PresenceDeviceControl.getHardwareStates();
        updateSetting('wifiEnabled',      states.wifiEnabled);
        updateSetting('bluetoothEnabled', states.bluetoothEnabled);
        updateSetting('nfcEnabled',       states.nfcEnabled);
        updateSetting('locationEnabled',  states.locationEnabled);
        updateSetting('hotspotEnabled',   states.hotspotEnabled);
        updateSetting('mobileDataEnabled', states.mobileDataEnabled ?? true);
        if (states.hotspotEnabled) {
          PresenceDeviceControl.getHotspotConfig()
            .then((cfg: any) => {
              if (cfg?.ssid)      setHotspotSsid(cfg.ssid);
              if (cfg?.password !== undefined) setHotspotPassword(cfg.password);
            }).catch(() => {});
        }
        // Load connected SSID
        PresenceDeviceControl.getConnectedSsid?.()
          .then((s: string) => setConnectedSsid(s))
          .catch(() => {});
        // Load ADB and USB config
        PresenceDeviceControl.getAdbEnabled?.()
          .then((v: boolean) => setAdbEnabled(v))
          .catch(() => {});
        PresenceDeviceControl.getUsbConfiguration?.()
          .then((v: string) => setUsbConfig(v || 'charging'))
          .catch(() => {});
        PresenceDeviceControl.getUsbTetheringEnabled?.()
          .then((v: boolean) => setUsbTetheringOn(v))
          .catch(() => {});
      } catch { /* ignore */ }
    };
    syncStates();

    const requestPerms = async () => {
      try {
        const apiLevel = Number(Platform.Version);
        const perms: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        if (apiLevel >= 31) {
          perms.push('android.permission.BLUETOOTH_SCAN');
          perms.push('android.permission.BLUETOOTH_CONNECT');
        }
        if (apiLevel >= 33) perms.push('android.permission.NEARBY_WIFI_DEVICES');
        await PermissionsAndroid.requestMultiple(perms as any);
      } catch { /* ignore */ }
      if (PresenceDeviceControl) PresenceDeviceControl.checkWriteSettings().catch(() => {});
    };
    requestPerms();

    const sub = AppState.addEventListener('change', async next => {
      if (next !== 'active') return;
      syncStates();
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WiFi helpers ─────────────────────────────────────────────────────────────
  const handleScanWifi = useCallback(async () => {
    if (!PresenceDeviceControl || !settings.wifiEnabled || wifiScanning) return;
    setWifiScanning(true);
    try {
      const results = await PresenceDeviceControl.scanWifi();
      setWifiNetworks((results as any[]).map((r: any) => ({
        ssid: r.ssid, bssid: r.bssid, level: r.level,
        secured: r.capabilities?.includes('WPA') || r.capabilities?.includes('WEP'),
      })));
    } catch { /* ignore */ } finally { setWifiScanning(false); }
  }, [PresenceDeviceControl, settings.wifiEnabled, wifiScanning]);

  const handleConnectWifi = useCallback(async (net: { ssid: string; secured: boolean }) => {
    if (!PresenceDeviceControl) return;
    if (net.secured) { setPasswordTarget({ ssid: net.ssid }); return; }
    setConnectingTo(net.ssid);
    try {
      await PresenceDeviceControl.connectWifi(net.ssid, null);
      setConnectedSsid(net.ssid);
    } catch { /* ignore */ } finally { setConnectingTo(null); }
  }, [PresenceDeviceControl]);

  const handlePasswordConnect = useCallback(async () => {
    if (!passwordTarget || !PresenceDeviceControl) return;
    setConnectingTo(passwordTarget.ssid);
    try {
      await PresenceDeviceControl.connectWifi(passwordTarget.ssid, passwordValue);
      setConnectedSsid(passwordTarget.ssid);
    } catch { /* ignore */ } finally {
      setConnectingTo(null); setPasswordTarget(null); setPasswordValue('');
    }
  }, [PresenceDeviceControl, passwordTarget, passwordValue]);

  // ── BT helpers ───────────────────────────────────────────────────────────────
  const handleScanBt = useCallback(async () => {
    if (!PresenceDeviceControl || !settings.bluetoothEnabled || btScanning) return;
    setBtScanning(true);
    try {
      const devices = await PresenceDeviceControl.scanBluetoothDevices();
      setBtDevices((devices as any[]).map((d: any) => ({
        name: d.name, address: d.address, paired: d.paired, rssi: d.rssi,
      })));
    } catch { /* ignore */ } finally { setBtScanning(false); }
  }, [PresenceDeviceControl, settings.bluetoothEnabled, btScanning]);

  const handleBtDiscoverable = useCallback(async (enable: boolean) => {
    if (!PresenceDeviceControl) return;
    try { await PresenceDeviceControl.setBluetoothDiscoverable(enable); setBtDiscoverable(enable); }
    catch { /* ignore */ }
  }, [PresenceDeviceControl]);

  // ── Hotspot helpers ──────────────────────────────────────────────────────────
  const handleHotspotToggle = useCallback(async () => {
    if (!PresenceDeviceControl) return;
    haptic();
    const newState = !settings.hotspotEnabled;
    updateSetting('hotspotEnabled', newState);
    try {
      if (newState) {
        // startHotspotConnectivity is more reliable on priv-apps (uses ConnectivityManager.startTethering)
        if (PresenceDeviceControl.startHotspotConnectivity) {
          await PresenceDeviceControl.startHotspotConnectivity(hotspotSsid, hotspotPassword || null);
        } else {
          await PresenceDeviceControl.setHotspot(true, hotspotSsid, hotspotPassword || null);
        }
      } else {
        if (PresenceDeviceControl.stopHotspotConnectivity) {
          await PresenceDeviceControl.stopHotspotConnectivity();
        } else {
          await PresenceDeviceControl.setHotspot(false, null, null);
        }
      }
    } catch (e: any) {
      // If the result contains 'ok-root' the root fallback worked — don't revert
      const msg: string = e?.message ?? '';
      if (!msg.includes('ok-root')) {
        updateSetting('hotspotEnabled', !newState);
        Alert.alert('Hotspot Error', msg || 'Could not change hotspot state. Ensure root is granted via Magisk.');
      }
    }
  }, [haptic, settings.hotspotEnabled, updateSetting, PresenceDeviceControl, hotspotSsid, hotspotPassword]);

  const applyHotspotConfig = useCallback(async () => {
    if (!PresenceDeviceControl || !settings.hotspotEnabled) return;
    setHotspotApplying(true);
    try {
      if (PresenceDeviceControl.startHotspotConnectivity) {
        await PresenceDeviceControl.startHotspotConnectivity(hotspotSsid, hotspotPassword || null);
      } else {
        await PresenceDeviceControl.setHotspot(true, hotspotSsid, hotspotPassword || null);
      }
    } catch { /* ignore */ } finally { setHotspotApplying(false); }
  }, [PresenceDeviceControl, settings.hotspotEnabled, hotspotSsid, hotspotPassword]);

  // ── USB Tethering ────────────────────────────────────────────────────────────
  const handleUsbTetheringToggle = useCallback(async () => {
    if (!PresenceDeviceControl) return;
    haptic();
    const next = !usbTetheringOn;
    setUsbTetheringOn(next);
    try {
      const ok = await PresenceDeviceControl.setUsbTetheringEnabled(next);
      if (!ok) setUsbTetheringOn(!next);
    } catch (e: any) {
      setUsbTetheringOn(!next);
      Alert.alert('USB Tethering Error', e?.message ?? 'Could not toggle USB tethering');
    }
  }, [haptic, usbTetheringOn, PresenceDeviceControl]);

  // ── ADB / USB Debugging ─────────────────────────────────────────────────────
  const handleAdbToggle = useCallback(async () => {
    haptic();
    const next = !adbEnabled;
    setAdbEnabled(next);
    try {
      const ok = await toggleAdb(next);
      if (!ok) {
        setAdbEnabled(!next);
        Alert.alert('ADB Error', 'Could not toggle USB debugging. Ensure root access is granted in Magisk.');
      }
    } catch (e: any) {
      setAdbEnabled(!next);
      Alert.alert('ADB Error', e?.message ?? 'Root required to toggle ADB.');
    }
  }, [haptic, adbEnabled, toggleAdb]);

  const handleWirelessAdbToggle = useCallback(async () => {
    haptic();
    const next = !wirelessAdbOn;
    setWirelessAdbOn(next);
    try {
      const ok = await toggleWirelessAdb(next);
      if (!ok) {
        setWirelessAdbOn(!next);
        Alert.alert('Wireless ADB Error', 'Could not toggle wireless debugging. Ensure root access is granted in Magisk.');
      }
    } catch (e: any) {
      setWirelessAdbOn(!next);
      Alert.alert('Wireless ADB Error', e?.message ?? 'Root required.');
    }
  }, [haptic, wirelessAdbOn, toggleWirelessAdb]);

  const handleUsbConfig = useCallback(async (config: string) => {
    if (!PresenceDeviceControl) return;
    haptic();
    const prev = usbConfig;
    setUsbConfig(config);
    try {
      await PresenceDeviceControl.setUsbConfiguration(config);
    } catch (e: any) {
      setUsbConfig(prev);
      Alert.alert('USB Config Error', e?.message ?? 'Could not change USB configuration');
    }
  }, [haptic, usbConfig, PresenceDeviceControl]);

  // ── Generic toggle ───────────────────────────────────────────────────────────
  const handleToggle = useCallback((
    key: 'wifiEnabled' | 'bluetoothEnabled' | 'mobileDataEnabled' |
         'notificationsEnabled' | 'hapticFeedback' | 'doNotDisturb' |
         'locationEnabled' | 'nfcEnabled' | 'autoLock',
  ) => {
    haptic();
    const newState = !settings[key];
    updateSetting(key, newState);
    if (!PresenceDeviceControl) return;
    if (key === 'wifiEnabled') {
      PresenceDeviceControl.setWifiEnabled(newState)
        .then((r: string) => {
          if (r !== 'ok') {
            // API failed — try root shell fallback
            RootAccess?.execAsRoot?.(`svc wifi ${newState ? 'enable' : 'disable'}`)
              .catch(() => {
                updateSetting('wifiEnabled', !newState);
              });
          }
        })
        .catch(() => {
          // Try root directly
          RootAccess?.execAsRoot?.(`svc wifi ${newState ? 'enable' : 'disable'}`)
            .catch(() => updateSetting('wifiEnabled', !newState));
        });
    } else if (key === 'bluetoothEnabled') {
      PresenceDeviceControl.setBluetoothEnabled(newState)
        .then(() => {
          if (newState) setTimeout(() => {
            PresenceDeviceControl.getPairedDevices()
              .then((d: any[]) => setBtDevices(d.map((x: any) => ({ name: x.name, address: x.address, paired: x.paired, rssi: x.rssi }))))
              .then(() => PresenceDeviceControl.isBluetoothDiscoverable())
              .then((disc: boolean) => setBtDiscoverable(disc))
              .catch(() => {});
          }, 2000);
        }).catch(() => {
          updateSetting('bluetoothEnabled', !newState);
          // Android 13+ deprecated programmatic BT toggle — open settings as fallback
          PresenceDeviceControl.openSystemSettings?.('bluetooth').catch(() => {});
        });
    } else if (key === 'nfcEnabled') {
      PresenceDeviceControl.setNfcEnabled(newState)
        .then((r: string) => { if (r !== 'ok') PresenceDeviceControl.openSystemSettings('nfc').catch(() => {}); })
        .catch(() => PresenceDeviceControl.openSystemSettings('nfc').catch(() => {}));
    } else if (key === 'mobileDataEnabled') {
      PresenceDeviceControl.setMobileDataEnabled(newState)
        .then((r: string) => {
          if (r !== 'ok') { updateSetting('mobileDataEnabled', !newState); PresenceDeviceControl.openSystemSettings('mobileData').catch(() => {}); }
        }).catch(() => { updateSetting('mobileDataEnabled', !newState); });
    } else if (key === 'doNotDisturb') {
      PresenceDeviceControl.setDoNotDisturb(newState)
        .then((r: string) => {
          if (r === 'need_permission') {
            updateSetting('doNotDisturb', !newState);
            Alert.alert('Do Not Disturb Access', 'PresenceOS needs DND access. Enable it in the page that just opened.');
          } else if (r !== 'ok') updateSetting('doNotDisturb', !newState);
        }).catch(() => updateSetting('doNotDisturb', !newState));
    } else if (key === 'locationEnabled') {
      PresenceDeviceControl.setLocationEnabled(newState)
        .then((r: string) => { if (r !== 'ok') PresenceDeviceControl.openSystemSettings('location').catch(() => {}); })
        .catch(() => PresenceDeviceControl.openSystemSettings('location').catch(() => {}));
    } else if (key === 'notificationsEnabled') {
      // Pure JS gate — controls SMS / PresenceChat / missed-call badges on the
      // home screen. systemui has been stripped from PresenceOS test devices,
      // so there's no system-side notification surface to toggle.
    } else if (key === 'autoLock') {
      // Root: set keyguard disabled flag
      RootAccess?.execAsRoot?.(`settings put secure lock_screen_lock_after_timeout ${newState ? 5000 : 2147483647}`)
        .catch(() => {});
    }
  }, [settings, updateSetting, haptic, PresenceDeviceControl]);

  const cycleTimeout = useCallback(async () => {
    haptic();
    const idx  = TIMEOUT_OPTIONS.indexOf(settings.screenTimeout);
    const next = TIMEOUT_OPTIONS[(idx + 1) % TIMEOUT_OPTIONS.length];
    updateSetting('screenTimeout', next);
    try {
      const ok = await setScreenTimeout(next * 1000);
      if (!ok) Alert.alert('Screen Timeout', 'Applied locally. Root access needed to apply to system.');
    } catch (e: any) {
      Alert.alert('Screen Timeout Error', e?.message ?? 'Root required to change screen timeout.');
    }
  }, [settings.screenTimeout, updateSetting, haptic, PresenceDeviceControl]);

  const formatTimeout = (s: number) => s < 60 ? `${s}s` : `${s / 60}m`;

  const handleBrightnessChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    updateSetting('brightness', rounded);
    if (PresenceDeviceControl) {
      PresenceDeviceControl.setBrightness(rounded).catch((e: any) => {
        if (e?.code === 'E_WRITE_SETTINGS_DENIED') Alert.alert('Permission needed', 'Enable "Modify system settings" for presenceOS.');
      });
    }
  }, [updateSetting, PresenceDeviceControl]);

  // ── PIN helpers ──────────────────────────────────────────────────────────────
  const openPinChange = useCallback(() => {
    // If no PIN is set yet, skip the "Enter Current PIN" step
    if (!user.screenPin) {
      setPinStep('new');
    } else {
      setPinStep('current');
    }
    setCurrentPin(''); setNewPin(''); setConfirmNewPin(''); setPinError('');
    setShowPinChange(true);
  }, [user.screenPin]);

  const handlePinChange = useCallback(() => {
    if (pinStep === 'current') {
      if (user.screenPin && !verifyPin(currentPin)) {
        setPinError('Incorrect current PIN'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return;
      }
      setPinError(''); setPinStep('new');
    } else if (pinStep === 'new') {
      if (newPin.length < PIN_LENGTH) { setPinError('PIN must be 6 digits'); return; }
      setPinError(''); setPinStep('confirm');
    } else {
      if (confirmNewPin !== newPin) {
        setPinError('PINs do not match'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); setConfirmNewPin(''); return;
      }
      setPin(newPin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('PIN Updated', 'Your screen PIN has been updated.');
      setShowPinChange(false); setCurrentPin(''); setNewPin(''); setConfirmNewPin(''); setPinStep('current'); setPinError('');
    }
  }, [pinStep, currentPin, newPin, confirmNewPin, user.screenPin, verifyPin, setPin]);

  useEffect(() => {
    if (!showPinChange) return;
    const active = pinStep === 'current' ? currentPin : pinStep === 'new' ? newPin : confirmNewPin;
    if (active.length !== PIN_LENGTH) return;
    const timer = setTimeout(handlePinChange, 150);
    return () => clearTimeout(timer);
  }, [showPinChange, pinStep, currentPin, newPin, confirmNewPin, handlePinChange]);

  // Quoted keys — required for Hermes AOT production builds
  const switchTrack = (_enabled: boolean, color: string) => ({
    'false': t.border,
    'true':  color + '60',
  } as { false: string; true: string });

  // ── Wallpaper ────────────────────────────────────────────────────────────────
  const handlePickWallpaper = useCallback(async () => {
    // Request media library permission (required on Android)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a wallpaper.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const uri = result.assets[0].uri;
      setWallpaperUri(uri);
      updateSetting('wallpaperUri', uri);
    }
  }, [updateSetting]);

  const handleRemoveWallpaper = useCallback(() => {
    setWallpaperUri(null);
    updateSetting('wallpaperUri', null);
  }, [updateSetting]);

  // ── PIN screen ────────────────────────────────────────────────────────────────
  if (showPinChange) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <OSStatusBar />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Change PIN</Text>
        </View>

        <View style={styles.pinChangeContent}>
          <View style={[styles.pinIcon, { backgroundColor: t.accentDim }]}>
            <Key size={28} color={t.accent} />
          </View>
          <Text style={[styles.pinStepTitle, { color: t.text }]}>
            {pinStep === 'current' && !user.screenPin ? 'Set New PIN' : pinStep === 'current' ? 'Enter Current PIN' : pinStep === 'new' ? 'Enter New PIN' : 'Confirm New PIN'}
          </Text>
          <View style={styles.pinDotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const val = pinStep === 'current' ? currentPin : pinStep === 'new' ? newPin : confirmNewPin;
              return <View key={i} style={[styles.pinDot, { borderColor: t.border }, i < val.length && { backgroundColor: t.accent, borderColor: t.accent }]} />;
            })}
          </View>
          {pinError ? <Text style={[styles.pinErrorText, { color: t.red }]}>{pinError}</Text> : null}
          <View style={styles.pinPad}>
            {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, rowIdx) => (
              <View key={rowIdx} style={styles.pinPadRow}>
                {row.map((digit, idx) => {
                  if (digit === '') return <View key={idx} style={styles.pinPadBtnEmpty} />;
                  if (digit === 'del') return (
                    <Pressable key={idx} style={styles.pinPadBtn} onPress={() => {
                      haptic(); setPinError('');
                      if (pinStep === 'current') setCurrentPin(p => p.slice(0,-1));
                      else if (pinStep === 'new') setNewPin(p => p.slice(0,-1));
                      else setConfirmNewPin(p => p.slice(0,-1));
                    }}>
                      <Delete size={20} color={t.textMuted} />
                    </Pressable>
                  );
                  return (
                    <Pressable key={idx} style={[styles.pinPadBtn, { backgroundColor: t.surface, borderColor: t.border }]}
                      onPress={() => {
                        haptic(); setPinError('');
                        const setter = pinStep === 'current' ? setCurrentPin : pinStep === 'new' ? setNewPin : setConfirmNewPin;
                        setter(prev => prev.length >= PIN_LENGTH ? prev : prev + digit);
                      }}>
                      <Text style={[styles.pinPadDigit, { color: t.text }]}>{digit}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {!user.screenPin && pinStep === 'current' && (
            <Text style={[styles.pinHint, { color: t.textMuted }]}>You haven't set a PIN yet. Set a new 6-digit PIN.</Text>
          )}
        </View>
        <BottomBackBar onBack={() => { setShowPinChange(false); setPinStep('current'); setPinError(''); setCurrentPin(''); setNewPin(''); setConfirmNewPin(''); }} />
      </View>
    );
  }

  // ── Main settings screen ──────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: rootTransparent ? 'transparent' : t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: t.text }]}>Settings</Text>
      </View>

      <PhilosophyBanner screen="settings" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ══════════ APPEARANCE ══════════ */}
        <SectionHeader title="APPEARANCE" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          {/* Collapsible header */}
          <Pressable style={styles.row} onPress={() => { haptic(); setShowAppearance(v => !v); }}>
            <View style={styles.rowLeft}>
              <View style={[styles.themeIconBadge, { backgroundColor: t.accentDim }]}>
                <View style={[styles.themeIconDot, { backgroundColor: t.accent }]} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>
                  {THEME_LIST.find(x => x.id === settings.themeName)?.name ?? 'Midnight'}
                </Text>
                <Text style={[{ fontSize: 11, color: t.textMuted, marginTop: 1 }]}>
                  {THEME_LIST.find(x => x.id === settings.themeName)?.desc}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.accentDot, { backgroundColor: t.accent }]} />
              <ChevronDown size={16} color={t.textMuted}
                style={{ transform: [{ rotate: showAppearance ? '180deg' : '0deg' }] } as any} />
            </View>
          </Pressable>

          {showAppearance && (
            <>
              <View style={[styles.divider, { backgroundColor: t.border }]} />
              <View style={styles.appearanceInner}>

                {/* Theme — horizontal scroll like UI styles */}
                <Text style={[styles.appearanceSectionLabel, { color: t.textMuted }]}>THEME</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeRow}>
                  {THEME_LIST.map(def => (
                    <ThemeCard
                      key={def.id}
                      def={def}
                      active={settings.themeName === def.id}
                      onPress={() => { haptic(); updateSetting('themeName', def.id as ThemePreset); }}
                    />
                  ))}
                </ScrollView>
                <Text style={[{ color: t.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 }]}>
                  {THEME_LIST.find(x => x.id === settings.themeName)?.desc}
                </Text>

                {/* UI Style — 6 cards in horizontal scroll */}
                <Text style={[styles.appearanceSectionLabel, { color: t.textMuted, marginTop: 22 }]}>UI STYLE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uiStyleRow}>
                  {UI_STYLES.map(style => (
                    <UIStyleCard
                      key={style.id}
                      style={style}
                      active={settings.uiStyle === style.id}
                      accent={t.accent}
                      onPress={() => { haptic(); updateSetting('uiStyle', style.id); }}
                    />
                  ))}
                </ScrollView>
                <Text style={[{ color: t.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 }]}>
                  {UI_STYLES.find(s => s.id === settings.uiStyle)?.desc}
                </Text>

                {/* Accent colour */}
                <Text style={[styles.appearanceSectionLabel, { color: t.textMuted, marginTop: 22 }]}>ACCENT COLOUR</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uiStyleRow}>
                  {ACCENT_PRESETS.map(preset => (
                    <AccentCard
                      key={String(preset.id)}
                      preset={preset}
                      active={settings.accentOverride === preset.id}
                      themeAccent={t.accent}
                      onPress={() => { haptic(); updateSetting('accentOverride', preset.id as string | null); }}
                    />
                  ))}
                </ScrollView>
                <Text style={[{ color: t.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 }]}>
                  {settings.accentOverride ? `Custom: ${settings.accentOverride}` : 'Using theme default'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ══════════ WALLPAPER ══════════ */}
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Sun size={18} color={settings.showWeather ? t.accent : t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>Weather Widget</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>Show weather under clock</Text>
              </View>
            </View>
            <Switch value={settings.showWeather} onValueChange={v => { haptic(); updateSetting('showWeather', v); }}
              trackColor={switchTrack(settings.showWeather, t.accent)}
              thumbColor={settings.showWeather ? t.accent : t.textMuted} />
          </View>

          {settings.showWeather && (
            <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
              <View style={styles.rowLeft}>
                <MapPin size={18} color={t.textMuted} />
                <View>
                  <Text style={[styles.rowLabel, { color: t.text }]}>City</Text>
                  <Text style={[styles.rowSub, { color: t.textMuted }]}>Leave empty to use GPS</Text>
                </View>
              </View>
              <TextInput
                value={settings.weatherCity || ''}
                onChangeText={v => updateSetting('weatherCity', v)}
                placeholder="e.g. Christchurch"
                placeholderTextColor={t.textMuted}
                style={[{
                  color: t.text, fontSize: 14, textAlign: 'right',
                  minWidth: 120, paddingVertical: 4,
                }]}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
          )}

        <SectionHeader title="WALLPAPER" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={[styles.row, { flexWrap: 'wrap', gap: 10 }]}>
            <View style={styles.rowLeft}>
              <Globe size={18} color={t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Home Wallpaper</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {wallpaperUri && (
                <Image source={{ uri: wallpaperUri }} style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: t.border }} />
              )}
              <Pressable onPress={handlePickWallpaper} style={[styles.wallpaperBtn, { backgroundColor: t.accent }]}>
                <Text style={{ color: t.bg, fontWeight: '600' as const, fontSize: 13 }}>
                  {wallpaperUri ? 'Change' : 'Choose'}
                </Text>
              </Pressable>
              {wallpaperUri && (
                <Pressable onPress={handleRemoveWallpaper} style={[styles.wallpaperBtn, { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }]}>
                  <Text style={{ color: t.textMuted, fontWeight: '600' as const, fontSize: 13 }}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ══════════ CONNECTIVITY ══════════ */}
        <SectionHeader title="CONNECTIVITY" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>

          {/* Wi-Fi */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Wifi size={18} color={settings.wifiEnabled ? t.teal : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Wi-Fi</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {settings.wifiEnabled && (
                <Pressable
                  onPress={() => { haptic(); const next = !showNetworks; setShowNetworks(next); if (next) handleScanWifi(); }}
                  hitSlop={10}
                  style={[styles.networksChip, { borderColor: showNetworks ? t.teal : t.border, backgroundColor: showNetworks ? t.teal + '18' : 'transparent' }]}
                >
                  {connectedSsid
                    ? <Text style={[styles.networksChipText, { color: t.teal }]} numberOfLines={1}>{connectedSsid}</Text>
                    : <Text style={[styles.networksChipText, { color: showNetworks ? t.teal : t.textMuted }]}>{showNetworks ? 'Hide' : 'Networks'}</Text>}
                  <ChevronDown size={12} color={connectedSsid || showNetworks ? t.teal : t.textMuted}
                    style={{ transform: [{ rotate: showNetworks ? '180deg' : '0deg' }] }} />
                </Pressable>
              )}
              <Switch value={settings.wifiEnabled} onValueChange={() => handleToggle('wifiEnabled')}
                trackColor={switchTrack(settings.wifiEnabled, t.teal)}
                thumbColor={settings.wifiEnabled ? t.teal : t.textMuted} />
            </View>
          </View>

          {settings.wifiEnabled && showNetworks && (
            <>
              <View style={[styles.divider, { backgroundColor: t.border }]} />
              <View style={styles.wifiNetworksSection}>
                <View style={styles.wifiScanHeader}>
                  <Text style={[styles.wifiSectionLabel, { color: t.textMuted }]}>AVAILABLE NETWORKS</Text>
                  <Pressable onPress={handleScanWifi} hitSlop={12} disabled={wifiScanning} style={styles.wifiRefreshBtn}>
                    {wifiScanning ? <ActivityIndicator size="small" color={t.teal} /> : <RefreshCw size={14} color={t.teal} />}
                  </Pressable>
                </View>
                {wifiNetworks.length === 0 && !wifiScanning && (
                  <Text style={[styles.wifiEmpty, { color: t.textMuted }]}>No networks found. Tap refresh to scan.</Text>
                )}
                {wifiNetworks.filter(n => !!n.ssid).map((net, idx) => (
                  <React.Fragment key={net.bssid + idx}>
                    {idx > 0 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                    <Pressable style={styles.wifiRow} onPress={() => handleConnectWifi(net)} disabled={connectingTo === net.ssid}>
                      <View style={styles.wifiRowLeft}>
                        <Wifi size={16} color={net.ssid === connectedSsid ? t.teal : t.textMuted}
                          style={{ opacity: net.level > -65 ? 1 : net.level > -75 ? 0.65 : 0.35 }} />
                        <View style={styles.wifiNameWrap}>
                          <Text style={[styles.wifiSsid, { color: net.ssid === connectedSsid ? t.teal : t.text }]}>{net.ssid}</Text>
                          <Text style={[styles.wifiStatus, { color: t.textMuted }]}>
                            {connectingTo === net.ssid ? 'Connecting…' : net.ssid === connectedSsid ? 'Connected' : net.secured ? 'Secured' : 'Open'}
                          </Text>
                        </View>
                      </View>
                      {connectingTo === net.ssid && <ActivityIndicator size="small" color={t.teal} />}
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>
            </>
          )}

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          {/* Bluetooth */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Bluetooth size={18} color={settings.bluetoothEnabled ? t.accent : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Bluetooth</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {settings.bluetoothEnabled && (
                <Pressable onPress={() => { haptic(); const next = !showBluetooth; setShowBluetooth(next); if (next) handleScanBt(); }}
                  hitSlop={10} style={[styles.networksChip, { borderColor: showBluetooth ? t.accent : t.border }]}>
                  <Text style={[styles.networksChipText, { color: showBluetooth ? t.accent : t.textMuted }]}>{showBluetooth ? 'Hide' : 'Devices'}</Text>
                  <ChevronDown size={12} color={showBluetooth ? t.accent : t.textMuted} style={{ transform: [{ rotate: showBluetooth ? '180deg' : '0deg' }] }} />
                </Pressable>
              )}
              <Switch value={settings.bluetoothEnabled} onValueChange={() => handleToggle('bluetoothEnabled')}
                trackColor={switchTrack(settings.bluetoothEnabled, t.accent)}
                thumbColor={settings.bluetoothEnabled ? t.accent : t.textMuted} />
            </View>
          </View>

          {settings.bluetoothEnabled && showBluetooth && (
            <>
              <View style={[styles.divider, { backgroundColor: t.border }]} />
              <View style={styles.btPanel}>
                <View style={styles.btDiscoverRow}>
                  <Text style={[styles.btDiscoverLabel, { color: t.textMuted }]}>Discoverable</Text>
                  <Switch value={btDiscoverable} onValueChange={handleBtDiscoverable}
                    trackColor={switchTrack(btDiscoverable, t.accent)} thumbColor={btDiscoverable ? t.accent : t.textMuted} />
                </View>
                {btScanning && <Text style={[styles.btScanningText, { color: t.textMuted }]}>Scanning…</Text>}
                {btDevices.map((dev, idx) => (
                  <React.Fragment key={dev.address}>
                    {idx > 0 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                    <View style={styles.btDeviceRow}>
                      <View style={styles.btDeviceLeft}>
                        <Bluetooth size={16} color={dev.paired ? t.accent : t.textMuted} />
                        <View>
                          <Text style={[styles.btDeviceName, { color: t.text }]}>{dev.name}</Text>
                          <Text style={[styles.btDeviceStatus, { color: t.textMuted }]}>{dev.paired ? 'Paired' : 'Available'}</Text>
                        </View>
                      </View>
                      <Text style={[styles.btDeviceRssi, { color: t.textMuted }]}>{dev.rssi} dBm</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </>
          )}

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          {/* Hotspot — collapsible */}
          <Pressable style={styles.row} onPress={() => setHotspotExpanded(v => !v)}>
            <View style={styles.rowLeft}>
              <Radio size={18} color={settings.hotspotEnabled ? '#F97316' : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Hotspot</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Switch value={settings.hotspotEnabled} onValueChange={handleHotspotToggle}
                trackColor={switchTrack(settings.hotspotEnabled, '#F97316')}
                thumbColor={settings.hotspotEnabled ? '#F97316' : t.textMuted} />
              <ChevronDown size={16} color={t.textMuted}
                style={{ transform: [{ rotate: hotspotExpanded ? '180deg' : '0deg' }] }} />
            </View>
          </Pressable>

          {hotspotExpanded && (
            <>
              <View style={[styles.divider, { backgroundColor: t.border }]} />
              <View style={styles.hotspotPanel}>
                <Text style={[styles.hotspotFieldLabel, { color: t.textMuted }]}>SSID</Text>
                <View style={[styles.hotspotInputRow, { borderColor: t.border, backgroundColor: t.bg }]}>
                  <TextInput value={hotspotSsid} onChangeText={setHotspotSsid}
                    style={[styles.hotspotInput, { color: t.text }]} placeholderTextColor={t.textMuted} />
                </View>
                <Text style={[styles.hotspotFieldLabel, { color: t.textMuted, marginTop: 10 }]}>PASSWORD</Text>
                <View style={[styles.hotspotInputRow, { borderColor: t.border, backgroundColor: t.bg }]}>
                  <TextInput value={hotspotPassword} onChangeText={setHotspotPassword}
                    secureTextEntry={!hotspotShowPass} placeholder="Leave blank for open network"
                    style={[styles.hotspotInput, { color: t.text }]} placeholderTextColor={t.textMuted} />
                  <Pressable onPress={() => setHotspotShowPass(v => !v)} hitSlop={10}>
                    {hotspotShowPass ? <EyeOff size={16} color={t.textMuted} /> : <Eye size={16} color={t.textMuted} />}
                  </Pressable>
                </View>
                <Pressable onPress={applyHotspotConfig} disabled={hotspotApplying}
                  style={[styles.hotspotApplyBtn, { backgroundColor: '#F97316' }]}>
                  {hotspotApplying
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.hotspotApplyText}>Apply</Text>}
                </Pressable>

                {/* Live info — only when hotspot is on */}
                {settings.hotspotEnabled && (
                  <View style={{ marginTop: 14, gap: 4 }}>
                    <View style={[styles.divider, { backgroundColor: t.border, marginBottom: 8 }]} />
                    <Text style={[styles.hotspotFieldLabel, { color: t.textMuted }]}>HOTSPOT STATUS</Text>
                    <Pressable style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6 }}
                      onPress={async () => {
                        haptic();
                        try {
                          const clients = await PresenceDeviceControl?.getHotspotClients?.();
                          if (!clients?.length) Alert.alert('Connected Devices', 'No devices currently connected.');
                          else Alert.alert(`Connected Devices (${clients.length})`, clients.map((c: any) => `${c.hostname ?? 'Unknown'}  ${c.ip}`).join('\n'));
                        } catch { Alert.alert('Connected Devices', 'Could not retrieve client list.'); }
                      }}>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>Connected devices</Text>
                      <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>Tap to view ›</Text>
                    </Pressable>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6 }}>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>Gateway IP</Text>
                      <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>192.168.43.1</Text>
                    </View>
                    <Pressable style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6 }}
                      onPress={() => {
                        haptic();
                        Alert.alert('Hotspot Band', 'Band selection requires Android 10+ and device support. Open system hotspot settings to change.',
                          [{ text: 'System Settings', onPress: () => PresenceDeviceControl?.openSpecialAccess?.('tethering') }, { text: 'OK' }]);
                      }}>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>Band</Text>
                      <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>2.4 / 5 GHz ›</Text>
                    </Pressable>
                    <Pressable style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6 }}
                      onPress={() => { haptic(); Alert.alert('Hotspot QR', `Share this credential string:\n\nWIFI:T:WPA;S:${hotspotSsid};P:${hotspotPassword};;\n\nQR display coming in next build.`); }}>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>Share via QR</Text>
                      <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>›</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </>
          )}



          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Signal size={18} color={settings.mobileDataEnabled ? '#38BDF8' : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Mobile Data</Text>
            </View>
            <Switch value={settings.mobileDataEnabled} onValueChange={() => handleToggle('mobileDataEnabled')}
              trackColor={switchTrack(settings.mobileDataEnabled, '#38BDF8')}
              thumbColor={settings.mobileDataEnabled ? '#38BDF8' : t.textMuted} />
          </View>

          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Nfc size={18} color={settings.nfcEnabled ? t.green : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>NFC</Text>
            </View>
            <Switch value={settings.nfcEnabled} onValueChange={() => handleToggle('nfcEnabled')}
              trackColor={switchTrack(settings.nfcEnabled, t.green)} thumbColor={settings.nfcEnabled ? t.green : t.textMuted} />
          </View>

          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Radio size={18} color={usbTetheringOn ? '#8B5CF6' : t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>USB Tethering</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>Share internet via USB cable</Text>
              </View>
            </View>
            <Switch value={usbTetheringOn} onValueChange={handleUsbTetheringToggle}
              trackColor={switchTrack(usbTetheringOn, '#8B5CF6')}
              thumbColor={usbTetheringOn ? '#8B5CF6' : t.textMuted} />
          </View>
        </View>

        <SectionHeader title="PRESENCE SERVER" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Globe size={18} color={settings.serverUrl ? t.teal : t.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: t.text }]}>Relay Server URL</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>
                  {settings.serverUrl ? settings.serverUrl : 'Not configured'}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
            <View style={[styles.serverInput, { justifyContent: 'center', backgroundColor: t.bg, borderColor: t.border }]}>
              <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
                {settings.serverUrl ?? 'wss://relay.presenceos.app'}
              </Text>
            </View>
            <Pressable
              style={[styles.serverTestBtn, { backgroundColor: t.accentDim, borderColor: t.accent + '40' }]}
              onPress={async () => {
                haptic();
                const url = settings.serverUrl?.trim();
                if (!url) { Alert.alert('No URL', 'Enter a server URL first.'); return; }
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 5000);
                  const res = await fetch(url.replace(/\/+$/, '').replace(/^wss?:\/\//, 'https://').replace(/^ws:\/\//, 'http://') + '/health', {
                    signal: controller.signal,
                  });
                  clearTimeout(timer);
                  if (res.ok) {
                    Alert.alert('Connected ✓', 'Successfully reached the Presence relay server.');
                  } else {
                    Alert.alert('Server responded', `Status ${res.status} — check your URL.`);
                  }
                } catch (e: any) {
                  Alert.alert('Connection failed', e?.message === 'Aborted' ? 'Timed out after 5 seconds.' : (e?.message ?? 'Could not reach server.'));
                }
              }}
            >
              <Signal size={14} color={t.accent} />
              <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>Test Connection</Text>
            </Pressable>

            {/* TURN server — required for WebRTC calls on 4G/CGNAT */}
            <View style={[styles.divider, { backgroundColor: t.border, marginVertical: 6 }]} />
            <Text style={[styles.hotspotFieldLabel, { color: t.textMuted }]}>TURN SERVER (CALLS ON 4G)</Text>
            <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 8 }}>
              Required for PresenceChat calls over 4G/5G. Run coturn on your Alpine relay server.
            </Text>
            <View style={[styles.serverInput, { justifyContent: 'center', backgroundColor: t.bg, borderColor: t.border }]}>
              <Text style={{ color: t.textMuted, fontSize: 13 }} numberOfLines={1}>
                {settings.turnUrl ?? 'turn:relay.presenceos.app:3478'}
              </Text>
            </View>
            <TextInput
              value={settings.turnPassword ?? ''}
              onChangeText={(v) => updateSetting('turnPassword', v)}
              placeholder="TURN credential"
              placeholderTextColor={t.textMuted}
              secureTextEntry
              style={[styles.serverInput, { color: t.text, backgroundColor: t.bg, borderColor: t.border, marginTop: 6 }]}
            />
            <Pressable
              style={[styles.serverTestBtn, { backgroundColor: t.accentDim, borderColor: t.accent + '40', marginTop: 6 }]}
              onPress={async () => {
                haptic();
                const url      = settings.turnUrl?.trim();
                const username = settings.turnUsername ?? '';
                const password = settings.turnPassword ?? '';
                if (!url) { Alert.alert('No TURN URL', 'Enter a TURN URL first.'); return; }
                // Diagnostic mode: gather *all* candidates for ~12s and report a
                // full breakdown by type (host/srflx/relay) and address. This
                // reveals whether the server is unreachable, auth is wrong, or
                // a particular interface (cellular/wifi) is the failing one.
                const { RTCPeerConnection } = require('react-native-webrtc');
                let pc: any = null;
                const cands: { type: string; addr: string; raw: string }[] = [];
                const t0 = Date.now();
                let firstRelayMs = -1;
                let firstSrflxMs = -1;
                let iceErrors: string[] = [];
                try {
                  pc = new RTCPeerConnection({
                    iceServers: [{ urls: url, username, credential: password }],
                    iceCandidatePoolSize: 0,
                    iceTransportPolicy:   'all',
                  });
                  pc.createDataChannel('turn-test');
                  pc.addEventListener('icecandidate', (e: any) => {
                    const raw: string = e.candidate?.candidate ?? '';
                    if (!raw) return;
                    const m    = raw.match(/(\S+)\s+\d+\s+\S+\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\w+)/);
                    const type = m?.[4] ?? 'unknown';
                    const addr = m ? `${m[2]}:${m[3]}` : raw.slice(0, 60);
                    cands.push({ type, addr, raw });
                    const dt = Date.now() - t0;
                    if (type === 'relay' && firstRelayMs < 0) firstRelayMs = dt;
                    if (type === 'srflx' && firstSrflxMs < 0) firstSrflxMs = dt;
                  });
                  pc.addEventListener('icecandidateerror', (e: any) => {
                    iceErrors.push(`${e.errorCode ?? '?'} ${e.errorText ?? ''} (${e.url ?? ''})`.trim());
                  });
                  const offer = await pc.createOffer({ offerToReceiveAudio: true });
                  await pc.setLocalDescription(offer);
                  // Always wait the full window so we capture the complete
                  // candidate set for diagnostics — don't short-circuit on first
                  // relay (we want to see everything that arrived).
                  await new Promise<void>(resolve => setTimeout(resolve, 12000));

                  const counts = cands.reduce((a, c) => { a[c.type] = (a[c.type] ?? 0) + 1; return a; }, {} as Record<string, number>);
                  const summary = ['host', 'srflx', 'relay', 'prflx'].map(t => `${t}: ${counts[t] ?? 0}`).join('  ');
                  const relayLines = cands.filter(c => c.type === 'relay').slice(0, 4).map(c => `  ${c.addr}`).join('\n');
                  const srflxLines = cands.filter(c => c.type === 'srflx').slice(0, 4).map(c => `  ${c.addr}`).join('\n');
                  const hostLines  = cands.filter(c => c.type === 'host').slice(0, 4).map(c => `  ${c.addr}`).join('\n');
                  const errLines   = iceErrors.slice(0, 4).map(e => `  ${e}`).join('\n');

                  const verdict = firstRelayMs >= 0
                    ? `✓ TURN OK — first relay in ${firstRelayMs}ms`
                    : firstSrflxMs >= 0
                      ? '✗ STUN reached, TURN allocation failed (creds or UDP 3478 blocked)'
                      : counts.host
                        ? '✗ No public address — outbound UDP appears blocked'
                        : '✗ No candidates at all — WebRTC stack issue';

                  Alert.alert(
                    'TURN diagnostic',
                    [
                      verdict,
                      '',
                      `URL: ${url}`,
                      `User: ${username || '(empty)'}    Pwd: ${password ? `set (${password.length} chars)` : '(empty)'}`,
                      '',
                      `Candidates → ${summary}`,
                      relayLines && `\nRelay:\n${relayLines}`,
                      srflxLines && `\nSrflx (public):\n${srflxLines}`,
                      hostLines  && `\nHost (local):\n${hostLines}`,
                      errLines   && `\nICE errors:\n${errLines}`,
                    ].filter(Boolean).join('\n'),
                  );
                } catch (e: any) {
                  Alert.alert('TURN test threw', `${e?.message ?? String(e)}\n\nURL: ${url}\nUser: ${username || '(empty)'}`);
                } finally {
                  try { pc?.close(); } catch {}
                }
              }}
            >
              <Signal size={14} color={t.accent} />
              <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>Test TURN Server</Text>
            </Pressable>
          </View>
        </View>

        {/* ══════════ STORAGE ══════════ */}
        <SectionHeader title="STORAGE" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <Pressable style={styles.row} onPress={async () => {
            haptic();
            Alert.alert('Clear Browser Cache', 'This will remove all saved URLs, cookies, and cached pages.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: async () => {
                await AsyncStorage.multiRemove(['browser_last_url', 'browser_tabs']).catch(() => {});
                Alert.alert('Done', 'Browser cache cleared.');
              }},
            ]);
          }}>
            <View style={styles.rowLeft}>
              <Globe size={18} color={t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>Clear Browser Cache</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>Removes saved URLs, tabs and cookies</Text>
              </View>
            </View>
            <ChevronLeft size={16} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
        </View>

        {/* ══════════ DISPLAY ══════════ */}
        <SectionHeader title="DISPLAY" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={[styles.sliderRow]}>
            <View style={styles.sliderHeader}>
              <View style={styles.rowLeft}>
                <Sun size={18} color={t.textMuted} />
                <Text style={[styles.rowLabel, { color: t.text }]}>Brightness</Text>
              </View>
              <Text style={[styles.valueText, { color: t.textMuted }]}>{settings.brightness}%</Text>
            </View>
            <Slider style={styles.slider} minimumValue={0} maximumValue={100}
              value={settings.brightness} onValueChange={handleBrightnessChange}
              minimumTrackTintColor={t.accent} maximumTrackTintColor={t.border}
              thumbTintColor={t.accent} />
          </View>

          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Pressable style={styles.row} onPress={cycleTimeout}>
            <View style={styles.rowLeft}>
              <Clock size={18} color={t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Screen Timeout</Text>
            </View>
            <Text style={[styles.valueText, { color: t.accent }]}>{formatTimeout(settings.screenTimeout)}</Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Info size={18} color={settings.showBatteryPercentage ? t.accent : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Battery Percentage</Text>
            </View>
            <Switch
              value={settings.showBatteryPercentage}
              onValueChange={() => {
                haptic();
                const next = !settings.showBatteryPercentage;
                updateSetting('showBatteryPercentage', next);

              }}
              trackColor={switchTrack(settings.showBatteryPercentage, t.accent)}
              thumbColor={settings.showBatteryPercentage ? t.accent : t.textMuted}
            />
          </View>
        </View>

        {/* ══════════ NOTIFICATIONS ══════════ */}
        <SectionHeader title="NOTIFICATIONS" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Bell size={18} color={settings.notificationsEnabled ? t.accent : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Notifications</Text>
            </View>
            <Switch value={settings.notificationsEnabled} onValueChange={() => handleToggle('notificationsEnabled')}
              trackColor={switchTrack(settings.notificationsEnabled, t.accent)}
              thumbColor={settings.notificationsEnabled ? t.accent : t.textMuted} />
          </View>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Moon size={18} color={settings.doNotDisturb ? t.red : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Do Not Disturb</Text>
            </View>
            <Switch value={settings.doNotDisturb} onValueChange={() => handleToggle('doNotDisturb')}
              trackColor={switchTrack(settings.doNotDisturb, t.red)} thumbColor={settings.doNotDisturb ? t.red : t.textMuted} />
          </View>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Vibrate size={18} color={settings.hapticFeedback ? t.accent : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Haptic Feedback</Text>
            </View>
            <Switch value={settings.hapticFeedback} onValueChange={() => handleToggle('hapticFeedback')}
              trackColor={switchTrack(settings.hapticFeedback, t.accent)}
              thumbColor={settings.hapticFeedback ? t.accent : t.textMuted} />
          </View>
          {settings.hapticFeedback && (
            <View style={styles.hapticPillRow}>
              {(['Light','Medium','Heavy'] as const).map(level => (
                <Pressable key={level}
                  style={[styles.hapticPill, { borderColor: t.accent, backgroundColor: t.accentDim }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle[level]); }}>
                  <Text style={[styles.hapticPillLabel, { color: t.accent }]}>{level}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ══════════ PHONE ══════════ */}
        <SectionHeader title="PHONE" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Phone size={18} color={t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>Country Calling Code</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>Applied to local numbers when dialling</Text>
              </View>
            </View>
            <TextInput
              value={settings.defaultCallingCode ?? '+64'}
              onChangeText={v => updateSetting('defaultCallingCode', v)}
              placeholder="+64"
              placeholderTextColor={t.textMuted}
              keyboardType="phone-pad"
              style={[{
                color: t.text, fontSize: 16, fontWeight: '500' as const,
                textAlign: 'right', minWidth: 64, paddingVertical: 4,
              }]}
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>
        </View>

        {/* ══════════ SECURITY ══════════ */}
        <SectionHeader title="SECURITY" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Lock size={18} color={settings.autoLock ? t.green : t.textMuted} />
              <Text style={[styles.rowLabel, { color: t.text }]}>Auto-Lock</Text>
            </View>
            <Switch value={settings.autoLock} onValueChange={() => handleToggle('autoLock')}
              trackColor={switchTrack(settings.autoLock, t.green)} thumbColor={settings.autoLock ? t.green : t.textMuted} />
          </View>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Pressable style={styles.row} onPress={openPinChange}>
            <View style={styles.rowLeft}>
              <Key size={18} color={t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>Screen PIN</Text>
                <Text style={[{ fontSize: 11, color: t.textMuted, marginTop: 1 }]}>
                  {user.screenPin ? 'Change PIN' : 'Set a PIN'}
                </Text>
              </View>
            </View>
            <ChevronLeft size={16} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
        </View>

        {/* ══════════ SYSTEM / ABOUT — collapsible with defaults + permissions ══════════ */}
        <SectionHeader title="SYSTEM" t={t} />
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth }]}>
          {/* About System — navigates to dedicated screen */}
          <Pressable style={styles.row} onPress={() => { haptic(); onNavigate?.('/system-info'); }}>
            <View style={styles.rowLeft}>
              <Info size={18} color={t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>About System</Text>
                <Text style={[{ fontSize: 11, color: t.textMuted, marginTop: 1 }]}>
                  {settings.developerMode ? 'Developer mode active' : 'PresenceOS Beta 6'}
                </Text>
              </View>
            </View>
            <ChevronLeft size={16} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>
          {settings.developerMode && (<>
          <View style={[styles.divider, { backgroundColor: t.border }]} />

          {/* Apps & Permissions — developer only */}
          <Pressable
            style={styles.row}
            onPress={() => { haptic(); setDefaultsExpanded(x => !x); }}
          >
            <View style={styles.rowLeft}>
              <ShieldCheck size={18} color={t.textMuted} />
              <View>
                <Text style={[styles.rowLabel, { color: t.text }]}>Apps & Permissions</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]}>Default apps, access & permissions</Text>
              </View>
            </View>
            <ChevronDown size={16} color={t.textMuted} style={defaultsExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </Pressable>
          {defaultsExpanded && (
            <View style={[styles.subSection, { borderTopColor: t.border }]}>
              {/* Default Apps sub-header */}
              <Text style={[styles.subSectionHeader, { color: t.textMuted }]}>DEFAULT APPS</Text>
              {[
                { label: 'Phone / Dialer', icon: Phone, action: () => PresenceDeviceControl?.openDefaultDialerChooser?.() },
                { label: 'Default Launcher', icon: Home, action: () => PresenceDeviceControl?.openDefaultHomeChooser?.() },
                { label: 'Default Browser', icon: Globe, action: () => PresenceDeviceControl?.openDefaultBrowserChooser?.() },
                { label: 'Default SMS App', icon: MessageSquare, action: () => PresenceDeviceControl?.requestSmsRole?.() },
              ].map((item, idx, arr) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.label}>
                    <Pressable style={[styles.row, styles.subRow]} onPress={() => { haptic(); item.action(); }}>
                      <View style={styles.rowLeft}>
                        <Icon size={16} color={t.textMuted} />
                        <Text style={[styles.rowLabel, { color: t.text, fontSize: 14 }]}>{item.label}</Text>
                      </View>
                      <ChevronLeft size={14} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
                    </Pressable>
                    {idx < arr.length - 1 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                  </React.Fragment>
                );
              })}

              {/* Special Access sub-header */}
              <View style={[styles.divider, { backgroundColor: t.border, marginTop: 6, marginBottom: 2 }]} />
              <Text style={[styles.subSectionHeader, { color: t.textMuted, marginTop: 8 }]}>SPECIAL ACCESS & PERMISSIONS</Text>
              {[
                { label: 'Do Not Disturb Access',      type: 'dnd' },
                { label: 'All Files Access',            type: 'all_files' },
                { label: 'Draw Over Apps',              type: 'overlay' },
                { label: 'Modify System Settings',      type: 'write_settings' },
                { label: 'Device Admin',                type: 'device_admin' },
                { label: 'App Permissions',             type: 'app_permissions' },
                { label: 'Notification Access',         type: 'notification_access' },
              ].map((item, idx, arr) => (
                <React.Fragment key={item.type}>
                  <Pressable style={[styles.row, styles.subRow]} onPress={() => {
                    haptic();
                    if (item.type === 'device_admin') {
                      PresenceDeviceControl?.requestDeviceAdmin?.();
                    } else if (item.type === 'app_permissions') {
                      Linking.openSettings();
                    } else {
                      PresenceDeviceControl?.openSpecialAccess(item.type);
                    }
                  }}>
                    <View style={styles.rowLeft}>
                      <ShieldCheck size={16} color={t.textMuted} />
                      <Text style={[styles.rowLabel, { color: t.text, fontSize: 14 }]}>{item.label}</Text>
                    </View>
                    <ChevronLeft size={14} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
                  </Pressable>
                  {idx < arr.length - 1 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                </React.Fragment>
              ))}
            </View>
          )}
          </>)}
          <View style={[styles.divider, { backgroundColor: t.border }]} />
          <Pressable style={styles.row} onPress={() => {
            Alert.alert('Factory Reset', 'This will erase all PresenceOS settings and data, then reboot the device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset & Reboot', style: 'destructive', onPress: async () => {
                await AsyncStorage.clear();
                Alert.alert('Rebooting in 3 seconds…', 'Release all apps. Device will restart.');
                setTimeout(async () => {
                  try {
                    await reboot('');
                  } catch {
                    Alert.alert('Reset complete', 'Data cleared. Please restart the device manually.');
                  }
                }, 3000);
              }},
            ]);
          }}>
            <View style={styles.rowLeft}>
              <RotateCcw size={18} color={t.red} />
              <Text style={[styles.rowLabel, { color: t.red }]}>Factory Reset</Text>
            </View>
            <Text style={[styles.valueText, { color: t.red, opacity: 0.6 }]}>Erase all data</Text>
          </Pressable>
        </View>

        <View style={styles.about}>
          <Text style={[styles.aboutText, { color: t.textMuted }]}>PresenceOS Beta 6</Text>
          <Text style={[styles.aboutSub,  { color: t.textMuted }]}>be here now</Text>
        </View>
      </ScrollView>

      {/* WiFi password modal */}
      <Modal visible={!!passwordTarget} transparent animationType="fade" onRequestClose={() => setPasswordTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Connect to "{passwordTarget?.ssid}"</Text>
            <TextInput value={passwordValue} onChangeText={setPasswordValue} placeholder="Password"
              secureTextEntry autoFocus returnKeyType="done" onSubmitEditing={handlePasswordConnect}
              style={[styles.modalInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
              placeholderTextColor={t.textMuted} />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: t.border }]}
                onPress={() => { setPasswordTarget(null); setPasswordValue(''); }}>
                <Text style={[styles.modalBtnTxt, { color: t.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConnectBtn, { backgroundColor: t.teal }]} onPress={handlePasswordConnect}>
                <Text style={[styles.modalBtnTxt, { color: t.bg }]}>Connect</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {onBack && <BottomBackBar onBack={onBack} />}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const CARD_GAP = 10;

const styles = StyleSheet.create({
  container:      { flex: 1 },
  header:         { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn:        { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  scrollContent:  { paddingHorizontal: 20, paddingBottom: 96 },
  sectionHeader:  { fontSize: 11, fontWeight: '600' as const, letterSpacing: 2, marginTop: 24, marginBottom: 10, marginLeft: 4 },

  // Card
  card:           { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  rowLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel:       { fontSize: 15, fontWeight: '400' as const },
  rowSub:         { fontSize: 12, marginTop: 2 },
  usbChip:        { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  usbChipText:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1 },
  valueText:      { fontSize: 14 },
  divider:        { height: 1, marginLeft: 46 },
  subSection:     { borderTopWidth: StyleSheet.hairlineWidth },
  subRow:         { paddingLeft: 32 },
  subSectionHeader: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2, paddingHorizontal: 32, paddingTop: 10, paddingBottom: 4 },
  accentDot:      { width: 10, height: 10, borderRadius: 5 },

  // Appearance
  appearanceInner:       { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4 },
  appearanceSectionLabel:{ fontSize: 10, fontWeight: '600' as const, letterSpacing: 1.5, marginBottom: 10 },
  themeIconBadge:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  themeIconDot:          { width: 14, height: 14, borderRadius: 7 },

  // Theme grid
  themeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  themeRow:       { flexDirection: 'row', gap: CARD_GAP, paddingVertical: 4, paddingHorizontal: 2 },
  themeCard:      {
    width: 100,
    borderRadius: 14, borderWidth: 2,
    paddingBottom: 10, overflow: 'hidden',
    position: 'relative',
  },
  themeCardInner: {
    margin: 10, borderRadius: 8, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  themeCardDot:   { width: 10, height: 10, borderRadius: 5 },
  themeCardLine:  { height: 3, borderRadius: 2 },
  themeCardName:  { fontSize: 12, fontWeight: '600' as const, paddingHorizontal: 12, letterSpacing: 0.3 },
  themeCardCheck: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // UI Style cards
  uiStyleRow:     { flexDirection: 'row', gap: CARD_GAP, paddingVertical: 4, paddingHorizontal: 2 },
  uiStyleCard:    {
    width: 88, borderRadius: 14, borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', gap: 10,
    position: 'relative',
  },
  uiStylePreview: { height: 44, alignItems: 'center', justifyContent: 'center' },
  uiStyleName:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5 },
  uiStyleCheck:   { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // UI style mini previews
  previewBox:     { width: 24, height: 24, borderRadius: 6, borderWidth: 1 },
  previewCircle:  { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  previewHandH:   { position: 'absolute', width: 2.5, height: 11, bottom: 20, left: 18.75, borderRadius: 1, transform: [{ rotate: '-30deg' }] },
  previewHandM:   { position: 'absolute', width: 2, height: 14, bottom: 20, left: 19, borderRadius: 1, transform: [{ rotate: '60deg' }] },
  previewHandS:   { position: 'absolute', width: 1, height: 16, bottom: 20, left: 19.5, borderRadius: 1, transform: [{ rotate: '120deg' }] },
  previewCentre:  { position: 'absolute', width: 4, height: 4, borderRadius: 2, top: 18, left: 18 },
  previewDiamond: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  previewGeoLine: { height: 2, width: 28, borderRadius: 1 },

  // Wallpaper
  wallpaperBtn:   { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },

  // WiFi
  networksChip:     { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, maxWidth: 120 },
  networksChipText: { fontSize: 11, fontWeight: '600' as const, flexShrink: 1 },
  wifiNetworksSection: { paddingHorizontal: 16, paddingBottom: 8 },
  wifiScanHeader:   { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingTop: 10, paddingBottom: 6 },
  wifiSectionLabel: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 1.5 },
  wifiRefreshBtn:   { padding: 6 },
  wifiRow:          { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 11 },
  wifiRowLeft:      { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, flex: 1 },
  wifiNameWrap:     { flex: 1 },
  wifiSsid:         { fontSize: 14 },
  wifiStatus:       { fontSize: 11, marginTop: 2 },
  wifiEmpty:        { fontSize: 13, paddingVertical: 10, textAlign: 'center' as const },

  // Bluetooth
  btPanel:          { paddingHorizontal: 16, paddingBottom: 8 },
  btDiscoverRow:    { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 10 },
  btDiscoverLabel:  { fontSize: 13 },
  btScanningText:   { fontSize: 12, paddingBottom: 6, textAlign: 'center' as const },
  btDeviceRow:      { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 10 },
  btDeviceLeft:     { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, flex: 1 },
  btDeviceName:     { fontSize: 14 },
  btDeviceStatus:   { fontSize: 11, marginTop: 1 },
  btDeviceRssi:     { fontSize: 11 },

  // Hotspot
  hotspotPanel:     { paddingHorizontal: 16, paddingBottom: 12 },
  hotspotFieldLabel:{ fontSize: 10, fontWeight: '600' as const, letterSpacing: 1.5, marginBottom: 6 },
  hotspotInputRow:  { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 2 },
  hotspotInput:     { flex: 1, fontSize: 14, paddingVertical: 10 },
  hotspotApplyBtn:  { borderRadius: 10, paddingVertical: 10, alignItems: 'center' as const, marginTop: 12 },
  hotspotApplyText: { fontSize: 14, fontWeight: '600' as const, color: '#fff' },

  // Sliders
  sliderRow:        { paddingVertical: 10, paddingHorizontal: 16 },
  sliderHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slider:           { width: '100%', height: 36 },

  // PIN
  pinChangeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  pinIcon:          { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  pinStepTitle:     { fontSize: 20, fontWeight: '500' as const, marginBottom: 28 },
  pinDotsRow:       { flexDirection: 'row', gap: 16, marginBottom: 20 },
  pinDot:           { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  pinErrorText:     { fontSize: 13, marginBottom: 8 },
  pinHint:          { fontSize: 12, textAlign: 'center' as const, marginTop: 16, lineHeight: 18 },
  pinPad:           { gap: 10, marginTop: 10 },
  pinPadRow:        { flexDirection: 'row', gap: 10 },
  pinPadBtn:        { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pinPadBtnEmpty:   { width: 72, height: 72 },
  pinPadDigit:      { fontSize: 24, fontWeight: '300' as const },

  // Haptic
  hapticRow:        { flexDirection: 'row', gap: 8 },
  hapticBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  hapticBtnLabel:   { fontSize: 11, fontWeight: '600' as const },
  hapticPillRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  hapticPill:       { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  hapticPillLabel:  { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },

  // Modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 32 },
  modalCard:        { width: '100%' as unknown as number, borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  modalTitle:       { fontSize: 16, fontWeight: '500' as const },
  modalInput:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalBtns:        { flexDirection: 'row' as const, gap: 12 },
  modalCancelBtn:   { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' as const },
  modalConnectBtn:  { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' as const },
  modalBtnTxt:      { fontSize: 15, fontWeight: '500' as const },

  // About
  about:            { alignItems: 'center', marginTop: 40, gap: 4 },
  aboutText:        { fontSize: 12, letterSpacing: 1 },
  aboutSub:         { fontSize: 10, letterSpacing: 3, opacity: 0.5 },

  // Server
  serverInput:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  serverTestBtn:    { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 11 },

  // Accent colour cards
  accentCard: {
    width: 72, borderRadius: 14, borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center' as const, gap: 8, position: 'relative' as const,
  },
  accentSwatch: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' as const },
  accentSwatchDiag: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  accentName: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.4 },
  accentCheck: { position: 'absolute' as const, top: 5, right: 5, width: 12, height: 12, borderRadius: 6 },
});

// ── Route wrapper — used by Expo Router for /settings ─────────────────────────
export default function SettingsScreen() {
  const router = useRouter();
  return (
    <SettingsContent
      onBack={() => router.back()}
      onNavigate={(route) => router.push(route as never)}
    />
  );
}