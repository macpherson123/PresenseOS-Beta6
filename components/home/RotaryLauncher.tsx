/**
 * RotaryLauncher — butter-smooth, pure RN only, useNativeDriver: true throughout.
 * NO SVG, NO LinearGradient, NO expo-linear-gradient (all forced useNativeDriver: false).
 * Rotation driven entirely by native thread transforms.
 */
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Pressable, PanResponder, Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  MessageCircle, Phone, Globe, Camera, Shield, Navigation, Music,
  FileText, MessageSquare, MoreHorizontal, AlarmClock, BookOpen, Calculator,
  Wrench, Nfc, ChevronLeft, Settings, Terminal,
  Play, Pause, SkipBack, SkipForward,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';

const { width: SW } = Dimensions.get('window');
const { height: SH_SCREEN } = Dimensions.get('screen');

// ─── Geometry ─────────────────────────────────────────────────────────────────
export const DISC_R    = SW * 0.50;
export const ICON_R    = DISC_R * 0.70;
export const HOLE_D    = Math.round(DISC_R * 0.158);
export const HUB_R     = Math.round(DISC_R * 0.17);
export const CX        = SW / 2;
export const CY        = SH_SCREEN + DISC_R * 0.5;
export const HALF_TY   = DISC_R * 0.5 - 160;
export const FULL_TY   = Dimensions.get('window').height * 0.58 - CY;
export const STAGE3_TY = (Dimensions.get('window').height - 30 - DISC_R) - CY;
export const HIDE_TY   = DISC_R * 1.2;
const ICON_ANGLES      = Array.from({ length: 9 }, (_, i) => -90 + i * 40);

export const MAIN_APPS = [
  { id:'messaging', name:'PresenceChat', icon:MessageCircle, route:'__messages', color:'#26A69A' },
  { id:'phone',     name:'Phone',        icon:Phone,         route:'/phone',     color:'#4CAF50' },
  { id:'sms',       name:'New SMS',      icon:MessageSquare, route:'__new_sms',  color:'#42A5F5' },
  { id:'browser',   name:'Browser',      icon:Globe,         route:'/browser',   color:'#7E57C2' },
  { id:'camera',    name:'Camera',       icon:Camera,        route:'/camera',    color:'#26C6DA' },
  { id:'guardian',  name:'Guardian',     icon:Shield,        route:'/guardian',  color:'#AB47BC' },
  { id:'navigation',name:'Navigate',     icon:Navigation,    route:'__turn',     color:'#42A5F5' },
  { id:'music',     name:'Music',        icon:Music,         route:'/music',     color:'#EC407A' },
  { id:'other',     name:'More',         icon:MoreHorizontal,route:'__other',    color:'#FF7043' },
] as const;

export const OTHER_APPS = [
  { id:'alarm',    name:'Alarms',   icon:AlarmClock,    route:'/alarm',    color:'#FF7043' },
  { id:'notes',    name:'Notes',    icon:BookOpen,      route:'/notes',    color:'#FFA726' },
  { id:'files',    name:'Files',    icon:FileText,      route:'/files',    color:'#5C6BC0' },
  { id:'calc',     name:'Calc',     icon:Calculator,    route:'__calc',    color:'#78909C' },
  { id:'tools',    name:'Tools',    icon:Wrench,        route:'/tools',    color:'#607D8B' },
  { id:'newchat',  name:'New Chat', icon:Nfc,           route:'__new_chat',color:'#26A69A' },
  { id:'back',     name:'Back',     icon:ChevronLeft,   route:'__back',    color:'#888888' },
  { id:'settings', name:'Settings', icon:Settings,      route:'/settings', color:'#78909C' },
  { id:'dev',      name:'Dev',      icon:Terminal,      route:'__dev',     color:'#607D8B' },
] as const;

