import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, NativeModules,
  AppState, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import {
  ChevronLeft, Phone as PhoneIcon, Delete, Building2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { PresenceDialer } = NativeModules;

const DIAL_PAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

const DIAL_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
};

function formatPhoneForDisplay(num: string): string {
  const digits = num.replace(/[^0-9+*#]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return digits.slice(0, 3) + ' ' + digits.slice(3);
  if (digits.length <= 10) return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
  return digits;
}

function toE164(num: string, callingCode: string): string {
  const stripped = num.replace(/[\s\-\(\)]/g, '');
  if (stripped.startsWith('+')) return stripped;
  if (stripped.startsWith('00')) return '+' + stripped.slice(2);
  // Local number: strip leading 0, prepend country calling code
  const local = stripped.startsWith('0') ? stripped.slice(1) : stripped;
  return callingCode + local;
}

export default function PhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ number?: string }>();
  const [isDefaultDialer, setIsDefaultDialer] = useState(false);
  useEffect(() => {
    const check = async () => {
      try {
        const def = await NativeModules.PresenceDeviceControl?.getDefaultDialerPackage?.();
        setIsDefaultDialer(def === 'com.presenceoslite');
      } catch { setIsDefaultDialer(false); }
    };
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
  const insets = useSafeAreaInsets();
  const { activeTheme: t, uiTokens: s, settings } = useSettings();
  const [number, setNumber] = useState(params.number ?? '');

  const handleDial = useCallback((digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber(prev => prev + digit);
  }, []);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber(prev => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (!number) return;
    const dialNumber = toE164(number, settings.defaultCallingCode || '+64');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // CellularCallOverlay picks up 'dialing'/'active' events from PresenceDialer
    if (PresenceDialer) {
      PresenceDialer.placeCall(dialNumber).catch((e: any) => {
        console.error('[Phone] placeCall failed:', e?.message);
      });
    }
  }, [number, settings.defaultCallingCode]);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      {/* Prompt to set as default dialer */}
      {!isDefaultDialer && (
        <Pressable
          style={{ backgroundColor: t.tealDim ?? t.accentDim, borderBottomWidth: 1, borderBottomColor: t.teal+'40',
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
          onPress={() => {
            if (NativeModules.PresenceDeviceControl?.openDefaultDialerChooser) {
              NativeModules.PresenceDeviceControl.openDefaultDialerChooser();
            } else { Linking.openSettings(); }
          }}
        >
          <PhoneIcon size={16} color={t.teal ?? t.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.teal ?? t.accent, fontSize: 13, fontWeight: '600' }}>Set PresenceOS as default Phone app</Text>
            <Text style={{ color: t.textMuted, fontSize: 11 }}>Required to make and receive calls</Text>
          </View>
          <Text style={{ color: t.teal ?? t.accent, fontSize: 12 }}>Set →</Text>
        </Pressable>
      )}
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Phone</Text>
        <Pressable onPressIn={() => router.push('/directory' as never)} hitSlop={12}>
          <Building2 size={20} color={t.textSecondary} />
        </Pressable>
      </View>

      <PhilosophyBanner screen="phone" />

      <View style={styles.numberDisplay}>
        <Text style={[styles.numberText, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {number ? formatPhoneForDisplay(number) : ' '}
        </Text>
      </View>

      <View style={styles.dialPad}>
        {DIAL_PAD.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.dialRow}>
            {row.map((digit) => (
              <Pressable
                key={digit}
                style={[styles.dialBtn, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusPill, borderWidth: s.borderWidth }]}
                onPress={() => handleDial(digit)}
                onLongPress={digit === '0' ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setNumber(prev => prev + '+');
                } : undefined}
              >
                <Text style={[styles.dialDigit, { color: t.text }]}>{digit}</Text>
                {DIAL_LETTERS[digit] && (
                  <Text style={[styles.dialLetters, { color: t.textMuted }]}>{DIAL_LETTERS[digit]}</Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={[styles.actionRow, { paddingBottom: insets.bottom + 20 }]}>
        <View style={{ width: 56 }} />
        <Pressable
          style={[styles.callBtn, { backgroundColor: t.green, borderRadius: s.radiusPill }, !number && styles.callBtnDisabled]}
          onPress={handleCall}
          disabled={!number}
        >
          <PhoneIcon size={28} color={t.white} />
        </Pressable>
        <Pressable
          style={styles.deleteBtn}
          onPress={handleDelete}
          onLongPress={() => setNumber('')}
          disabled={!number}
        >
          <Delete size={22} color={number ? t.textSecondary : t.textMuted} />
        </Pressable>
      </View>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  numberDisplay: { paddingHorizontal: 32, paddingVertical: 24, alignItems: 'center' },
  numberText: { fontSize: 34, fontWeight: '300' as const, letterSpacing: 2, minHeight: 42 },
  dialPad: { flex: 1, justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  dialRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dialBtn: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  dialDigit: { fontSize: 28, fontWeight: '300' as const },
  dialLetters: { fontSize: 9, fontWeight: '500' as const, letterSpacing: 2, marginTop: 1 },
  actionRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 36, paddingVertical: 16,
  },
  callBtn: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  callBtnDisabled: { opacity: 0.3 },
  deleteBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});

