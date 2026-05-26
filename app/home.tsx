/**
 * presenceOS — Home Screen v4
 *
 * Gesture model:
 *   Swipe DOWN      → network stats slides in from top
 *   Swipe UP        → rotary: 1st=half reveal, 2nd=full circle, 3rd=raised full
 *   Swipe DOWN      → (on rotary) step back 3→2→1→closed
 *   Swipe RIGHT     → messages panel
 *   Swipe LEFT      → settings route
 *
 * Components are extracted under components/home/ for GSI injection readiness.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, Pressable, Modal,
  NativeModules, Alert, PanResponder,
  Dimensions, BackHandler,
  Linking, Image as RNImage,
} from 'react-native';
import {
  MessageCircle, Phone,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';

import { useSettings } from '@/contexts/SettingsContext';
import { useContacts } from '@/contexts/ContactsContext';
import { useUser } from '@/contexts/UserContext';
import { useMusic } from '@/contexts/MusicContext';
import OSStatusBar from '@/components/OSStatusBar';

import {
  BracketClock, AnalogClock, GeometricClock, SimpleClock, OldSchoolClock, NeonClock, WeatherWidget,
} from '@/components/home/ClockWidgets';
import InlineMessagesPanel from '@/components/home/InlineMessagesPanel';
import InlineSettingsPanel from '@/components/home/InlineSettingsPanel';

const DEFAULT_WALLPAPER = require('@/assets/images/wallpaper-default.png');
import QuickBoxes from '@/components/home/QuickBoxes';
import RotaryLauncher, {
  DISC_R, HALF_TY, FULL_TY, STAGE3_TY, HIDE_TY,
} from '@/components/home/RotaryLauncher';
import NativeSwipePager, { SwipePagerRef } from '@/components/NativeSwipePager';
import NativeSwipeUp from '@/components/NativeSwipeUp';

const { width: SW, height: SH } = Dimensions.get('window');
const { PresenceDeviceControl } = NativeModules;

// ─── HomeScreen ───────────────────────────────────────────────────────────────
const HS = StyleSheet.create({
  root:       { flex:1 },
  inner:      { flex:1 },
  clockWrap:  { alignItems:'center', paddingTop: 20, paddingBottom:14, gap:10, maxHeight: SH * 0.45 },
  pillsRow:   { flexDirection:'row', flexWrap:'wrap', gap:8, justifyContent:'center', paddingHorizontal:20, minHeight:36 },
  pill:       { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:7, borderRadius:18, borderWidth:1 },
  pillTxt:    { fontSize:12, fontWeight:'500' as const },
  divider:    { flexDirection:'row', alignItems:'center', marginHorizontal:20, marginVertical:14 },
  divLine:    { flex:1, height:StyleSheet.hairlineWidth },
  divDiamond: { width:7, height:7, borderRadius:1.5, transform:[{rotate:'45deg'}], marginHorizontal:10 },
  handle:     { alignItems:'center', paddingTop:20, paddingBottom:12, paddingHorizontal:60, gap:6 },
  handlePill: { width:56, height:5, borderRadius:3 },
  handleHint: { fontSize:9, letterSpacing:2.5, fontWeight:'600' as const },
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.90)', zIndex:200, elevation:200 },
  netPanel:   { position:'absolute', top:0, left:0, right:0, paddingHorizontal:24, paddingTop:56, paddingBottom:24, borderBottomWidth:1, zIndex:200, shadowColor:'#000', shadowOpacity:0.3, shadowRadius:12, elevation:12 },
  menuBg:     { flex:1, backgroundColor:'rgba(0,0,0,0.58)', alignItems:'center', justifyContent:'center' },
  menuCard:   { width:285, borderRadius:20, borderWidth:1, overflow:'hidden' },
  menuTitle:  { fontSize:10, fontWeight:'600' as const, letterSpacing:2, textTransform:'uppercase' as const, paddingHorizontal:22, paddingTop:18, paddingBottom:8 },
  menuRow:    { paddingHorizontal:22, paddingVertical:17, borderBottomWidth:StyleSheet.hairlineWidth },
  menuRowTxt: { fontSize:16, fontWeight:'500' as const },
});

export default function HomeScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { lockApp }                                             = useUser();
  const { activeTheme: t, settings }                           = useSettings();
  const { unreadTotal, missedCalls }                           = useContacts();
  const { playbackState, getCurrentTrack, togglePlayPause, nextTrack, previousTrack } = useMusic();
  const [smsUnread, setSmsUnread] = useState(0);

  // Wallpaper luminance → contrasting text colours.
  const [wallpaperIsDark, setWallpaperIsDark] = useState(true);
  const overlayText   = useMemo(() => settings.wallpaperUri && !wallpaperIsDark ? '#111111' : t.text,   [settings.wallpaperUri, wallpaperIsDark, t.text]);
  const overlayMuted  = useMemo(() => settings.wallpaperUri && !wallpaperIsDark ? '#33333399' : t.textMuted, [settings.wallpaperUri, wallpaperIsDark, t.textMuted]);
  const overlayAccent = useMemo(() => settings.wallpaperUri && !wallpaperIsDark ? '#1a1a2e' : t.accent, [settings.wallpaperUri, wallpaperIsDark, t.accent]);

  // SMS badge
  useEffect(() => {
    let mounted = true;
    const go = async () => {
      if (!PresenceDeviceControl?.getSmsConversations) return;
      try {
        const threads: any[] = await PresenceDeviceControl.getSmsConversations();
        if (!mounted) return;
        setSmsUnread(threads.filter((x: any) => x.unread > 0 || x.read === 0).length);
      } catch {}
    };
    go(); const id = setInterval(go, 10000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const unread   = settings.notificationsEnabled ? unreadTotal      : 0;
  const missed   = settings.notificationsEnabled ? (missedCalls??0) : 0;
  const smsCount = settings.notificationsEnabled ? smsUnread        : 0;

  // ── Animated values ───────────────────────────────────────────────────────
  const rotaryAV   = useRef(new Animated.Value(HIDE_TY)).current;
  const backdropAV = useRef(new Animated.Value(0)).current;
  const netPanY    = useRef(new Animated.Value(-SH)).current;
  const fadeIn     = useRef(new Animated.Value(0)).current;

  // ── State ─────────────────────────────────────────────────────────────────
  const [rotaryStage,  setRotaryStage]  = useState<0|1|2|3>(0);
  const [showRotary,   setShowRotary]   = useState(false);
  const [showNet,      setShowNet]      = useState(false);
  const [torchOn,      setTorchOn]      = useState(false);
  const [cntMenu,      setCntMenu]      = useState(false);
  const [netStats,     setNetStats]     = useState({ rx:'—', tx:'—', connections:0, idle:true });

  const stageRef    = useRef<0|1|2|3>(0);
  const showRotRef  = useRef(false);
  const showNetRef  = useRef(false);
  useEffect(() => { stageRef.current   = rotaryStage; }, [rotaryStage]);
  useEffect(() => { showRotRef.current = showRotary;  }, [showRotary]);
  useEffect(() => { showNetRef.current = showNet;     }, [showNet]);

  useEffect(() => { Animated.timing(fadeIn, { toValue:1, duration:200, useNativeDriver:true }).start(); }, []);

  useFocusEffect(useCallback(() => {
    pagerRef.current?.goToPage(1, false); setCurrentPage(1); // reset to home on focus
    fadeIn.setValue(0); Animated.timing(fadeIn, { toValue:1, duration:150, useNativeDriver:true }).start();
    rotaryAV.setValue(HIDE_TY); backdropAV.setValue(0); setShowRotary(false); setRotaryStage(0);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showRotRef.current) { closeRotary(); return true; }
      if (currentPageRef.current !== 1) { pagerRef.current?.goToPage(1); return true; }
      return false;
    });
    return () => sub.remove();
  }, [])); // eslint-disable-line

  // Net stats polling — prefers PresenceSystem (TrafficStats, live rate, no root needed)
  useEffect(() => {
    if (!showNet) return;
    const PS = NativeModules.PresenceSystem;
    const go = async () => {
      try {
        const s = PS?.getNetworkStats
          ? await PS.getNetworkStats()
          : await PresenceDeviceControl?.getNetworkStats?.();
        if (s) setNetStats(s);
      } catch {}
    };
    go(); const id = setInterval(go, 2000); return () => clearInterval(id);
  }, [showNet]);

  // ── Rotary helpers ────────────────────────────────────────────────────────
  const animRotary = useCallback((stage: 0|1|2|3) => {
    const ty = stage===0 ? HIDE_TY : stage===1 ? HALF_TY : stage===2 ? FULL_TY : STAGE3_TY;
    const op = stage===0 ? 0 : stage===1 ? 0.5 : stage===2 ? 0.88 : 0.94;
    if (stage > 0 && !showRotRef.current) setShowRotary(true);
    setRotaryStage(stage);
    Animated.parallel([
      Animated.spring(rotaryAV,   { toValue:ty, useNativeDriver:true, tension:150, friction:20 }),
      Animated.timing(backdropAV, { toValue:op, duration:220, useNativeDriver:true }),
    ]).start(() => { if (stage === 0) setShowRotary(false); });
  }, [rotaryAV, backdropAV]);

  const closeRotary = useCallback(() => animRotary(0), [animRotary]);
  const openRotary  = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cur  = stageRef.current;
    const next: 0|1|2|3 = cur===0 ? 1 : cur===1 ? 2 : cur===2 ? 3 : 3;
    animRotary(next);
  }, [animRotary]);

  const openNet  = useCallback(() => { setShowNet(true);  Animated.spring(netPanY, { toValue:0,   useNativeDriver:true, tension:160, friction:16 }).start(); }, [netPanY]);
  const closeNet = useCallback(() => { Animated.spring(netPanY, { toValue:-SH, useNativeDriver:true, tension:160, friction:16 }).start(() => setShowNet(false)); }, [netPanY]);

  const rotaryBackdropGesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 4,
    onPanResponderMove: (_, gs) => {
      const ay = Math.abs(gs.dy), ax = Math.abs(gs.dx);
      if (ax > ay * 2) return;
      const cur = stageRef.current;
      if (gs.dy > 0 && cur > 0) {
        const base = cur===3 ? STAGE3_TY : cur===2 ? FULL_TY : HALF_TY;
        const tgt  = cur===3 ? FULL_TY   : cur===2 ? HALF_TY : HIDE_TY;
        rotaryAV.setValue(base + Math.min(1, gs.dy/200) * (tgt - base));
      } else if (gs.dy < 0) {
        if (cur===1) { const p=Math.min(1,Math.max(0,-gs.dy/(SH*0.35))); rotaryAV.setValue(HALF_TY+p*(FULL_TY-HALF_TY)); backdropAV.setValue(0.5+p*0.38); }
        else if (cur===2) { const p=Math.min(1,Math.max(0,-gs.dy/120)); rotaryAV.setValue(FULL_TY+p*(STAGE3_TY-FULL_TY)); backdropAV.setValue(0.88+p*0.06); }
      }
    },
    onPanResponderRelease: (_, gs) => {
      const ay = Math.abs(gs.dy), ax = Math.abs(gs.dx);
      if (ax<8&&ay<8) { closeRotary(); return; }
      if (ax > ay * 2) return;
      const cur = stageRef.current;
      if (gs.dy < 0) {
        if (cur===1&&(ay>35||gs.vy<-0.4)) animRotary(2);
        else if (cur===2&&(ay>35||gs.vy<-0.4)) animRotary(3);
        else animRotary(cur);
      } else {
        if (ay>40||gs.vy>0.4) { if(cur===3) animRotary(2); else if(cur===2) animRotary(1); else closeRotary(); }
        else animRotary(cur);
      }
    },
  }), [stageRef, rotaryAV, backdropAV, animRotary, closeRotary]); // eslint-disable-line

  // ── Vertical-only gesture (horizontal handled by native ViewPager2) ─────────
  const startY = useRef(0), dir = useRef<'none'|'up'|'down'>('none');

  const verticalGesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gs) => {
      const ax = Math.abs(gs.dx), ay = Math.abs(gs.dy);
      // Threshold raised to 14px (was 8px). On devices with noisy touch reporting
      // even a brief still tap can drift 8px, causing the PanResponder to steal the
      // event before Pressable.onPress fires. 14px eliminates the false triggers
      // while still catching deliberate swipes with plenty of headroom.
      return ay > ax * 1.5 && ay > 14;
    },
    onPanResponderGrant: (evt) => {
      startY.current = evt.nativeEvent.pageY; dir.current = 'none';
    },
    onPanResponderMove: (evt, gs) => {
      if (dir.current === 'none') { dir.current = gs.dy > 0 ? 'down' : 'up'; }
      const d = dir.current;
      if (d === 'up') {
        if (showNetRef.current) { netPanY.setValue(Math.min(0, gs.dy*0.5)); return; }
        if (showRotRef.current && stageRef.current===2) { const p=Math.min(1,Math.max(0,-gs.dy/150)); rotaryAV.setValue(FULL_TY+p*(STAGE3_TY-FULL_TY)); backdropAV.setValue(0.88+p*(0.94-0.88)); return; }
        if (showRotRef.current && stageRef.current===1) { const p=Math.min(1,Math.max(0,-gs.dy/(SH*0.4))); rotaryAV.setValue(HALF_TY+p*(FULL_TY-HALF_TY)); backdropAV.setValue(0.5+p*0.38); return; }
        // Stage-0 drag: track finger 1:1. Don't mount the backdrop /
        // dismiss-gesture catcher mid-drag — that flips showRotRef and
        // disables this branch, freezing the disc until release. Mount
        // happens on release in openRotary→animRotary (or we abort and
        // snap back to HIDE_TY).
        if (!showRotRef.current) { const p=Math.min(1,Math.max(0,-gs.dy/(SH*0.45))); rotaryAV.setValue(HIDE_TY+p*(HALF_TY-HIDE_TY)); backdropAV.setValue(p*0.5); }
        return;
      }
      if (d === 'down') {
        if (showRotRef.current) { const cur=stageRef.current,base=cur===3?STAGE3_TY:cur===2?FULL_TY:HALF_TY,target=cur===3?FULL_TY:cur===2?HALF_TY:HIDE_TY,baseOp=cur===3?0.94:cur===2?0.88:0.5,tgtOp=cur===3?0.88:cur===2?0.5:0,p=Math.min(1,gs.dy/200); rotaryAV.setValue(base+p*(target-base)); backdropAV.setValue(baseOp+p*(tgtOp-baseOp)); }
        else if (!showNetRef.current) { netPanY.setValue(Math.max(-SH,-SH+gs.dy)); }
      }
    },
    onPanResponderRelease: (_, gs) => {
      const d = dir.current; dir.current = 'none';
      const ay = Math.abs(gs.dy);
      if (d === 'up') {
        if (showNetRef.current) { if(ay>60||gs.vy<-0.5) closeNet(); else openNet(); return; }
        if (showRotRef.current && stageRef.current===2) { if(ay>60||gs.vy<-0.5) animRotary(3); else animRotary(2); return; }
        if (showRotRef.current && stageRef.current===1) { if(ay>60||gs.vy<-0.5) animRotary(2); else animRotary(1); return; }
        if (ay>40||gs.vy<-0.4) openRotary();
        else { rotaryAV.setValue(HIDE_TY); backdropAV.setValue(0); setShowRotary(false); setRotaryStage(0); }
        return;
      }
      if (d === 'down') {
        if (showRotRef.current) { if(ay>50||gs.vy>0.5) { const cur=stageRef.current; if(cur===3) animRotary(2); else if(cur===2) animRotary(1); else closeRotary(); } else { animRotary(stageRef.current); } return; }
        if (ay>60||gs.vy>0.5) openNet();
        else Animated.spring(netPanY, { toValue:-SH, useNativeDriver:true, tension:200, friction:16 }).start();
      }
    },
  }), [rotaryAV, backdropAV, netPanY, openRotary, closeRotary, animRotary, openNet, closeNet]);

  // ── Torch ─────────────────────────────────────────────────────────────────
  const handleTorch = useCallback(async () => {
    const next = !torchOn; setTorchOn(next); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (PresenceDeviceControl?.setTorchEnabled) { try { await PresenceDeviceControl.setTorchEnabled(next); } catch { setTorchOn(!next); } }
  }, [torchOn]);

  // ── Route ─────────────────────────────────────────────────────────────────
  const handleRoute = useCallback((route: string) => {
    if (route === '__messages') {
      pagerRef.current?.goToPage(0); return;
    }
    if (route === '__contacts') { setCntMenu(true); return; }
    if (route === '__turn') {
      Alert.alert(
        'PresenceOS Navigation',
        'Install the PresenceTurn navigation app to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Download & Install',
            onPress: () => {
              const APK_URL = 'https://presenceos.qzz.io/ecosystem/com.presenceos.turn.apk';
              Linking.openURL(APK_URL).catch(() =>
                Alert.alert('Download Failed', 'Could not open the download link. Visit presenceos.qzz.io/ecosystem to download manually.')
              );
            },
          },
        ]
      );
      return;
    }
    if (route === '__calc') {
      Linking.openURL('intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end').catch(() => {}); return;
    }
    if (route === '__new_sms')  { router.push('/sms' as never);      return; }
    if (route === '__new_chat') { router.push('/nfc-pair' as never);  return; }
    if (route === '__dev') {
      Linking.openURL('intent:#Intent;action=android.settings.APPLICATION_DEVELOPMENT_SETTINGS;end')
        .catch(() => Linking.openURL('intent:#Intent;action=android.settings.SETTINGS;end').catch(() => {})); return;
    }
    router.push(route as never);
  }, [router]);

  const handleRotaryPress = useCallback((route: string, name: string) => {
    // Navigate immediately. The rotary close animation (~300ms spring) plays
    // out *under* the new screen mounting on top — no need to wait for it.
    handleRoute(route);
    closeRotary();
  }, [closeRotary, handleRoute]);

  // ── Lock ──────────────────────────────────────────────────────────────────
  const handleLock = useCallback(async () => {
    if (!PresenceDeviceControl) return;
    try {
      const ok = await PresenceDeviceControl.isDeviceAdminActive();
      if (!ok) { Alert.alert('Enable Lock','Grant presenceOS device admin to lock.',[{text:'Cancel',style:'cancel'},{text:'Enable',onPress:()=>PresenceDeviceControl.requestDeviceAdmin()}]); return; }
      lockApp(); await PresenceDeviceControl.lockScreen();
    } catch(e: any) { Alert.alert('Error', e?.message ?? 'Failed to lock'); }
  }, [lockApp]);

  const track = getCurrentTrack();

  // ── Clock picker ──────────────────────────────────────────────────────────
  const renderClock = () => {
    switch (settings.uiStyle) {
      case 'classic':   return <AnalogClock    accent={overlayAccent} text={overlayText} muted={overlayMuted} bg={t.bg} />;
      case 'geometric': return <GeometricClock accent={overlayAccent} text={overlayText} muted={overlayMuted} />;
      case 'simple':    return <SimpleClock    accent={overlayAccent} text={overlayText} muted={overlayMuted} />;
      case 'oldschool': return <OldSchoolClock accent={overlayAccent} text={overlayText} muted={overlayMuted} bg={t.bg} />;
      case 'neon':      return <NeonClock      accent={overlayAccent} text={overlayText} muted={overlayMuted} />;
      case 'modern':
      default:
        return <BracketClock accent={overlayAccent} text={overlayText} muted={overlayMuted} bg={t.bg} />;
    }
  };

  // ── Go-home from panels ────────────────────────────────────────────────────
  const pagerRef    = useRef<SwipePagerRef>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  const goHome = useCallback(() => pagerRef.current?.goToPage(1), []);

  return (
    <View style={HS.root}>
      {/*
       * ── OPTION B: Native ViewPager2 ──────────────────────────────────────
       * All horizontal swipe runs on the UI thread — zero JS bridge involvement.
       * Pages: 0 = messages (left), 1 = home (centre), 2 = settings (right).
       */}
      <NativeSwipePager
        ref={pagerRef}
        style={HS.root}
        onPageChange={setCurrentPage}
      >
        {/* ── Page 0: Messages ───────────────────────────────────────────
            Same rule as page 1 below — do NOT spread HS.root (flex:1).
            The ViewPager2 RecyclerView parent is opaque to Yoga, so
            flex:1 has no bound and the wrapper collapses to its
            content height (~SH+80). Explicit pixel width/height only,
            and collapsable={false} so RN doesn't flatten the wrapper
            into the pager (which would treat each grandchild as its
            own page). */}
        <View style={{ width: SW, height: SH }} collapsable={false}>
          <InlineMessagesPanel t={t} onSwipeBack={goHome} onSwipeUp={openRotary} wallpaperUri={settings.wallpaperUri} />
          <NativeSwipeUp onSwipeUp={openRotary} height={80} />
        </View>

        {/* ── Page 1: Home ───────────────────────────────────────────────
            NB: do NOT spread HS.root (flex:1) into this style. The
            ViewPager2 RecyclerView parent is opaque to Yoga, so flex:1
            has no bound and Yoga falls back to content sizing — which
            collapses the wrapper to ~ Animated.View's intrinsic height,
            taking the wallpaper and QuickBoxes down with it. Only the
            explicit pixel dimensions must remain. */}
        <View style={{ width: SW, height: SH, overflow:'hidden' }} collapsable={false} {...verticalGesture.panHandlers}>
          <RNImage
            source={settings.wallpaperUri ? { uri: settings.wallpaperUri } : DEFAULT_WALLPAPER}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />

          <OSStatusBar />

          <Animated.View
            style={[HS.inner, { opacity: fadeIn, paddingTop: insets.top, zIndex:1 }]}
            onLayout={undefined}
          >
            <View style={HS.clockWrap}>
              {renderClock()}
              {settings.showWeather && <WeatherWidget accent={overlayAccent} text={overlayText} muted={overlayMuted} />}
            </View>

            <View style={HS.pillsRow}>
              <Pressable style={[HS.pill, { backgroundColor: smsCount>0?t.tealDim:t.surface, borderColor: smsCount>0?t.teal+'60':t.border }]} onPressIn={() => router.push('/sms' as never)}>
                <MessageCircle size={12} color={smsCount>0?t.teal:t.textMuted} />
                <Text style={[HS.pillTxt, { color: smsCount>0?t.teal:t.textMuted }]}>{smsCount>0?`${smsCount} SMS`:'SMS'}</Text>
              </Pressable>
              {unread > 0 && (
                <Pressable style={[HS.pill, { backgroundColor: t.accentDim, borderColor: t.accent+'40' }]} onPressIn={() => pagerRef.current?.goToPage(0)}>
                  <MessageCircle size={12} color={t.accent} />
                  <Text style={[HS.pillTxt, { color: t.accent }]}>{unread} new</Text>
                </Pressable>
              )}
              {missed > 0 && (
                <Pressable style={[HS.pill, { backgroundColor: t.redDim, borderColor: t.red+'40' }]} onPressIn={() => router.push('/phone' as never)}>
                  <Phone size={12} color={t.red} />
                  <Text style={[HS.pillTxt, { color: t.red }]}>{missed} missed</Text>
                </Pressable>
              )}
            </View>

            <View style={{ flex:1 }} />

            <View style={HS.divider}>
              <View style={[HS.divLine, { backgroundColor: t.border }]} />
              <View style={[HS.divDiamond, { backgroundColor: t.accent }]} />
              <View style={[HS.divLine, { backgroundColor: t.border }]} />
            </View>

            <View style={HS.handle}>
              <View style={[HS.handlePill, { backgroundColor: t.border }]} />
              <Text style={[HS.handleHint, { color: t.textMuted }]}>SWIPE UP</Text>
            </View>

            {/* Customisable quick-launch tiles — sit at the very bottom of the flex
                column so they're always below the clock + SWIPE UP hint, with their
                own bottom padding for the gesture inset. */}
            <View style={[
              { paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 14) },
              settings.wallpaperUri ? { backgroundColor:'rgba(0,0,0,0.45)', borderTopLeftRadius:18, borderTopRightRadius:18, marginHorizontal:8 } : null,
            ]}>
              <QuickBoxes accent={t.accent} surface={t.surface} border={t.border} muted={t.textMuted}
                uiStyle={settings.uiStyle} onLock={handleLock} onNav={handleRoute} onTorch={handleTorch} />
            </View>

          </Animated.View>

          {/* Network stats panel */}
          {showNet && (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeNet} />
              <Animated.View style={[HS.netPanel, { backgroundColor: t.surface, borderBottomColor: t.border, transform:[{ translateY: netPanY }] }]}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:16 }}>
                  <Text style={{ color:t.textMuted, fontSize:10, fontWeight:'700', letterSpacing:2 }}>NETWORK ACTIVITY</Text>
                  <Pressable onPress={closeNet} hitSlop={12}><Text style={{ color:t.accent, fontSize:12 }}>done</Text></Pressable>
                </View>
                <View style={{ flexDirection:'row', gap:16 }}>
                  {[{ label:'RECEIVING', val:netStats.rx },{ label:'SENDING', val:netStats.tx }].map(r => (
                    <View key={r.label} style={{ flex:1, backgroundColor:t.accent+'12', borderRadius:12, padding:14, borderWidth:1, borderColor:t.accent+'30' }}>
                      <Text style={{ color:t.textMuted, fontSize:9, letterSpacing:1.5, marginBottom:4 }}>{r.label}</Text>
                      <Text style={{ color:t.text, fontSize:22, fontWeight:'200' }}>{r.val}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ marginTop:12, flexDirection:'row', alignItems:'center', gap:8 }}>
                  <View style={{ width:6, height:6, borderRadius:3, backgroundColor: netStats.idle ? t.accent+'40' : t.accent }} />
                  <Text style={{ color:t.textMuted, fontSize:11 }}>{netStats.idle ? 'presenceOS is idle' : `${netStats.connections} active connection${netStats.connections!==1?'s':''}`}</Text>
                </View>
              </Animated.View>
            </>
          )}

          <Modal visible={cntMenu} transparent animationType="fade" onRequestClose={() => setCntMenu(false)} statusBarTranslucent>
            <Pressable style={HS.menuBg} onPress={() => setCntMenu(false)}>
              <View style={[HS.menuCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[HS.menuTitle, { color: t.textMuted }]}>CONTACTS</Text>
                <Pressable style={[HS.menuRow, { borderBottomColor: t.border }]} onPressIn={() => { setCntMenu(false); router.push('/contacts' as never); }}>
                  <Text style={[HS.menuRowTxt, { color: t.text }]}>Presence Contacts</Text>
                </Pressable>
                <Pressable style={HS.menuRow} onPressIn={() => { setCntMenu(false); router.push('/directory' as never); }}>
                  <Text style={[HS.menuRowTxt, { color: t.accent }]}>Cellular Contacts</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          {settings.wallpaperUri && (
            <WebView key={settings.wallpaperUri}
              style={{ position:'absolute', width:1, height:1, opacity:0, top:-999 }}
              originWhitelist={['*']}
              onMessage={(e) => { const l = parseFloat(e.nativeEvent.data); if (!isNaN(l)) setWallpaperIsDark(l < 128); }}
              source={{ html:`<!DOCTYPE html><html><body style="margin:0"><canvas id="c" width="32" height="32" style="display:none"></canvas><script>var img=new Image();img.crossOrigin='anonymous';img.onload=function(){var c=document.getElementById('c');var ctx=c.getContext('2d');ctx.drawImage(img,0,0,32,32);var d=ctx.getImageData(0,0,32,32).data;var s=0,n=d.length/4;for(var i=0;i<d.length;i+=4){s+=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);}window.ReactNativeWebView.postMessage(String(s/n));};img.onerror=function(){window.ReactNativeWebView.postMessage('50');};img.src='${settings.wallpaperUri}';<\/script></body></html>` }}
            />
          )}
        </View>

        {/* ── Page 2: Settings ─────────────────────────────────────────── */}
        <View style={[HS.root, { width: SW, height: SH }]} collapsable={false}>
          <InlineSettingsPanel t={t} onSwipeBack={goHome} wallpaperUri={settings.wallpaperUri} />
          {/* No NativeSwipeUp here — the rotary should NOT trigger on
              settings. The bottom 80px must remain free for ScrollView
              gestures so users can scroll without accidentally opening
              the rotary launcher. */}
        </View>
      </NativeSwipePager>

      {/* Rotary — outside pager so it floats above all three panels.
          Backdrop is *always rendered* (pointerEvents:'none', opacity
          driven by backdropAV) so it can fade in mid-drag without
          forcing showRotary=true and freezing the tracking branch in
          verticalGesture. Dismiss-gesture catcher stays conditional so
          it doesn't intercept home-screen taps when closed. The disc
          itself is also always mounted and translated to HIDE_TY when
          closed — that way `rotaryAV.setValue` inside the swipe-up
          gesture moves the disc on the very first frame instead of
          waiting for React to mount RotaryLauncher. */}
      <Animated.View pointerEvents="none" style={[HS.backdrop, { opacity: backdropAV, bottom: -insets.bottom }]} />
      {/* Always mounted — conditional mount/unmount caused a React re-render mid-spring,
          producing a one-frame visual jump. pointerEvents switches touch handling without
          mounting cost. */}
      <View
        pointerEvents={showRotary ? 'auto' : 'none'}
        style={[{ position:'absolute', top:0, left:0, right:0, bottom:-insets.bottom }, { zIndex:200, elevation:200 }]}
        {...rotaryBackdropGesture.panHandlers}
      />
      <Animated.View
        pointerEvents={showRotary ? 'auto' : 'none'}
        style={[
          { position:'absolute', top:0, left:0, right:0, bottom:-(insets.bottom+DISC_R*2), overflow:'visible' },
          { transform:[{ translateY: rotaryAV }], zIndex:201, elevation:201 },
        ]}
      >
        <RotaryLauncher
          accent={t.accent} uiStyle={settings.uiStyle}
          onPress={handleRotaryPress} onDismiss={closeRotary}
          torchOn={torchOn} onTorch={handleTorch}
          musicTrack={track} isPlaying={playbackState.isPlaying} onTogglePlay={togglePlayPause}
          onPrevTrack={previousTrack} onNextTrack={nextTrack}
          stageY={rotaryStage===1 ? HALF_TY : rotaryStage===2 ? FULL_TY : rotaryStage===3 ? STAGE3_TY : 0}
        />
      </Animated.View>
    </View>
  );


}
