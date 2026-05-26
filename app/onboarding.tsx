import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, User, Shield, Smartphone, Lock, Delete, Globe, Signal } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import PresenceKeyboard from '@/components/PresenceKeyboard';

const PIN_LENGTH = 6;

// ── PinPad defined OUTSIDE the component so React doesn't see a new type each render ──
interface PinPadProps {
  onDigit: (d: string) => void;
  onDelete: () => void;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
}

function PinPad({ onDigit, onDelete, surface, border, text, textSecondary }: PinPadProps) {
  return (
    <View style={pp.pad}>
      {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, ri) => (
        <View key={ri} style={pp.row}>
          {row.map((d, di) => {
            if (d === '') return <View key={di} style={pp.empty} />;
            if (d === 'del') return (
              <Pressable key={di} style={pp.btn} onPress={onDelete} hitSlop={8}>
                <Delete size={22} color={textSecondary} />
              </Pressable>
            );
            return (
              <Pressable
                key={di}
                style={[pp.btn, { backgroundColor: surface, borderColor: border, borderWidth: 1 }]}
                onPress={() => onDigit(d)}
                hitSlop={4}
              >
                <Text style={[pp.digit, { color: text }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const pp = StyleSheet.create({
  pad:   { gap: 14, marginTop: 20 },
  row:   { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  btn:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { width: 72, height: 72 },
  digit: { fontSize: 28, fontWeight: '300' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, completeOnboarding } = useUser();
  const { activeTheme: t, updateSetting } = useSettings();
  const insets = useSafeAreaInsets();

  const [step,       setStep]       = useState(0);
  const [username,   setUsername]   = useState('');
  const [serverUrl,  setServerUrl]  = useState('wss://presenceos.qzz.io');
  const [serverOk,   setServerOk]   = useState<boolean | null>(null); // null=checking, true=ok, false=fail
  const [pin,        setPin]        = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError,   setPinError]   = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Auto-ping default server on mount
  React.useEffect(() => {
    const pingServer = async (url: string) => {
      if (!url.trim()) return;
      setServerOk(null);
      try {
        const httpUrl = url.replace(/^wss?:\/\//, 'https://').replace(/\/$/, '');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${httpUrl}/socket.io/?EIO=4&transport=polling`, { signal: controller.signal });
        clearTimeout(timer);
        setServerOk(res.ok || res.status === 400);
      } catch {
        setServerOk(false);
      }
    };
    pingServer(serverUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animateStep = useCallback((next: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  // ── PIN digit entry ──────────────────────────────────────────────────────
  const handleDigit = useCallback((digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 5) {
      setPin(prev => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) {
          setPinError('');
          setTimeout(() => animateStep(6), 220);
        }
        return next;
      });
    } else if (step === 6) {
      setConfirmPin(prev => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) setPinError('');
        return next;
      });
    }
  }, [step, animateStep]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 5) setPin(prev => prev.slice(0, -1));
    else if (step === 6) setConfirmPin(prev => prev.slice(0, -1));
  }, [step]);

  // ── Continue / Confirm button ────────────────────────────────────────────
  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < 3) {
      animateStep(step + 1);
      return;
    }
    if (step === 3) {
      // server URL step — save and proceed
      const url = serverUrl.trim();
      if (url) updateSetting('serverUrl', url);
      animateStep(4);
      return;
    }
    if (step === 4) {
      // username step — go to PIN creation
      animateStep(5);
      return;
    }
    if (step === 5) {
      if (pin.length < PIN_LENGTH) { setPinError('PIN must be 6 digits'); return; }
      setPinError('');
      animateStep(6);
      return;
    }
    if (step === 6) {
      if (confirmPin !== pin) {
        setPinError('PINs do not match');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setConfirmPin('');
        return;
      }
      setPinError('');
      const name = username.trim() || `user_${user.userId.slice(-4).toLowerCase()}`;
      completeOnboarding(name, undefined, pin);
      setTimeout(() => router.replace('/home' as never), 50);
    }
  }, [step, username, serverUrl, pin, confirmPin, user.userId, animateStep, completeOnboarding, router, updateSetting]);

  // Skip PIN — go straight to home with no PIN set
  const handleSkipPin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const name = username.trim() || `user_${user.userId.slice(-4).toLowerCase()}`;
    const url = serverUrl.trim();
    if (url) updateSetting('serverUrl', url);
    completeOnboarding(name, undefined, undefined);
    setTimeout(() => router.replace('/home' as never), 50);
  }, [username, serverUrl, user.userId, completeOnboarding, router, updateSetting]);

  // Auto-submit when confirm PIN is fully entered. Keeps the pad rock-steady —
  // no button pops up under the last digit.
  useEffect(() => {
    if (step !== 6 || confirmPin.length !== PIN_LENGTH) return;
    if (confirmPin !== pin) {
      setPinError('PINs do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setConfirmPin('');
      return;
    }
    setPinError('');
    const name = username.trim() || `user_${user.userId.slice(-4).toLowerCase()}`;
    completeOnboarding(name, undefined, pin);
    setTimeout(() => router.replace('/home' as never), 50);
  }, [confirmPin, step, pin, username, user.userId, completeOnboarding, router]);

  // ── Step content ─────────────────────────────────────────────────────────
  const INFO_STEPS = [
    {
      icon: <Shield size={40} color={t.accent} />,
      title: 'Welcome to presenceOS',
      body: 'A distraction-free environment built for real human connection. No social media. No algorithms. No ads. Just presence.',
    },
    {
      icon: <Smartphone size={40} color={t.teal} />,
      title: 'Your Device, Simplified',
      body: "Everything you need, nothing you don't. Messages, calls, music, navigation — all designed to keep you present and focused.",
    },
    {
      icon: <User size={40} color={t.accent} />,
      title: 'Connect via NFC',
      body: 'To add a friend, simply tap your devices together. No phone numbers, no social handles. Real connection starts with physical presence.',
    },
  ];

  const canProceed = () => {
    if (step === 3) return true; // server URL is optional
    if (step === 4) return username.trim().length > 0;
    if (step === 5) return pin.length === PIN_LENGTH;
    if (step === 6) return confirmPin.length === PIN_LENGTH;
    return true;
  };

  const buttonLabel = () => {
    if (step < 3)  return 'Continue';
    if (step === 3) return serverUrl.trim() ? 'Continue' : 'Skip for Now';
    if (step === 4) return 'Set Up PIN';
    if (step === 5) return 'Next';
    return 'Enter presenceOS';
  };

  // Dots for current pin display
  const renderPinDots = (value: string, fillColor: string) => (
    <View style={styles.pinDotsRow}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pinDot,
            { borderColor: t.border },
            i < value.length && { backgroundColor: fillColor, borderColor: fillColor },
          ]}
        />
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: t.bg, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress dots */}
      <View style={styles.progress}>
        {[0,1,2,3,4,5,6].map(i => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: t.border }, i <= step && { backgroundColor: t.accent }]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

          {/* ── Info slides 0-2 ── */}
          {step < 3 && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                {INFO_STEPS[step].icon}
              </View>
              <Text style={[styles.title, { color: t.text }]}>{INFO_STEPS[step].title}</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>{INFO_STEPS[step].body}</Text>
            </>
          )}

          {/* ── Server URL step ── */}
          {step === 3 && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Globe size={40} color={t.teal} />
              </View>
              <Text style={[styles.title, { color: t.text }]}>Presence Server</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>
                Enter your relay server URL to enable contact syncing, messaging and calls. You can set this later in Settings.
              </Text>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: t.textMuted }]}>SERVER URL</Text>
                <View style={[styles.inputDisplay, { backgroundColor: t.surface, borderColor: serverOk === true ? t.green : serverOk === false ? t.red : t.border }]}>
                  <Text style={[styles.inputDisplayText, { color: t.text, flex: 1 }]} numberOfLines={1}>
                    {serverUrl}
                  </Text>
                  {/* Live status dot */}
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: serverOk === null ? t.accent : serverOk ? t.green : t.red,
                    marginLeft: 8, opacity: serverOk === null ? 0.5 : 1,
                  }} />
                </View>
                <Text style={{ color: serverOk === true ? t.green : serverOk === false ? t.red : t.textMuted, fontSize: 11, marginTop: 4 }}>
                  {serverOk === null ? 'Checking server…' : serverOk ? '● Server reachable' : '● Cannot reach server'}
                </Text>
              </View>
              <Pressable
                style={[styles.serverTest, { backgroundColor: t.accentDim, borderColor: t.accent + '40' }]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const url = serverUrl.trim();
                  if (!url) { Alert.alert('No URL', 'Enter a server URL to test.'); return; }
                  try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 5000);
                    const res = await fetch(url.replace(/\/$/, '') + '/socket.io/?EIO=4&transport=polling', { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok || res.status === 400) {
                      setServerOk(true);
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
            </>
          )}

          {/* ── Username / identity step ── */}
          {step === 4 && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                <User size={40} color={t.green} />
              </View>
              <Text style={[styles.title, { color: t.text }]}>Create Your Identity</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>
                Your user ID is permanent. Choose a username that feels like you.
              </Text>
              <View style={[styles.idCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.idLabel, { color: t.textMuted }]}>USER ID</Text>
                <Text style={[styles.idValue, { color: t.accent }]}>{user.userId}</Text>
              </View>
              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: t.textMuted }]}>USERNAME</Text>
                <View style={[styles.inputDisplay, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.inputDisplayText, { color: username ? t.text : t.textMuted }]} numberOfLines={1}>
                    {username || 'choose a username'}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ── Create PIN ── */}
          {step === 5 && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Lock size={40} color={t.accent} />
              </View>
              <Text style={[styles.title, { color: t.text }]}>Create Screen PIN</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>
                Set a 6-digit PIN to secure your device.
              </Text>
              {renderPinDots(pin, t.accent)}
              {pinError ? <Text style={[styles.pinError, { color: t.red }]}>{pinError}</Text> : null}
              <PinPad
                onDigit={handleDigit}
                onDelete={handleDelete}
                surface={t.surface}
                border={t.border}
                text={t.text}
                textSecondary={t.textSecondary}
              />
              <Pressable style={styles.skipBtn} onPress={handleSkipPin} hitSlop={8}>
                <Text style={[styles.skipText, { color: t.textSecondary }]}>Skip — set up PIN later in Settings</Text>
              </Pressable>
            </>
          )}

          {/* ── Confirm PIN ── */}
          {step === 6 && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Lock size={40} color={t.green} />
              </View>
              <Text style={[styles.title, { color: t.text }]}>Confirm PIN</Text>
              <Text style={[styles.body, { color: t.textSecondary }]}>
                Re-enter your 6-digit PIN to confirm.
              </Text>
              {renderPinDots(confirmPin, t.green)}
              {pinError ? <Text style={[styles.pinError, { color: t.red }]}>{pinError}</Text> : null}
              <PinPad
                onDigit={handleDigit}
                onDelete={handleDelete}
                surface={t.surface}
                border={t.border}
                text={t.text}
                textSecondary={t.textSecondary}
              />
            </>
          )}

        </Animated.View>
      </ScrollView>

      {/* PresenceKeyboard for server URL (step 3) and username (step 4) */}
      {step === 3 && (
        <PresenceKeyboard
          value={serverUrl}
          onChange={(v) => { setServerUrl(v); setServerOk(false); }}
        />
      )}
      {step === 4 && (
        <PresenceKeyboard
          value={username}
          onChange={(v) => setUsername(v.slice(0, 24))}
        />
      )}

      {/* Continue button — hidden during PIN entry. PIN steps auto-advance. */}
      {step < 5 && (
        <Pressable
          style={[styles.button, { backgroundColor: t.accent }, !canProceed() && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={!canProceed()}
        >
          <Text style={[styles.buttonText, { color: t.bg }]}>{buttonLabel()}</Text>
          <ChevronRight size={18} color={t.bg} />
        </Pressable>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, paddingHorizontal: 24 },
  progress:     { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 40 },
  dot:          { width: 20, height: 3, borderRadius: 2 },
  scrollContent:{ flexGrow: 1, justifyContent: 'center' },
  content:      { alignItems: 'center' },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32, borderWidth: 1,
  },
  title:        { fontSize: 24, fontWeight: '600', textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  body:         { fontSize: 15, lineHeight: 24, textAlign: 'center', maxWidth: 320, marginBottom: 32 },
  idCard:       { borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginBottom: 24, borderWidth: 1 },
  idLabel:      { fontSize: 10, fontWeight: '600', letterSpacing: 3, marginBottom: 8 },
  idValue:      { fontSize: 22, fontWeight: '700', letterSpacing: 2 },
  inputWrap:    { width: '100%' },
  inputLabel:   { fontSize: 10, fontWeight: '600', letterSpacing: 3, marginBottom: 10 },
  input:        { borderRadius: 14, padding: 16, fontSize: 17, borderWidth: 1 },
  inputDisplay: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 18, borderWidth: 1, width: '100%' },
  inputDisplayText: { fontSize: 17, letterSpacing: 0.2 },
  pinDotsRow:   { flexDirection: 'row', gap: 14, marginBottom: 16 },
  pinDot:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  pinError:     { fontSize: 13, marginTop: 4, marginBottom: 8 },
  skipBtn:      { marginTop: 24, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'center' },
  skipText:     { fontSize: 13, textDecorationLine: 'underline' },
  serverTest:   { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 13, marginTop: 8, width: '100%' as any },
  button: {
    borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText:   { fontSize: 16, fontWeight: '600' },
});
