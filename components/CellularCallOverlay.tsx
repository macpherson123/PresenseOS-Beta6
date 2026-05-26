/**
 * CellularCallOverlay — root-level persistent call UI.
 *
 * Modes:
 *   idle       → nothing rendered
 *   ringing    → fullscreen incoming call overlay
 *   dialing    → fullscreen outgoing overlay
 *   active     → fullscreen in-call UI  OR  minimized floating banner
 *
 * Back button during active call minimizes to banner instead of blocking navigation.
 * Tapping the banner re-expands to fullscreen.
 * Hangup from either mode ends the call and returns to phone screen.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Modal,
  DeviceEventEmitter, Vibration, NativeModules, BackHandler,
} from 'react-native';
import {
  Phone, PhoneOff, User, Mic, MicOff, Volume2, VolumeX,
  CirclePause, Hash, ChevronDown,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/contexts/SettingsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const { PresenceDialer } = NativeModules;

type CallPhase  = 'idle' | 'ringing' | 'dialing' | 'active';
type ViewMode   = 'fullscreen' | 'minimized';

interface CallState {
  phase:       CallPhase;
  phoneNumber: string;
  contactName: string;
  duration:    number;
  isMuted:     boolean;
  isSpeaker:   boolean;
  isHeld:      boolean;
  showPad:     boolean;
}

const IDLE: CallState = {
  phase: 'idle', phoneNumber: '', contactName: '',
  duration: 0, isMuted: false, isSpeaker: false, isHeld: false, showPad: false,
};

const DIAL_PAD = [['1','2','3'],['4','5','6'],['7','8','9'],['*','0','#']];
const DIAL_LETTERS: Record<string, string> = {
  '2':'ABC','3':'DEF','4':'GHI','5':'JKL',
  '6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ',
};

function fmt(n: number) {
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}

export default function CellularCallOverlay() {
  const { activeTheme: t, uiTokens: s } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cs,       setCs]       = useState<CallState>(IDLE);
  const [viewMode, setViewMode] = useState<ViewMode>('fullscreen');

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const vibRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(-80)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stopVib = useCallback(() => {
    Vibration.cancel();
    if (vibRef.current) { clearInterval(vibRef.current); vibRef.current = null; }
  }, []);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const showBanner = useCallback(() => {
    Animated.spring(bannerAnim, { toValue: 0, useNativeDriver: true, tension: 220, friction: 22 }).start();
  }, [bannerAnim]);

  const hideBanner = useCallback(() => {
    Animated.timing(bannerAnim, { toValue: -80, duration: 220, useNativeDriver: true }).start();
  }, [bannerAnim]);

  const minimize = useCallback(() => {
    setViewMode('minimized');
    showBanner();
  }, [showBanner]);

  const expand = useCallback(() => {
    setViewMode('fullscreen');
    hideBanner();
  }, [hideBanner]);

  const dismiss = useCallback(() => {
    stopTimer(); stopVib(); stopPulse();
    hideBanner();
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => { setCs(IDLE); setViewMode('fullscreen'); });
  }, [fadeAnim, stopTimer, stopVib, stopPulse, hideBanner]);

  const showOverlay = useCallback((phase: CallPhase, phoneNumber: string, contactName = '') => {
    setCs(prev => ({ ...IDLE, phase, phoneNumber, contactName,
      isMuted: prev.isMuted, isSpeaker: prev.isSpeaker }));
    setViewMode('fullscreen');
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    stopPulse();
    pulseLoop.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ]));
    pulseLoop.current.start();
  }, [fadeAnim, pulseAnim, stopPulse]);

  const goActive = useCallback((phoneNumber?: string) => {
    stopVib();
    setCs(prev => ({ ...prev, phase: 'active', phoneNumber: phoneNumber || prev.phoneNumber, duration: 0 }));
    stopPulse();
    timerRef.current = setInterval(() => setCs(p => ({ ...p, duration: p.duration + 1 })), 1000);
  }, [stopVib, stopPulse]);

  // Back button: ringing/dialing → decline; active+fullscreen → minimize; minimized → ignore
  useEffect(() => {
    if (cs.phase === 'idle') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cs.phase === 'ringing' || cs.phase === 'dialing') {
        // Allow back to dismiss outgoing dial, decline incoming
        return false;
      }
      if (cs.phase === 'active') {
        if (viewMode === 'fullscreen') {
          minimize();
          return true; // consumed — go to home with banner
        }
        return false; // already minimized, let navigation happen
      }
      return false;
    });
    return () => sub.remove();
  }, [cs.phase, viewMode, minimize]);

  // Vibrate while ringing
  useEffect(() => {
    if (cs.phase === 'ringing') {
      vibRef.current = setInterval(() => Vibration.vibrate([0, 400, 200, 400]), 2000);
      return () => stopVib();
    }
  }, [cs.phase, stopVib]);

  // Native events
  useEffect(() => {
    const incomingSub = DeviceEventEmitter.addListener(
      'incomingCall',
      (e: { phoneNumber: string; contactName?: string }) => {
        showOverlay('ringing', e.phoneNumber, e.contactName);
      }
    );
    const stateSub = DeviceEventEmitter.addListener(
      'callStateChanged',
      (e: { state: string; phoneNumber?: string }) => {
        switch (e.state) {
          case 'ringing':     showOverlay('ringing', e.phoneNumber ?? ''); break;
          case 'dialing':
          case 'connecting':  showOverlay('dialing', e.phoneNumber ?? ''); break;
          case 'active':      goActive(e.phoneNumber); break;
          case 'disconnected':
          case 'ended':       dismiss(); break;
        }
      }
    );
    return () => {
      incomingSub.remove();
      stateSub.remove();
      stopVib();
      stopTimer();
    };
  }, [showOverlay, goActive, dismiss, stopVib, stopTimer]);

  // Actions
  const answerCall = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopVib();
    PresenceDialer?.answerCall?.().catch(console.warn);
    goActive();
  }, [stopVib, goActive]);

  const declineCall = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    PresenceDialer?.endCall?.().catch(console.warn);
    dismiss();
  }, [dismiss]);

  const endCall = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    PresenceDialer?.endCall?.().catch(console.warn);
    dismiss();
    // Return to phone numpad
    try { router.push('/phone' as never); } catch {}
  }, [dismiss, router]);

  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCs(prev => { const next = !prev.isMuted; PresenceDialer?.setMuted?.(next).catch(console.warn); return { ...prev, isMuted: next }; });
  }, []);

  const toggleSpeaker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCs(prev => { const next = !prev.isSpeaker; PresenceDialer?.setSpeaker?.(next).catch(console.warn); return { ...prev, isSpeaker: next }; });
  }, []);

  const toggleHold = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCs(prev => { const next = !prev.isHeld; PresenceDialer?.setOnHold?.(next).catch(console.warn); return { ...prev, isHeld: next }; });
  }, []);

  if (cs.phase === 'idle') return null;

  const displayName = cs.contactName || cs.phoneNumber || 'Unknown';
  const isRinging   = cs.phase === 'ringing';
  const isDialing   = cs.phase === 'dialing';
  const isActive    = cs.phase === 'active';
  const isMinimized = viewMode === 'minimized';

  return (
    <>
      {/* ── Full-screen overlay ─────────────────────────────────────────── */}
      {!isMinimized && (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
          <Animated.View style={[S.root, { backgroundColor: t.bg, opacity: fadeAnim }]}>
            {/* Top bar */}
            <View style={[S.topBar, { backgroundColor: t.surface, borderBottomColor: t.border, paddingTop: insets.top + 12 }]}>
              <Text style={[S.topLabel, { color: t.textMuted }]}>
                {isRinging ? 'INCOMING CALL' : isDialing ? 'CALLING…' : fmt(cs.duration)}
              </Text>
              {/* Minimize button — only during active calls */}
              {isActive && (
                <Pressable onPress={minimize} style={S.minimizeBtn} hitSlop={12}>
                  <ChevronDown size={18} color={t.textMuted} />
                  <Text style={{ color: t.textMuted, fontSize: 10, letterSpacing: 0.5 }}>HOME</Text>
                </Pressable>
              )}
            </View>

            {/* Centre */}
            <View style={S.center}>
              <Animated.View style={[S.avatarRing, { borderColor: t.accent + '30', transform: [{ scale: pulseAnim }] }]}>
                <View style={[S.avatarInner, { backgroundColor: t.accentDim, borderColor: t.accent + '50' }]}>
                  <User size={52} color={t.accent} />
                </View>
              </Animated.View>
              <Text style={[S.name, { color: t.text }]}>{displayName}</Text>
              {cs.contactName && <Text style={[S.sub, { color: t.textMuted }]}>{cs.phoneNumber}</Text>}
              <Text style={[S.statusLabel, { color: t.textSecondary }]}>
                {isRinging ? 'Mobile' : isDialing ? cs.phoneNumber : isActive ? 'Active call' : ''}
              </Text>
            </View>

            {/* DTMF pad */}
            {isActive && cs.showPad && (
              <View style={S.dtmfGrid}>
                {DIAL_PAD.map((row, ri) => (
                  <View key={ri} style={S.dtmfRow}>
                    {row.map(d => (
                      <Pressable key={d} style={[S.dtmfBtn, { backgroundColor: t.surface, borderColor: t.border }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); PresenceDialer?.sendDtmf?.(d).catch(console.warn); }}>
                        <Text style={[S.dtmfDigit, { color: t.text }]}>{d}</Text>
                        {DIAL_LETTERS[d] && <Text style={[S.dtmfLetters, { color: t.textMuted }]}>{DIAL_LETTERS[d]}</Text>}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Controls */}
            <View style={[S.controls, { paddingBottom: insets.bottom + 32 }]}>
              {isRinging ? (
                <View style={S.answerRow}>
                  <Pressable style={[S.bigBtn, { backgroundColor: t.redDim, borderColor: t.red, borderRadius: s.radiusPill }]} onPress={declineCall}>
                    <PhoneOff size={28} color={t.red} />
                    <Text style={[S.btnLabel, { color: t.red }]}>Decline</Text>
                  </Pressable>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Pressable style={[S.bigBtn, { backgroundColor: t.greenDim, borderColor: t.green, borderRadius: s.radiusPill }]} onPress={answerCall}>
                      <Phone size={28} color={t.green} />
                      <Text style={[S.btnLabel, { color: t.green }]}>Answer</Text>
                    </Pressable>
                  </Animated.View>
                </View>
              ) : (
                <>
                  <View style={S.ctrlRow}>
                    <Pressable style={[S.ctrlBtn, { backgroundColor: cs.isMuted ? t.redDim : t.surface, borderColor: cs.isMuted ? t.red : t.border, borderRadius: s.radiusSm }]} onPress={toggleMute}>
                      {cs.isMuted ? <MicOff size={22} color={t.red} /> : <Mic size={22} color={t.text} />}
                      <Text style={[S.ctrlLabel, { color: cs.isMuted ? t.red : t.textMuted }]}>{cs.isMuted ? 'Unmute' : 'Mute'}</Text>
                    </Pressable>
                    <Pressable style={[S.ctrlBtn, { backgroundColor: cs.isHeld ? t.accentDim : t.surface, borderColor: cs.isHeld ? t.accent : t.border, borderRadius: s.radiusSm }]} onPress={toggleHold}>
                      <CirclePause size={22} color={cs.isHeld ? t.accent : t.text} />
                      <Text style={[S.ctrlLabel, { color: cs.isHeld ? t.accent : t.textMuted }]}>{cs.isHeld ? 'Resume' : 'Hold'}</Text>
                    </Pressable>
                    <Pressable style={[S.ctrlBtn, { backgroundColor: cs.isSpeaker ? t.accentDim : t.surface, borderColor: cs.isSpeaker ? t.accent : t.border, borderRadius: s.radiusSm }]} onPress={toggleSpeaker}>
                      {cs.isSpeaker ? <Volume2 size={22} color={t.accent} /> : <VolumeX size={22} color={t.text} />}
                      <Text style={[S.ctrlLabel, { color: cs.isSpeaker ? t.accent : t.textMuted }]}>Speaker</Text>
                    </Pressable>
                    <Pressable style={[S.ctrlBtn, { backgroundColor: cs.showPad ? t.accentDim : t.surface, borderColor: cs.showPad ? t.accent : t.border, borderRadius: s.radiusSm }]}
                      onPress={() => setCs(p => ({ ...p, showPad: !p.showPad }))}>
                      <Hash size={22} color={cs.showPad ? t.accent : t.text} />
                      <Text style={[S.ctrlLabel, { color: cs.showPad ? t.accent : t.textMuted }]}>Keypad</Text>
                    </Pressable>
                  </View>
                  <Pressable style={[S.endBtn, { backgroundColor: t.red }]} onPress={endCall}>
                    <PhoneOff size={28} color="#fff" />
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>
        </Modal>
      )}

      {/* ── Minimized floating banner ───────────────────────────────────── */}
      {isMinimized && isActive && (
        <Animated.View style={[S.banner, {
          backgroundColor: t.surface,
          borderColor: t.accent + '50',
          top: insets.top + 8,
          transform: [{ translateY: bannerAnim }],
        }]}>
          <Pressable style={S.bannerLeft} onPress={expand}>
            <View style={[S.bannerDot, { backgroundColor: t.green }]} />
            <View>
              <Text style={[S.bannerName, { color: t.text }]}>{displayName}</Text>
              <Text style={[S.bannerDur, { color: t.textMuted }]}>{fmt(cs.duration)} · tap to return</Text>
            </View>
          </Pressable>
          <Pressable style={[S.bannerEnd, { backgroundColor: t.red }]} onPress={endCall} hitSlop={8}>
            <PhoneOff size={16} color="#fff" />
          </Pressable>
        </Animated.View>
      )}
    </>
  );
}

const S = StyleSheet.create({
  root:        { flex: 1 },
  topBar:      { alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'center' },
  topLabel:    { fontSize: 13, fontWeight: '700' as const, letterSpacing: 3 },
  minimizeBtn: { position: 'absolute', right: 20, bottom: 14, alignItems: 'center', gap: 2 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarRing:  { width: 140, height: 140, borderRadius: 70, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarInner: { width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  name:        { fontSize: 28, fontWeight: '300' as const, letterSpacing: 0.5 },
  sub:         { fontSize: 14, letterSpacing: 1 },
  statusLabel: { fontSize: 13, marginTop: 2 },
  dtmfGrid:    { gap: 10, paddingHorizontal: 40, marginBottom: 16 },
  dtmfRow:     { flexDirection: 'row', justifyContent: 'space-evenly' },
  dtmfBtn:     { width: 66, height: 66, borderRadius: 33, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dtmfDigit:   { fontSize: 22, fontWeight: '300' as const },
  dtmfLetters: { fontSize: 8, fontWeight: '500' as const, letterSpacing: 2, marginTop: 1 },
  controls:    { alignItems: 'center', gap: 28 },
  answerRow:   { flexDirection: 'row', gap: 56 },
  bigBtn:      { width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnLabel:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5 },
  ctrlRow:     { flexDirection: 'row', gap: 14, flexWrap: 'wrap' as const, justifyContent: 'center', paddingHorizontal: 24 },
  ctrlBtn:     { width: 72, height: 72, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  ctrlLabel:   { fontSize: 10, fontWeight: '500' as const, letterSpacing: 0.3 },
  endBtn:      { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  // Banner
  banner:      { position: 'absolute', left: 16, right: 16, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 12, elevation: 12, zIndex: 9999 },
  bannerLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerDot:   { width: 10, height: 10, borderRadius: 5 },
  bannerName:  { fontSize: 14, fontWeight: '600' as const },
  bannerDur:   { fontSize: 11 },
  bannerEnd:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
