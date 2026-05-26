import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Switch,
  NativeModules,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Monitor, Speaker, Mouse, Keyboard, Usb, Wifi,
  ChevronRight, Smartphone, Flashlight, FlashlightOff, Volume2,
  Vibrate, Compass, Battery, Info, X,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Magnetometer } from 'expo-sensors';

interface ToolState {
  flashlight: boolean;
  btSpeaker: boolean;
  btMouse: boolean;
  btKeyboard: boolean;
  screenMirror: boolean;
}

export default function ToolsScreen() {
  const router = useRouter();
  const { activeTheme: t, settings } = useSettings();
  const [toolStates, setToolStates] = useState<ToolState>({
    flashlight: false,
    btSpeaker: false,
    btMouse: false,
    btKeyboard: false,
    screenMirror: false,
  });
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCompass, setShowCompass] = useState(false);
  const [compassHeading, setCompassHeading] = useState(0);
  const compassSubRef = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);

  // Compass magnetometer subscription
  useEffect(() => {
    if (!showCompass || Platform.OS === 'web') return;
    Magnetometer.setUpdateInterval(100);
    compassSubRef.current = Magnetometer.addListener(({ x, y }) => {
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      setCompassHeading(Math.round(angle));
    });
    return () => { compassSubRef.current?.remove(); };
  }, [showCompass]);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const toggleFlashlight = useCallback(async () => {
    haptic();
    if (Platform.OS === 'web') {
      setToolStates(prev => ({ ...prev, flashlight: !prev.flashlight }));
      return;
    }
    const newState = !toolStates.flashlight;
    // Try native torch control first (doesn't require camera permission)
    const { PresenceDeviceControl } = NativeModules;
    if (PresenceDeviceControl?.setTorch) {
      try {
        await PresenceDeviceControl.setTorch(newState);
        setToolStates(prev => ({ ...prev, flashlight: newState }));
        return;
      } catch { /* fall through to CameraView approach */ }
    }
    // Fallback: CameraView requires camera permission
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission Required', 'Allow camera access to use the torch.');
        return;
      }
    }
    setToolStates(prev => ({ ...prev, flashlight: newState }));
  }, [cameraPermission, haptic, requestCameraPermission, toolStates.flashlight]);

  const toggleTool = useCallback((tool: keyof ToolState) => {
    haptic();
    setToolStates(prev => {
      const newState = !prev[tool];
      console.log(`[Tools] ${tool} toggled to:`, newState);

      if ((tool === 'btSpeaker' || tool === 'btMouse' || tool === 'btKeyboard') && newState) {
        if (!settings.bluetoothEnabled) {
          Alert.alert(
            'Bluetooth Required',
            'Please enable Bluetooth in Settings to use this tool.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => router.push('/settings' as never) },
            ]
          );
          return prev;
        }

        const toolNames: Record<string, string> = {
          btSpeaker: 'Bluetooth Speaker',
          btMouse: 'Bluetooth Mouse',
          btKeyboard: 'Bluetooth Keyboard',
        };

        Alert.alert(
          `${toolNames[tool]} Mode`,
          `${toolNames[tool]} mode has been enabled. In a custom firmware build, this will advertise your device as a ${toolNames[tool]?.split(' ')[1].toLowerCase()} via Bluetooth HID.\n\nThis feature requires native Bluetooth HID profile support which will be available in the firmware build.`,
          [{ text: 'OK' }]
        );
      }

      if (tool === 'screenMirror' && newState) {
        Alert.alert(
          'USB Display Mode',
          'Connect your device via USB to use it as an external monitor. This requires:\n\n• USB-C DisplayPort Alt Mode support\n• Compatible cable and host device\n\nIn the firmware build, this will enable display input mode.',
          [{ text: 'OK' }]
        );
      }

      return { ...prev, [tool]: newState };
    });
  }, [haptic, settings.bluetoothEnabled, router]);

  const handleRemoteDevice = useCallback(() => {
    haptic();
    router.push('/remote' as never);
  }, [haptic, router]);

  const handleVibrate = useCallback((intensity: 'light' | 'medium' | 'heavy') => {
    if (Platform.OS === 'web') return;
    if (intensity === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (intensity === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const handleCompass = useCallback(() => {
    haptic();
    if (Platform.OS === 'web') {
      Alert.alert('Compass', 'Compass requires device sensors, available on physical devices.');
      return;
    }
    setShowCompass(true);
  }, [haptic]);

  const handleSoundTest = useCallback(() => {
    haptic();
    Alert.alert('Speaker Test', 'A sound test tone would play here. If you felt the haptic feedback, your device is responsive.');
  }, [haptic]);

  const compassDir = (deg: number) => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  if (showCompass) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <OSStatusBar />
        <View style={styles.header}>
          <Pressable onPress={() => setShowCompass(false)} style={styles.backBtn} hitSlop={12}>
            <ChevronLeft size={22} color={t.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: t.text }]}>Compass</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.compassContent}>
          <View style={[styles.compassRing, { borderColor: t.accent + '40' }]}>
            <View style={[styles.compassRingInner, { borderColor: t.border }]}>
              <View style={[styles.compassNeedle, { transform: [{ rotate: `${compassHeading}deg` }] }]}>
                <View style={[styles.needleNorth, { backgroundColor: t.red }]} />
                <View style={[styles.needleSouth, { backgroundColor: t.textMuted }]} />
              </View>
              <View style={[styles.compassCenter, { backgroundColor: t.accent }]} />
            </View>
          </View>
          <Text style={[styles.compassHeading, { color: t.text }]}>{compassHeading}°</Text>
          <Text style={[styles.compassDir, { color: t.accent }]}>{compassDir(compassHeading)}</Text>
          <View style={styles.compassCardinals}>
            {['N', 'E', 'S', 'W'].map(d => (
              <Text key={d} style={[styles.compassCardinalText, { color: t.textMuted }]}>{d}</Text>
            ))}
          </View>
          <Text style={[styles.compassHint, { color: t.textMuted }]}>
            Hold device flat and away from magnetic objects
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      {/* Hidden CameraView powers the real torch */}
      {toolStates.flashlight && Platform.OS !== 'web' && (
        <CameraView style={styles.hiddenCamera} facing="back" enableTorch={true} />
      )}
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Tools</Text>
        <View style={{ width: 32 }} />
      </View>

      <PhilosophyBanner screen="tools" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: t.accentDim, borderColor: t.accent + '30' }]}>
            <Usb size={28} color={t.accent} />
          </View>
          <Text style={[styles.heroTitle, { color: t.text }]}>Device Utilities</Text>
          <Text style={[styles.heroBody, { color: t.textMuted }]}>
            Transform your device into useful tools. Toggle features on and off as needed.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>QUICK TOOLS</Text>

        <View style={[styles.quickGrid]}>
          <Pressable
            style={[
              styles.quickTool,
              { backgroundColor: t.surface, borderColor: t.border },
              toolStates.flashlight && { borderColor: '#F97316', backgroundColor: '#F9731610' },
            ]}
            onPress={toggleFlashlight}
          >
            {toolStates.flashlight ? (
              <Flashlight size={24} color="#F97316" />
            ) : (
              <FlashlightOff size={24} color={t.textMuted} />
            )}
            <Text style={[styles.quickLabel, { color: toolStates.flashlight ? '#F97316' : t.textMuted }]}>
              Torch
            </Text>
            <View style={[styles.quickIndicator, { backgroundColor: toolStates.flashlight ? '#F97316' : t.border }]} />
          </Pressable>

          <Pressable
            style={[styles.quickTool, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleVibrate('medium')}
          >
            <Vibrate size={24} color={t.textSecondary} />
            <Text style={[styles.quickLabel, { color: t.textSecondary }]}>Vibrate</Text>
            <View style={[styles.quickIndicator, { backgroundColor: t.border }]} />
          </Pressable>

          <Pressable
            style={[styles.quickTool, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={handleSoundTest}
          >
            <Volume2 size={24} color={t.textSecondary} />
            <Text style={[styles.quickLabel, { color: t.textSecondary }]}>Speaker</Text>
            <View style={[styles.quickIndicator, { backgroundColor: t.border }]} />
          </Pressable>

          <Pressable
            style={[styles.quickTool, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={handleCompass}
          >
            <Compass size={24} color={t.textSecondary} />
            <Text style={[styles.quickLabel, { color: t.textSecondary }]}>Compass</Text>
            <View style={[styles.quickIndicator, { backgroundColor: t.border }]} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>BLUETOOTH TOOLS</Text>

        <View style={[styles.toolCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.toolIcon, { backgroundColor: '#E8549018' }]}>
            <Speaker size={22} color="#E85490" />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolTitle, { color: t.text }]}>Bluetooth Speaker</Text>
            <Text style={[styles.toolDesc, { color: t.textMuted }]}>
              Broadcast audio from another device through this phone's speaker
            </Text>
          </View>
          <Switch
            value={toolStates.btSpeaker}
            onValueChange={() => toggleTool('btSpeaker')}
            trackColor={{ false: t.border, true: '#E8549060' }}
            thumbColor={toolStates.btSpeaker ? '#E85490' : t.textMuted}
          />
        </View>

        <View style={[styles.toolCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.toolIcon, { backgroundColor: '#4ADE8018' }]}>
            <Mouse size={22} color="#4ADE80" />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolTitle, { color: t.text }]}>Bluetooth Mouse</Text>
            <Text style={[styles.toolDesc, { color: t.textMuted }]}>
              Use this touchscreen as a trackpad for a computer
            </Text>
          </View>
          <Switch
            value={toolStates.btMouse}
            onValueChange={() => toggleTool('btMouse')}
            trackColor={{ false: t.border, true: '#4ADE8060' }}
            thumbColor={toolStates.btMouse ? '#4ADE80' : t.textMuted}
          />
        </View>

        <View style={[styles.toolCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.toolIcon, { backgroundColor: '#E8A83818' }]}>
            <Keyboard size={22} color="#E8A838" />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolTitle, { color: t.text }]}>Bluetooth Keyboard</Text>
            <Text style={[styles.toolDesc, { color: t.textMuted }]}>
              Type on this device's keyboard to input on a paired computer
            </Text>
          </View>
          <Switch
            value={toolStates.btKeyboard}
            onValueChange={() => toggleTool('btKeyboard')}
            trackColor={{ false: t.border, true: '#E8A83860' }}
            thumbColor={toolStates.btKeyboard ? '#E8A838' : t.textMuted}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>DISPLAY & REMOTE</Text>

        <Pressable
          style={[
            styles.toolCard,
            { backgroundColor: t.surface, borderColor: t.border },
            toolStates.screenMirror && { borderColor: '#5B8DEF' },
          ]}
          onPress={() => toggleTool('screenMirror')}
        >
          <View style={[styles.toolIcon, { backgroundColor: '#5B8DEF18' }]}>
            <Monitor size={22} color="#5B8DEF" />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolTitle, { color: t.text }]}>USB Display Mode</Text>
            <Text style={[styles.toolDesc, { color: t.textMuted }]}>
              Use this device as a monitor for Xbox, PC or laptop via USB
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: toolStates.screenMirror ? '#5B8DEF' : t.border }]} />
        </Pressable>

        <Pressable
          style={[styles.toolCard, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={handleRemoteDevice}
        >
          <View style={[styles.toolIcon, { backgroundColor: '#8B5CF618' }]}>
            <Smartphone size={22} color="#8B5CF6" />
          </View>
          <View style={styles.toolInfo}>
            <Text style={[styles.toolTitle, { color: t.text }]}>Remote Device</Text>
            <Text style={[styles.toolDesc, { color: t.textMuted }]}>
              Access your other Android device remotely for full apps
            </Text>
          </View>
          <ChevronRight size={18} color={t.textMuted} />
        </Pressable>

        {(toolStates.btSpeaker || toolStates.btMouse || toolStates.btKeyboard || toolStates.screenMirror) && (
          <View style={[styles.activeCard, { backgroundColor: t.accentDim, borderColor: t.accent + '30' }]}>
            <Battery size={14} color={t.accent} />
            <Text style={[styles.activeText, { color: t.textSecondary }]}>
              {[
                toolStates.btSpeaker && 'BT Speaker',
                toolStates.btMouse && 'BT Mouse',
                toolStates.btKeyboard && 'BT Keyboard',
                toolStates.screenMirror && 'Display Mode',
              ].filter(Boolean).join(', ')} active. These features may increase battery usage.
            </Text>
          </View>
        )}

        <View style={[styles.tipCard, { backgroundColor: t.tealDim, borderColor: t.teal + '20' }]}>
          <Info size={14} color={t.teal} />
          <Text style={[styles.tipText, { color: t.textSecondary }]}>
            Bluetooth HID tools (speaker, mouse, keyboard) and USB display require the presenceOS custom firmware. These toggles track your preference and will activate automatically when running on firmware.
          </Text>
        </View>
      </ScrollView>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  heroSection: { alignItems: 'center', paddingVertical: 24 },
  heroIcon: {
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1,
  },
  heroTitle: { fontSize: 20, fontWeight: '600' as const, marginBottom: 8 },
  heroBody: { fontSize: 13, textAlign: 'center' as const, maxWidth: 280, lineHeight: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  quickGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  quickTool: {
    flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 16, borderWidth: 1, gap: 8,
  },
  quickLabel: { fontSize: 11, fontWeight: '500' as const },
  quickIndicator: { width: 6, height: 6, borderRadius: 3 },
  toolCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16,
    padding: 16, marginBottom: 10, borderWidth: 1,
  },
  toolIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolInfo: { flex: 1 },
  toolTitle: { fontSize: 15, fontWeight: '600' as const, marginBottom: 3 },
  toolDesc: { fontSize: 12, lineHeight: 17 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  activeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12,
    padding: 14, borderWidth: 1, marginTop: 6, marginBottom: 10,
  },
  activeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16,
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18 },
  hiddenCamera: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  compassContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 40 },
  compassRing: {
    width: 240, height: 240, borderRadius: 120, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  compassRingInner: {
    width: 200, height: 200, borderRadius: 100, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  compassNeedle: {
    width: 10, height: 160, alignItems: 'center', position: 'absolute',
  },
  needleNorth: { flex: 1, width: 6, borderRadius: 3 },
  needleSouth: { flex: 1, width: 6, borderRadius: 3 },
  compassCenter: { width: 14, height: 14, borderRadius: 7, position: 'absolute' },
  compassHeading: { fontSize: 48, fontWeight: '100' as const },
  compassDir: { fontSize: 22, fontWeight: '300' as const, letterSpacing: 4 },
  compassCardinals: { flexDirection: 'row', gap: 32 },
  compassCardinalText: { fontSize: 14, fontWeight: '600' as const },
  compassHint: { fontSize: 12, textAlign: 'center' as const, marginTop: 8, opacity: 0.6 },
});

