import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, AppState, AppStateStatus,
  StatusBar as RNStatusBar, BackHandler, Platform, PermissionsAndroid,
  NativeModules, DeviceEventEmitter,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { ContactsProvider } from "@/contexts/ContactsContext";
import { MusicProvider } from "@/contexts/MusicContext";
import * as Haptics from "expo-haptics";
import { Delete } from "lucide-react-native";
import { useRouter } from "expo-router";
import CellularCallOverlay from "@/components/CellularCallOverlay";
import { PresenceNetProvider, usePresenceNet } from "@/contexts/PresenceNetContext";
import PowerButtonHandler from "@/components/PowerButtonHandler";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const PIN_LENGTH = 6; // 6-digit PIN throughout presenceOS

function PinLockOverlay() {
  const { user, verifyPin, unlockApp } = useUser();
  const { activeTheme: t } = useSettings();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleDigit = useCallback((digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      return prev + digit;
    });
  }, []);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin(prev => prev.slice(0, -1));
    setError('');
  }, []);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    if (verifyPin(pin)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      unlockApp();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Incorrect PIN');
      setPin('');
    }
  }, [pin, verifyPin, unlockApp]);

  return (
    <View style={[lockStyles.overlay, { backgroundColor: t.bg }]}>
      <View style={lockStyles.inner}>
        <Text style={[lockStyles.title, { color: t.text }]}>
          {user.screenPin ? 'Enter PIN to unlock' : 'presenceOS'}
        </Text>

        <View style={lockStyles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                lockStyles.dot,
                { borderColor: t.border },
                i < pin.length && { backgroundColor: t.accent, borderColor: t.accent },
              ]}
            />
          ))}
        </View>

        {error ? <Text style={[lockStyles.error, { color: t.red }]}>{error}</Text> : null}

        {user.screenPin ? (
          <View style={lockStyles.pad}>
            {[['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']].map((row, ri) => (
              <View key={ri} style={lockStyles.padRow}>
                {row.map((d, di) => {
                  if (d === '') return <View key={di} style={lockStyles.padBtnEmpty} />;
                  if (d === 'del') return (
                    <Pressable key={di} style={lockStyles.padBtn} onPress={handleDelete}>
                      <Delete size={20} color={t.textSecondary} />
                    </Pressable>
                  );
                  return (
                    <Pressable
                      key={di}
                      style={[lockStyles.padBtn, { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1 }]}
                      onPress={() => handleDigit(d)}
                    >
                      <Text style={[lockStyles.padDigit, { color: t.text }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : (
          <Pressable
            style={[lockStyles.unlockBtn, { backgroundColor: t.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); unlockApp(); }}
          >
            <Text style={[lockStyles.unlockBtnText, { color: t.bg }]}>Unlock</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function CallNavigator() {
  const { callState } = usePresenceNet();
  const router = useRouter();
  const prevStatus = useRef<string>('idle');

  // Pre-request media permissions on mount so they're ready before any call starts.
  // On Android, if permissions are requested mid-call-setup the async delay can cause
  // the PC to fail before getUserMedia resolves.
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ]).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const prev = prevStatus.current;
    const cur = callState.status;
    prevStatus.current = cur;
    if (cur !== 'idle' && prev === 'idle') {
      router.push('/video-call' as never);
    }
  }, [callState.status, router]);
  return null;
}

function RootLayoutNav() {
  const { activeTheme: t, settings } = useSettings();
  const { isAppLocked, user, lockApp } = useUser();
  const { callState } = usePresenceNet();
  const router = useRouter();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track cellular call activity so PIN overlay is suppressed during any call.
  // VoIP activity is tracked via callState.status from PresenceNetContext.
  const [isCellularCallActive, setIsCellularCallActive] = useState(false);

  useEffect(() => {
    const incomingSub = DeviceEventEmitter.addListener('incomingCall', () => {
      setIsCellularCallActive(true);
    });
    const stateSub = DeviceEventEmitter.addListener('callStateChanged', (e: { state: string }) => {
      const active = ['ringing', 'dialing', 'connecting', 'active'].includes(e.state);
      setIsCellularCallActive(active);
    });
    return () => { incomingSub.remove(); stateSub.remove(); };
  }, []);

  const isAnyCallActive = isCellularCallActive || callState.status !== 'idle';

  // ── Inactivity → screen off + PIN lock ─────────────────────────────────────
  // Settings screenTimeout is in seconds. On every touch, reset the timer.
  // When it elapses: lockApp() (so the PIN overlay is up) and try to actually
  // turn the screen off via root (PresenceSystem.goToSleep). The system-side
  // screen_off_timeout from Settings.System is also kept in sync from the
  // settings screen, but JS-side enforcement is what guarantees PIN entry.
  const resetInactivity = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!user.screenPin || isAppLocked) return;
    const ms = Math.max(5, settings.screenTimeout) * 1000;
    inactivityTimerRef.current = setTimeout(() => {
      lockApp();
      const PS = NativeModules.PresenceSystem;
      PS?.goToSleep?.().catch?.(() => {});
    }, ms);
  }, [settings.screenTimeout, user.screenPin, isAppLocked, lockApp]);

  useEffect(() => {
    resetInactivity();
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [resetInactivity]);

  // ── Launcher blank-screen fix ──────────────────────────────────────────────
  // When PresenceOS is the home launcher, Android back gesture has no target.
  // Intercept it and always navigate to /home instead of exiting or going blank.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try { router.replace('/home' as never); } catch { /* already on home */ }
      return true; // always consume — never let Android handle it
    });
    return () => sub.remove();
  }, [router]);

  // ── Background lock timer ──────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        // Screen going off — lock immediately if PIN is set
        if (user.screenPin && !lockTimerRef.current) {
          lockTimerRef.current = setTimeout(() => {
            lockApp();
            lockTimerRef.current = null;
          }, 500); // small delay to avoid false triggers on quick task switches
        }
      } else if (next === 'active') {
        if (lockTimerRef.current) {
          clearTimeout(lockTimerRef.current);
          lockTimerRef.current = null;
        }
      }
      appStateRef.current = next;
    });
    return () => {
      sub.remove();
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [lockApp, user.screenPin]);

  return (
    <View
      style={{ flex: 1, backgroundColor: t.bg }}
      onStartShouldSetResponderCapture={() => { resetInactivity(); return false; }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" hidden translucent />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.bg },
            animation: 'slide_from_right',
            animationDuration: 80,
            gestureEnabled: true,
            gestureDirection: 'horizontal',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="home" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_left' }} />
          <Stack.Screen name="messages" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="contacts" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="music" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="phone" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="browser" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="tools" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="navigation-screen" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="companion" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="remote" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="guardian" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="directory" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="camera" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="companion-app" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="sms" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="system-info" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="developer" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="alarm" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="files" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notes" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="nfc-pair"   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="video-call"  options={{ animation: 'slide_from_right' }} />
        </Stack>
        {isAppLocked && user.hasCompletedOnboarding && !isAnyCallActive && <PinLockOverlay />}
        <CellularCallOverlay />
        <CallNavigator />
        <PowerButtonHandler />
      </GestureHandlerRootView>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 20, paddingHorizontal: 40 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  lockEmoji: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: '400' as const, letterSpacing: 0.5 },
  dotsRow: { flexDirection: 'row', gap: 18, marginVertical: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  error: { fontSize: 13 },
  pad: { gap: 12 },
  padRow: { flexDirection: 'row', gap: 12 },
  padBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  padBtnEmpty: { width: 72, height: 72 },
  padDigit: { fontSize: 24, fontWeight: '300' as const },
  unlockBtn: { borderRadius: 16, paddingVertical: 16, paddingHorizontal: 48, marginTop: 12 },
  unlockBtnText: { fontSize: 16, fontWeight: '600' as const },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    RNStatusBar.setHidden(true, 'none');
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <SettingsProvider>
            <ContactsProvider>
              <MusicProvider>
                <PresenceNetProvider>
                <RootLayoutNav />
              </PresenceNetProvider>
              </MusicProvider>
            </ContactsProvider>
          </SettingsProvider>
        </UserProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