// ─── Per-style ────────────────────────────────────────────────────────────────
// fillIdle / fillTop are hex-alpha suffixes appended to each app.color, giving
// the well a soft colour wash that makes icons readable on dark wallpapers
// without changing the disc's overall character. Each style picks its own
// intensity so neon stays punchy, simple stays subdued, etc.
function styleFor(uiStyle: string, accent: string, isDark: boolean) {
  const bg = isDark;
  switch (uiStyle) {
    case 'neon': return {
      disc: '#0D0D14', discBorder: accent,
      ring: accent + '30', rings: [0.93, 0.82, 0.70],
      hole: '#141420', holeBorder: accent + '70',
      hub: '#1a1a2a', hubBorder: accent,
      iconStroke: 1.8,
      fillIdle: '30', fillTop: '55',
      borderIdle: '70', borderTop: 'FF',
    };
    case 'geometric': return {
      disc: bg ? '#12121A' : '#F6F3ED', discBorder: accent + '90',
      ring: accent + '25', rings: [0.91, 0.79],
      hole: bg ? '#0E0E16' : '#EDEAD6', holeBorder: accent + '50',
      hub: bg ? '#1a1828' : '#e0ddd6', hubBorder: accent + '60',
      iconStroke: 1.6,
      fillIdle: '22', fillTop: '42',
      borderIdle: '45', borderTop: 'C0',
    };
    case 'modern': return {
      disc: bg ? '#111118' : '#FAFAF8', discBorder: bg ? '#22202C' : '#CCCAC4',
      ring: bg ? '#ffffff18' : '#00000010', rings: [0.93, 0.80],
      hole: bg ? '#1A1820' : '#F0EDE7', holeBorder: bg ? '#2C2A36' : '#C4C0B8',
      hub: bg ? '#2A2835' : '#D8D4CC', hubBorder: bg ? '#3a3848' : '#bcb8b0',
      iconStroke: 2.0,
      fillIdle: '20', fillTop: '40',
      borderIdle: '40', borderTop: 'C0',
    };
    case 'oldschool': return {
      disc: '#EDE5C8', discBorder: '#8B6E3F',
      ring: '#8B6E3F35', rings: [0.92, 0.84, 0.76, 0.68],
      hole: '#E0D8BC', holeBorder: '#8B6E3F',
      hub: '#C4A86A', hubBorder: '#8B6E3F',
      iconStroke: 2.2,
      fillIdle: '28', fillTop: '50',
      borderIdle: '60', borderTop: 'D0',
    };
    case 'simple': return {
      disc: bg ? '#18181E' : '#F8F6F2', discBorder: bg ? '#28262E' : '#D4D0C8',
      ring: bg ? '#ffffff12' : '#00000008', rings: [0.85],
      hole: bg ? '#141418' : '#F0EDE8', holeBorder: bg ? '#242228' : '#CCCAC4',
      hub: bg ? '#242228' : '#D8D4CC', hubBorder: bg ? '#333' : '#c0bcb4',
      iconStroke: 1.55,
      fillIdle: '18', fillTop: '38',
      borderIdle: '35', borderTop: 'B0',
    };
    default: return { // classic
      disc: bg ? '#1E1C25' : '#EDEAE4', discBorder: bg ? '#302E3C' : '#B4B0A8',
      ring: bg ? '#ffffff20' : '#00000015', rings: [0.90, 0.78, 0.66],
      hole: bg ? '#18161E' : '#E4E0D8', holeBorder: bg ? '#302E3C' : '#A4A09C',
      hub: bg ? '#2E2C3A' : '#CCCAC4', hubBorder: bg ? '#3c3a4a' : '#b0acaa',
      iconStroke: 1.8,
      fillIdle: '25', fillTop: '48',
      borderIdle: '50', borderTop: 'D0',
    };
  }
}

export interface RotaryProps {
  accent: string; uiStyle: string;
  onPress: (route: string, name: string) => void;
  onDismiss: () => void;
  torchOn: boolean; onTorch: () => void;
  musicTrack?: { title: string; artist: string } | null;
  isPlaying?: boolean; onTogglePlay?: () => void;
  onPrevTrack?: () => void; onNextTrack?: () => void;
  stageY?: number;
}

