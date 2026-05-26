import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, NativeModules,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, ChevronUp, ChevronDown, ChevronRight as ChevronRightIcon,
  Power, Volume2, VolumeX, Plus, Minus, Tv, SkipForward, SkipBack,
  Home, Menu, ArrowLeft,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TVRemoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const [isPoweredOn, setIsPoweredOn] = useState(true);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const lightHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleButton = useCallback((action: string) => {
    lightHaptic();
    console.log('[TVRemote]', action);
  }, [lightHaptic]);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>TV Remote</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.remoteBody}>
        {/* Power + Source */}
        <View style={styles.topRow}>
          <Pressable
            style={[styles.powerBtn, { backgroundColor: isPoweredOn ? '#E8545420' : t.surface, borderColor: isPoweredOn ? '#E85454' : t.border }]}
            onPress={() => { haptic(); setIsPoweredOn(!isPoweredOn); handleButton('power'); }}
          >
            <Power size={22} color={isPoweredOn ? '#E85454' : t.textMuted} />
          </Pressable>

          <Pressable
            style={[styles.funcBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('source')}
          >
            <Tv size={18} color={t.textSecondary} />
            <Text style={[styles.funcLabel, { color: t.textSecondary }]}>Source</Text>
          </Pressable>

          <Pressable
            style={[styles.funcBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('mute')}
          >
            <VolumeX size={18} color={t.textSecondary} />
            <Text style={[styles.funcLabel, { color: t.textSecondary }]}>Mute</Text>
          </Pressable>
        </View>

        {/* D-Pad */}
        <View style={styles.dpadContainer}>
          <Pressable
            style={[styles.dpadBtn, styles.dpadUp]}
            onPress={() => handleButton('up')}
          >
            <ChevronUp size={26} color={t.text} />
          </Pressable>

          <View style={styles.dpadMiddle}>
            <Pressable
              style={[styles.dpadBtn, styles.dpadLeft]}
              onPress={() => handleButton('left')}
            >
              <ChevronLeft size={26} color={t.text} />
            </Pressable>

            <Pressable
              style={[styles.dpadCenter, { backgroundColor: t.accent, borderColor: t.accent }]}
              onPress={() => { haptic(); handleButton('ok'); }}
            >
              <Text style={[styles.okText, { color: t.bg }]}>OK</Text>
            </Pressable>

            <Pressable
              style={[styles.dpadBtn, styles.dpadRight]}
              onPress={() => handleButton('right')}
            >
              <ChevronRightIcon size={26} color={t.text} />
            </Pressable>
          </View>

          <Pressable
            style={[styles.dpadBtn, styles.dpadDown]}
            onPress={() => handleButton('down')}
          >
            <ChevronDown size={26} color={t.text} />
          </Pressable>
        </View>

        {/* Navigation row */}
        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('back')}
          >
            <ArrowLeft size={18} color={t.textSecondary} />
            <Text style={[styles.navLabel, { color: t.textSecondary }]}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('home')}
          >
            <Home size={18} color={t.textSecondary} />
            <Text style={[styles.navLabel, { color: t.textSecondary }]}>Home</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('menu')}
          >
            <Menu size={18} color={t.textSecondary} />
            <Text style={[styles.navLabel, { color: t.textSecondary }]}>Menu</Text>
          </Pressable>
        </View>

        {/* Volume + Channel */}
        <View style={styles.volChanRow}>
          <View style={styles.volChanGroup}>
            <Text style={[styles.volChanLabel, { color: t.textMuted }]}>VOL</Text>
            <Pressable
              style={[styles.volChanBtn, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => handleButton('vol+')}
            >
              <Plus size={20} color={t.text} />
            </Pressable>
            <Pressable
              style={[styles.volChanBtn, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => handleButton('vol-')}
            >
              <Minus size={20} color={t.text} />
            </Pressable>
          </View>

          <View style={styles.volChanGroup}>
            <Text style={[styles.volChanLabel, { color: t.textMuted }]}>CH</Text>
            <Pressable
              style={[styles.volChanBtn, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => handleButton('ch+')}
            >
              <ChevronUp size={20} color={t.text} />
            </Pressable>
            <Pressable
              style={[styles.volChanBtn, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => handleButton('ch-')}
            >
              <ChevronDown size={20} color={t.text} />
            </Pressable>
          </View>
        </View>

        {/* Media controls */}
        <View style={styles.mediaRow}>
          <Pressable
            style={[styles.mediaBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('prev')}
          >
            <SkipBack size={18} color={t.textSecondary} />
          </Pressable>
          <Pressable
            style={[styles.mediaBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('play')}
          >
            <Text style={[styles.mediaLabel, { color: t.textSecondary }]}>Play/Pause</Text>
          </Pressable>
          <Pressable
            style={[styles.mediaBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => handleButton('next')}
          >
            <SkipForward size={18} color={t.textSecondary} />
          </Pressable>
        </View>

        {/* Connection info */}
        <View style={[styles.infoBar, { backgroundColor: t.accentDim, borderColor: t.accent + '20' }]}>
          <Text style={[styles.infoText, { color: t.textMuted }]}>
            IR blaster or network TV connection required. Configure TV IP in settings for network mode.
          </Text>
        </View>
      </View>
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
  remoteBody: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
  topRow: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 28 },
  powerBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  funcBtn: {
    flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, gap: 4,
  },
  funcLabel: { fontSize: 10, fontWeight: '500' as const, letterSpacing: 0.5 },
  dpadContainer: { alignItems: 'center', marginBottom: 24 },
  dpadBtn: { width: 64, height: 56, alignItems: 'center', justifyContent: 'center' },
  dpadUp: {},
  dpadDown: {},
  dpadLeft: {},
  dpadRight: {},
  dpadMiddle: { flexDirection: 'row', alignItems: 'center' },
  dpadCenter: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  okText: { fontSize: 16, fontWeight: '600' as const },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%' },
  navBtn: {
    flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexDirection: 'row', gap: 6,
  },
  navLabel: { fontSize: 12, fontWeight: '500' as const },
  volChanRow: { flexDirection: 'row', gap: 40, marginBottom: 24 },
  volChanGroup: { alignItems: 'center', gap: 8 },
  volChanLabel: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 2, marginBottom: 4 },
  volChanBtn: {
    width: 64, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  mediaRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 20 },
  mediaBtn: {
    flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  mediaLabel: { fontSize: 11, fontWeight: '500' as const },
  infoBar: {
    borderRadius: 12, padding: 12, borderWidth: 1, width: '100%',
  },
  infoText: { fontSize: 11, textAlign: 'center' as const, lineHeight: 16 },
});
