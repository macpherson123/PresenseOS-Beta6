/**
 * system-info.tsx — About System screen
 * Shows device/build info, patent status, credits.
 * Tap the logo 10× to unlock Developer Options (separate screen).
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal,
  NativeModules, Alert, Animated, Platform,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ChevronLeft, ChevronRight, ShieldCheck, Terminal, Edit3, Check,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';

const { PresenceDeviceControl } = NativeModules;

function InfoRow({ label, value, t }: { label: string; value: string; t: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: t.text }]} selectable>{value}</Text>
    </View>
  );
}

const PRESENCE_SVG = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#0c0f14"/>
  <circle cx="256" cy="256" r="96" fill="none" stroke="#7fb3fa" stroke-width="10" stroke-linecap="round" stroke-dasharray="452 151" transform="rotate(90,256,256)"/>
  <circle cx="256" cy="256" r="136" fill="none" stroke="#4f8ef7" stroke-width="16" stroke-linecap="round" stroke-dasharray="641 214" transform="rotate(90,256,256)"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="#ffffff" stroke-width="46" stroke-linecap="round" stroke-dasharray="830 276" transform="rotate(90,256,256)"/>
  <circle cx="256" cy="256" r="20" fill="#ffffff"/>
  <line x1="256" y1="256" x2="330" y2="330" stroke="#4f8ef7" stroke-width="8" stroke-linecap="round" opacity="0.6"/>
  <circle cx="323" cy="323" r="10" fill="#4f8ef7" opacity="0.85"/>
</svg>`;

export default function SystemInfoScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { activeTheme: t, settings, updateSetting } = useSettings();
  const { user } = useUser();

  const [tapCount,     setTapCount]     = useState(0);
  const [showDevPass,  setShowDevPass]  = useState(false);
  const [devPassInput, setDevPassInput] = useState('');
  const DEV_PASSWORD = '12121212';
  const [editingName,  setEditingName]  = useState(false);
  const [deviceName,   setDeviceName]   = useState(settings.deviceAlias || Constants.deviceName || 'PresenceOS Phone');
  const [storageInfo,  setStorageInfo]  = useState<{ free: string; total: string } | null>(null);
  const [nodeVersion,  setNodeVersion]  = useState<string>('—');
  const [appSize,      setAppSize]      = useState<string>('—');

  const tapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale     = useRef(new Animated.Value(1)).current;
  const rotation  = useRef(new Animated.Value(0)).current;
  const glow      = useRef(new Animated.Value(0)).current;

  const buildDate  = Constants.expoConfig?.extra?.buildDate ?? '2025-04-19';
  const appVersion = 'Beta 6';

  // Load storage info
  useEffect(() => {
    (async () => {
      try {
        const free  = await FileSystem.getFreeDiskStorageAsync();
        const total = await FileSystem.getTotalDiskCapacityAsync();
        const fmt = (n: number) => n > 1e9 ? `${(n/1e9).toFixed(1)} GB` : `${(n/1e6).toFixed(0)} MB`;
        setStorageInfo({ free: fmt(free), total: fmt(total) });
      } catch {}
      try {
        const PS = NativeModules.PresenceSystem;
        const result = PS?.getNodeVersion
          ? await PS.getNodeVersion()
          : await PresenceDeviceControl?.getNodeVersion?.();
        if (result) setNodeVersion(result);
      } catch {}
      try {
        const PS = NativeModules.PresenceSystem;
        const info = PS?.getPackageInfo
          ? await PS.getPackageInfo()
          : await PresenceDeviceControl?.getPackageInfo?.();
        if (info?.appSize) setAppSize(info.appSize);
      } catch {}
    })();
  }, []);

  // Animated logo tap
  const handleLogoTap = useCallback(() => {
    // Bounce + spin
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale,    { toValue: 0.82, duration: 60,  useNativeDriver: true }),
        Animated.timing(rotation, { toValue: tapCount % 2 === 0 ? 1 : -1, duration: 80, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(scale,    { toValue: 1, useNativeDriver: true, tension: 400, friction: 8 }),
        Animated.spring(rotation, { toValue: 0, useNativeDriver: true, tension: 300, friction: 10 }),
      ]),
    ]).start();

    const next = tapCount + 1;
    setTapCount(next);

    if (next >= 5) {
      // Glow builds up
      Animated.timing(glow, { toValue: Math.min(1, (next - 4) / 6), duration: 200, useNativeDriver: false }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { setTapCount(0); Animated.timing(glow, { toValue: 0, duration: 400, useNativeDriver: false }).start(); }, 2500);

    if (next >= 10) {
      setTapCount(0);
      Animated.timing(glow, { toValue: 0, duration: 600, useNativeDriver: false }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (settings.developerMode) {
        // Already on — 10 taps to DISABLE
        Alert.alert('Disable Developer Mode', 'This will hide developer options.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disable', style: 'destructive', onPress: () => {
            updateSetting('developerMode', false);
            Alert.alert('Developer Mode Disabled', 'Developer options are now hidden.');
          }},
        ]);
      } else {
        // Not on — show password prompt
        setDevPassInput('');
        setShowDevPass(true);
      }
    }
  }, [tapCount, scale, rotation, glow, updateSetting]);

  const spin = rotation.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-15deg', '0deg', '15deg'] });

  const saveDeviceName = () => {
    setEditingName(false);
    updateSetting('deviceAlias', deviceName);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>About System</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Animated logo ── */}
        <Pressable onPress={handleLogoTap} style={{ alignItems: 'center', marginVertical: 28 }}>
          <Animated.View style={{
            transform: [{ scale }, { rotate: spin }],
          }}>
            <Animated.View style={{
              width: 90, height: 90, borderRadius: 22,
              borderWidth: 2,
              borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: [t.border, t.accent] }),
              shadowColor: t.accent,
              shadowOpacity: glow as any,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 0 },
              overflow: 'hidden',
            }}>
              <SvgXml xml={PRESENCE_SVG} width={86} height={86} />
            </Animated.View>
          </Animated.View>
          <Text style={[styles.version, { color: t.text }]}>PresenceOS {appVersion}</Text>
          {tapCount >= 5 && tapCount < 10 && (
            <Text style={{ color: t.accent, fontSize: 11, marginTop: 4 }}>
              {10 - tapCount} more tap{10 - tapCount !== 1 ? 's' : ''} to {settings.developerMode ? 'disable' : 'unlock'} dev mode
            </Text>
          )}
        </Pressable>

        {/* ── Device identity ── */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>DEVICE</Text>

          {/* Editable device name */}
          <View style={[styles.infoRow]}>
            <Text style={[styles.infoLabel, { color: t.textMuted }]}>Device Name</Text>
            {editingName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', maxWidth: '50%' as any }}>
                <TextInput
                  value={deviceName}
                  onChangeText={setDeviceName}
                  style={[styles.nameInput, { color: t.text, borderColor: t.accent, backgroundColor: t.bg, flex: 1 }]}
                  autoFocus
                  onSubmitEditing={saveDeviceName}
                  returnKeyType="done"
                />
                <Pressable onPress={saveDeviceName} hitSlop={8}>
                  <Check size={16} color={t.green} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingName(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', maxWidth: '50%' as any }}>
                <Text style={[styles.infoValue, { color: t.text, textAlign: 'right' }]} numberOfLines={1}>{deviceName}</Text>
                <Edit3 size={12} color={t.textMuted} />
              </Pressable>
            )}
          </View>

          <InfoRow label="Build Date"     value={buildDate}     t={t} />
          <InfoRow label="Node Version"   value={nodeVersion}   t={t} />
          <InfoRow label="Storage Free"   value={storageInfo ? `${storageInfo.free} of ${storageInfo.total}` : '—'} t={t} />
          <InfoRow label="P2P Storage"    value="Disabled (future feature)" t={t} />
          <InfoRow label="PresenceOS Size" value={appSize}      t={t} />
        </View>

        {/* ── Credits ── */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>CREDITS</Text>
          <InfoRow label="Built by"      value="Paul Unlocks · New Zealand" t={t} />
        </View>

        {/* ── Patent status ── */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={14} color={t.accent} />
            <Text style={[styles.sectionLabel, { color: t.textMuted, marginBottom: 0 }]}>PATENT STATUS</Text>
          </View>
          <InfoRow label="PresenceOS P2P Backups"       value="Provisional Submitted" t={t} />
          <InfoRow label="PresenceOS NFC Contact Flow"  value="Provisional Submitted" t={t} />
        </View>

        {/* ── Developer Options — inline, shown only when dev mode active ── */}
        {settings.developerMode && (
          <View style={[styles.card, { backgroundColor: t.accentDim, borderColor: t.accent + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Terminal size={16} color={t.accent} />
              <Text style={{ color: t.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1.5 }}>DEVELOPER OPTIONS</Text>
            </View>
            <Pressable
              style={[styles.devActionRow, { borderColor: t.accent + '30' }]}
              onPressIn={() => router.push('/developer' as never)}
            >
              <Text style={{ color: t.accent, fontSize: 15, flex: 1 }}>Developer Settings</Text>
              <ChevronRight size={16} color={t.accent} />
            </Pressable>
            <Pressable
              style={[styles.devActionRow, { borderColor: t.accent + '30', borderBottomWidth: 0 }]}
              onPress={() => {
                Alert.alert('Disable Developer Mode', 'This will hide developer options.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disable', style: 'destructive', onPress: () => {
                    updateSetting('developerMode', false);
                  }},
                ]);
              }}
            >
              <Text style={{ color: '#FF453A', fontSize: 15, flex: 1 }}>Disable Developer Mode</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
      {/* ── Dev password modal ── */}
      <Modal visible={showDevPass} transparent animationType="fade" onRequestClose={() => setShowDevPass(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Developer Mode</Text>
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 14, textAlign: 'center' }}>
              Enter password to unlock developer options
            </Text>
            <TextInput
              value={devPassInput}
              onChangeText={setDevPassInput}
              placeholder="Password"
              secureTextEntry
              autoFocus
              keyboardType="number-pad"
              returnKeyType="done"
              placeholderTextColor={t.textMuted}
              style={[styles.modalInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
              onSubmitEditing={() => {
                if (devPassInput === DEV_PASSWORD) {
                  updateSetting('developerMode', true);
                  setShowDevPass(false);
                  setDevPassInput('');
                  Alert.alert('Developer Mode Enabled', 'Developer options are now visible below.');
                } else {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  Alert.alert('Incorrect Password', 'Try again.');
                  setDevPassInput('');
                }
              }}
            />
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalBtn, { borderColor: t.border }]}
                onPress={() => { setShowDevPass(false); setDevPassInput(''); }}
              >
                <Text style={{ color: t.textMuted, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: t.accent, borderColor: t.accent }]}
                onPress={() => {
                  if (devPassInput === DEV_PASSWORD) {
                    updateSetting('developerMode', true);
                    setShowDevPass(false);
                    setDevPassInput('');
                    Alert.alert('Developer Mode Enabled', 'Developer options are now visible below.');
                  } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    Alert.alert('Incorrect Password', 'Try again.');
                    setDevPassInput('');
                  }
                }}
              >
                <Text style={{ color: t.bg, fontWeight: '600' }}>Unlock</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:        { fontSize: 17, fontWeight: '600' as const },
  scroll:       { padding: 20, gap: 14, paddingBottom: 96 },
  version:      { fontSize: 18, fontWeight: '300' as const, marginTop: 10, letterSpacing: 0.5 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2, marginBottom: 2 },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 32, paddingVertical: 2 },
  infoLabel:    { fontSize: 13, flexShrink: 0, maxWidth: '50%' as any },
  infoValue:    { fontSize: 13, fontWeight: '500' as const, textAlign: 'right' as const, flex: 1, flexWrap: 'wrap' as const, maxWidth: '50%' as any },
  nameInput:    { fontSize: 13, fontWeight: '500' as const, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 140 },
  devRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  devActionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:    { width: '100%' as any, borderRadius: 20, borderWidth: 1, padding: 24, gap: 10 },
  modalTitle:   { fontSize: 18, fontWeight: '600' as const, textAlign: 'center' as const },
  modalInput:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn:     { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' as const },
});