function RotaryLauncherImpl({
  accent, uiStyle, onPress, onDismiss,
  musicTrack, isPlaying, onTogglePlay, onPrevTrack, onNextTrack,
  stageY = 0,
}: RotaryProps) {
  const { activeTheme: rt } = useSettings();
  const [inOther,  setInOther]  = useState(false);
  const [pressing, setPressing] = useState<number | null>(null);
  const pressAnim  = useRef(new Animated.Value(1)).current;

  // ── Rotation state — native driver safe ───────────────────────────────────
  // We drive rotation with a plain JS ref + direct setValue (no Animated.spring
  // for inertia — we use rAF). The disc uses useNativeDriver: true on its
  // transform, and we keep rotAnim as a plain Animated.Value (no .interpolate
  // chained to useNativeDriver:false operations).
  const rotAnim    = useRef(new Animated.Value(0)).current;
  const rotRef     = useRef(0);
  const lastAng    = useRef<number | null>(null);
  const rafId      = useRef<number | null>(null);
  const springAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [topIdx, setTopIdx] = useState(0);
  const topIdxRef  = useRef(0);

  const apps   = inOther ? OTHER_APPS : MAIN_APPS;
  const isDark = !rt.bg.startsWith('#F') && !rt.bg.startsWith('#f');
  const style  = useMemo(() => styleFor(uiStyle, accent, isDark), [uiStyle, accent, isDark]);

  // ── Perf: throttle React re-renders during high-velocity spin ──
  // Haptics fire on every slot crossing (cheap, native-side), but setTopIdx is
  // throttled to ~12Hz max during spin to avoid re-rendering all 9 mapped icons
  // 60 times per second. Final state lands when motion settles (snap callbacks).
  const lastHapticIdx   = useRef(-1);
  const lastStateUpdate = useRef(0);

  const updateTopIdx = useCallback(() => {
    const r   = (((-rotRef.current / 40) % 9) + 9) % 9;
    const idx = Math.round(r) % 9;
    if (idx !== lastHapticIdx.current) {
      lastHapticIdx.current = idx;
      Haptics.selectionAsync();
    }
    const now = Date.now();
    if (idx !== topIdxRef.current && now - lastStateUpdate.current > 80) {
      topIdxRef.current = idx;
      lastStateUpdate.current = now;
      setTopIdx(idx);
    }
  }, []);

  // Force a final state sync — used at end of spin / snap to ensure visual matches
  const forceFinalTopIdx = useCallback(() => {
    const r   = (((-rotRef.current / 40) % 9) + 9) % 9;
    const idx = Math.round(r) % 9;
    if (idx !== topIdxRef.current) {
      topIdxRef.current = idx;
      lastStateUpdate.current = Date.now();
      setTopIdx(idx);
    }
  }, []);

  useEffect(() => {
    if (springAnim.current) { springAnim.current.stop(); springAnim.current = null; }
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    rotRef.current = 0; rotAnim.setValue(0); topIdxRef.current = 0; setTopIdx(0);
    lastHapticIdx.current = -1; lastStateUpdate.current = 0;
  }, [inOther]); // eslint-disable-line

  useEffect(() => () => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
  }, []);

  const triggerPress = useCallback((idx: number, cb: () => void) => {
    // Fire the action FIRST. The press-scale animation runs as cosmetic
    // feedback in parallel — gating navigation on it added ~370ms of dead
    // time (70ms timing + ~300ms spring) before the new screen would mount.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    cb();
    setPressing(idx);
    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 0.60, duration: 70, useNativeDriver: true }),
      Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, tension: 400, friction: 8 }),
    ]).start(() => { setPressing(null); });
  }, [pressAnim]);

  const handleIconPress = useCallback((app: typeof apps[number], idx: number) => {
    if (app.route === '__other') { triggerPress(idx, () => setInOther(true));  return; }
    if (app.route === '__back')  { triggerPress(idx, () => setInOther(false)); return; }
    triggerPress(idx, () => onPress(app.route, app.name));
  }, [triggerPress, onPress]);

  // Snap to nearest slot with native spring
  const snapToSlot = useCallback(() => {
    const target = Math.round(rotRef.current / 40) * 40;
    rotRef.current = target;
    springAnim.current = Animated.spring(rotAnim, {
      toValue: target,
      useNativeDriver: true, // ✓ pure transform rotation
      tension: 220,
      friction: 18,
    });
    springAnim.current.start(() => {
      springAnim.current = null;
      forceFinalTopIdx();
    });
    updateTopIdx();
  }, [rotAnim, updateTopIdx, forceFinalTopIdx]);

  const spinPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.hypot(gs.dx, gs.dy) > 8,
    onPanResponderGrant: (evt) => {
      // Stop any in-flight spring/rAF
      if (springAnim.current) { springAnim.current.stop(); springAnim.current = null; }
      if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
      lastAng.current = Math.atan2(evt.nativeEvent.pageY - CY, evt.nativeEvent.pageX - CX) * (180 / Math.PI);
    },
    onPanResponderMove: (evt) => {
      if (lastAng.current === null) return;
      const a = Math.atan2(evt.nativeEvent.pageY - CY, evt.nativeEvent.pageX - CX) * (180 / Math.PI);
      let d = a - lastAng.current;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      rotRef.current += d;
      rotAnim.setValue(rotRef.current);
      updateTopIdx();
      lastAng.current = a;
    },
    onPanResponderRelease: (_, gs) => {
      lastAng.current = null;
      const speed = Math.hypot(gs.vx, gs.vy);

      if (speed < 0.05) { snapToSlot(); return; }

      // Dial-feel inertia: capped velocity, strong magnetic snap
      const sign = Math.sign(gs.vx) || 1;
      let v = sign * Math.min(speed * 240, 420); // dial not slot machine
      const friction = 0.970;

      const tick = () => {
        v *= friction;
        const nearest = Math.round(rotRef.current / 40) * 40;
        const dist    = nearest - rotRef.current;

        if (Math.abs(v) < 4) {
          v += dist * 0.16;
          v *= 0.78;
        }
        if (Math.abs(v) < 0.1 && Math.abs(dist) < 0.5) {
          rotRef.current = nearest;
          rotAnim.setValue(rotRef.current);
          forceFinalTopIdx();
          rafId.current = null;
          return;
        }
        rotRef.current += v * 0.016;
        rotAnim.setValue(rotRef.current);
        updateTopIdx();
        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);
    },
    onPanResponderTerminate: () => { lastAng.current = null; snapToSlot(); },
  }), [updateTopIdx, rotAnim, snapToSlot, forceFinalTopIdx]);

  // Both rotations share the same animated value with useNativeDriver: true
  const discRotate    = rotAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'],  extrapolate: 'extend' });
  const counterRotate = rotAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '-360deg'], extrapolate: 'extend' });

  // ── Scrolling track title above play button ───────────────────────────────
  const titleScrollX = useRef(new Animated.Value(0)).current;
  const titleScrollAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (titleScrollAnim.current) { titleScrollAnim.current.stop(); titleScrollAnim.current = null; }
    titleScrollX.setValue(0);
    if (!musicTrack) return;
    const distance = 240; // generous scroll range covering any reasonable title length
    titleScrollAnim.current = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(titleScrollX, {
          toValue: -distance,
          duration: distance * 38, // ~9s for full scroll — a slow, relaxed ticker
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(600),
        Animated.timing(titleScrollX, { toValue: 0, duration: 80, useNativeDriver: true }),
      ])
    );
    titleScrollAnim.current.start();
    return () => { titleScrollAnim.current?.stop(); titleScrollAnim.current = null; };
  }, [musicTrack?.title, musicTrack?.artist]); // eslint-disable-line

  const topApp = apps[topIdx] ?? apps[0];
  const discDiam = DISC_R * 2;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} {...spinPan.panHandlers}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

      {/* App name label */}
      <View style={{
        position: 'absolute', top: CY + stageY - DISC_R - 52, left: 0, right: 0, alignItems: 'center',
      }} pointerEvents="none">
        <View style={{
          paddingHorizontal: 16, paddingVertical: 5, borderRadius: 12,
          backgroundColor: rt.surface + 'CC', borderWidth: 1, borderColor: rt.border + '60',
        }}>
          <Text style={{ color: rt.text, fontSize: 13, fontWeight: '500', letterSpacing: 0.8 }}>
            {topApp.name}
          </Text>
        </View>
      </View>

      {/* Selector notch */}
      <View style={{
        position: 'absolute', width: 3, height: 22, borderRadius: 2,
        left: CX - 1.5, top: CY + stageY - DISC_R - 4,
        backgroundColor: accent, elevation: 8, zIndex: 5,
      }} pointerEvents="none" />

      {/* Ambient glow — pure RN, no SVG */}
      <View style={{
        position: 'absolute',
        width: discDiam + 60, height: discDiam + 60,
        left: CX - DISC_R - 30, top: CY + stageY - DISC_R - 30,
        borderRadius: (discDiam + 60) / 2,
        backgroundColor: accent + '18',
      }} pointerEvents="none" />

      {/* Rotating disc — useNativeDriver: true */}
      <Animated.View
        renderToHardwareTextureAndroid
        style={{
          position: 'absolute', width: discDiam, height: discDiam,
          left: CX - DISC_R, top: CY + stageY - DISC_R,
          transform: [{ rotate: discRotate }],
        }}
      >
        {/* Disc face */}
        <View style={{
          position: 'absolute', inset: 0, borderRadius: DISC_R,
          backgroundColor: style.disc, borderWidth: 1.5, borderColor: style.discBorder,
          elevation: 16,
        }} />

        {/* Concentric rings — pure View borders */}
        {style.rings.map((r, i) => (
          <View key={i} style={{
            position: 'absolute',
            width: DISC_R * r * 2, height: DISC_R * r * 2, borderRadius: DISC_R * r,
            left: DISC_R * (1 - r), top: DISC_R * (1 - r),
            borderWidth: StyleSheet.hairlineWidth, borderColor: style.ring,
          }} />
        ))}

        {/* Icon wells */}
        {apps.map((app, i) => {
          const rad   = (ICON_ANGLES[i] * Math.PI) / 180;
          const ix    = DISC_R + ICON_R * Math.cos(rad);
          const iy    = DISC_R + ICON_R * Math.sin(rad);
          const Icon  = app.icon;
          const isTop = i === topIdx;
          return (
            <View key={app.id} style={{
              position: 'absolute',
              left: ix - HOLE_D - 10, top: iy - HOLE_D - 10,
              width: (HOLE_D + 10) * 2, height: (HOLE_D + 10) * 2,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Pressable
                onPress={() => handleIconPress(app as any, i)}
                hitSlop={8}
                style={{ width: (HOLE_D + 10) * 2, height: (HOLE_D + 10) * 2, alignItems: 'center', justifyContent: 'center' }}
              >
                <Animated.View style={{
                  width: HOLE_D * 2, height: HOLE_D * 2, borderRadius: HOLE_D,
                  backgroundColor: app.color + (isTop ? style.fillTop : style.fillIdle),
                  borderWidth: isTop ? 2 : 1.25,
                  borderColor: app.color + (isTop ? style.borderTop : style.borderIdle),
                  alignItems: 'center', justifyContent: 'center',
                  elevation: isTop ? 10 : 5,
                  transform: pressing === i ? [{ scale: pressAnim }] : undefined,
                }}>
                  <Animated.View style={{ transform: [{ rotate: counterRotate }] }}>
                    <Icon
                      size={Math.round(HOLE_D * 0.88)}
                      strokeWidth={style.iconStroke}
                      color={app.color}
                    />
                  </Animated.View>
                </Animated.View>
              </Pressable>
            </View>
          );
        })}

        {/* Centre hub */}
        <View style={{
          position: 'absolute', left: DISC_R - HUB_R, top: DISC_R - HUB_R,
          width: HUB_R * 2, height: HUB_R * 2, borderRadius: HUB_R,
          backgroundColor: style.hub, borderWidth: 1.5, borderColor: style.hubBorder,
          elevation: 12, alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent + '90' }} />
        </View>
      </Animated.View>

      {/* Scrolling track title — sits above the play button, inside the disc face */}
      {musicTrack && (
        <View style={{
          position: 'absolute',
          left: CX - HUB_R * 2.6, top: CY + stageY - HUB_R * 2.05,
          width: HUB_R * 5.2, height: 22,
          overflow: 'hidden', zIndex: 10,
        }} pointerEvents="none">
          <Animated.Text
            style={{
              color: accent,
              fontSize: 11,
              fontWeight: '500',
              letterSpacing: 0.6,
              opacity: 0.92,
              // Extra padding at the end creates a clear gap before the text loops back
              paddingRight: 40,
              transform: [{ translateX: titleScrollX }],
            }}
          >
            {musicTrack.title}{musicTrack.artist ? `  ·  ${musicTrack.artist}` : ''}
          </Animated.Text>
        </View>
      )}

      {/* Music controls — fixed, does not spin */}
      {musicTrack && (
        <View style={{
          position: 'absolute',
          left: CX - HUB_R * 2.4, top: CY + stageY - HUB_R * 1.1,
          width: HUB_R * 4.8, height: HUB_R * 2.2,
          alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
            <Pressable hitSlop={14} onPressIn={() => onPrevTrack?.()}>
              <SkipBack size={Math.round(HUB_R * 0.70)} color={accent} strokeWidth={1.8} />
            </Pressable>
            <Pressable onPressIn={() => onTogglePlay?.()} style={{
              width: HUB_R * 1.10, height: HUB_R * 1.10, borderRadius: HUB_R * 0.55,
              backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
            }}>
              {isPlaying
                ? <Pause size={Math.round(HUB_R * 0.52)} color={isDark ? '#000' : '#fff'} />
                : <Play  size={Math.round(HUB_R * 0.52)} color={isDark ? '#000' : '#fff'} style={{ marginLeft: 2 }} />}
            </Pressable>
            <Pressable hitSlop={14} onPressIn={() => onNextTrack?.()}>
              <SkipForward size={Math.round(HUB_R * 0.70)} color={accent} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      )}

      {inOther && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: CY + stageY - DISC_R - 80, alignItems: 'center' }} pointerEvents="none">
          <Text style={{ color: accent, fontSize: 10, fontWeight: '700', letterSpacing: 3 }}>OTHER APPS</Text>
        </View>
      )}
    </View>
  );
}

export default React.memo(RotaryLauncherImpl);
