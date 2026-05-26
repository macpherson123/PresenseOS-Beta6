/**
 * video-call.tsx — real WebRTC audio + video call screen
 * Driven entirely by PresenceNetContext — no signaling logic here.
 *
 * States:
 *   incoming   → show answer/reject
 *   outgoing   → show calling… + cancel
 *   connecting → ICE negotiating, show spinner
 *   connected  → show in-call controls (+ video streams if video call)
 *   idle       → router.back()
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, StatusBar, Animated, ActivityIndicator,
  Vibration,
} from 'react-native';
import { Audio } from 'expo-av';
import { registerGlobals, RTCView } from 'react-native-webrtc';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { usePresenceNet } from '@/contexts/PresenceNetContext';
import * as Haptics from 'expo-haptics';
import {
  PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff,
  Phone as PhoneIcon,
} from 'lucide-react-native';

registerGlobals();

export default function VideoCallScreen() {
  const router = useRouter();
  const { activeTheme: t } = useSettings();
  const {
    callState, localStream, remoteStream,
    answerCall, rejectCall, hangUp,
    toggleMute, toggleCamera, isMuted, isCameraOff,
  } = usePresenceNet();

  const pulse = useRef(new Animated.Value(1)).current;

  // Pulse animation while ringing / calling out
  useEffect(() => {
    if (callState.status === 'incoming' || callState.status === 'outgoing') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [callState.status, pulse]);

  // ── Audio mode for in-call routing (speakerphone) ──
  useEffect(() => {
    if (callState.status === 'idle') return;
    Audio.setAudioModeAsync({
      allowsRecordingIOS:        true,
      playsInSilentModeIOS:      true,
      staysActiveInBackground:   true,
      shouldDuckAndroid:         false,
      playThroughEarpieceAndroid: false,    // route through speakerphone
      interruptionModeIOS:       2 as any,  // DoNotMix
      interruptionModeAndroid:   2 as any,  // DoNotMix
    }).catch((e) => console.warn('[Call] setAudioMode failed:', e));
    // Reset when call ends
    return () => {
      Audio.setAudioModeAsync({
        allowsRecordingIOS:        false,
        playsInSilentModeIOS:      false,
        staysActiveInBackground:   false,
        shouldDuckAndroid:         true,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    };
  }, [callState.status]);

  // ── Outgoing ringback — soft chirp every 3s while calling/connecting ──
  useEffect(() => {
    if (callState.status !== 'outgoing' && callState.status !== 'connecting') return;
    Vibration.vibrate([0, 60], false);
    const interval = setInterval(() => {
      Vibration.vibrate([0, 60], false);
    }, 3000);
    return () => {
      clearInterval(interval);
      Vibration.cancel();
    };
  }, [callState.status]);

  // ── Incoming ring — repeating vibration pattern ──
  useEffect(() => {
    if (callState.status !== 'incoming') return;
    // The `true` repeats the pattern until cancelled
    Vibration.vibrate([0, 600, 400, 600], true);
    return () => Vibration.cancel();
  }, [callState.status]);

  // Return to previous screen when call ends
  useEffect(() => {
    if (callState.status === 'idle') {
      if (router.canGoBack()) router.back();
    }
  }, [callState.status, router]);

  if (callState.status === 'idle') return null;

  const isVideo    = callState.type === 'video';
  const name       = callState.peerName ?? 'Unknown';
  const isIncoming = callState.status === 'incoming';
  const isConnecting = callState.status === 'connecting';

  return (
    <View style={S.root}>
      <StatusBar hidden />

      {/* Remote video (background) */}
      {isVideo && remoteStream && callState.status === 'connected' && (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
        />
      )}

      {/* No video or not connected — dark bg with avatar */}
      {(!isVideo || !remoteStream || callState.status !== 'connected') && (
        <View style={[S.noVideo, { backgroundColor: t.bg }]}>
          <Animated.View style={[S.avatarRing, { borderColor: t.accent + '40', transform: [{ scale: pulse }] }]}>
            <View style={[S.avatar, { backgroundColor: t.accentDim, borderColor: t.accent }]}>
              <Text style={[S.avatarLetter, { color: t.accent }]}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          </Animated.View>
          <Text style={[S.name, { color: t.text }]}>{name}</Text>
          <Text style={[S.status, { color: callState.status === 'failed' ? t.red : t.textMuted }]}>
            {callState.status === 'incoming'   ? 'Incoming call…'
             : callState.status === 'outgoing'  ? 'Calling…'
             : callState.status === 'connecting' ? 'Connecting…'
             : callState.status === 'ended'      ? 'Call ended'
             : callState.status === 'failed'     ? 'Could not connect'
             : 'Connected'}
          </Text>
          {isConnecting && (
            <ActivityIndicator color={t.accent} style={{ marginTop: 16 }} />
          )}
        </View>
      )}

      {/* Local video (PiP) — only when connected */}
      {isVideo && localStream && callState.status === 'connected' && (
        <View style={S.pip}>
          <RTCView
            streamURL={localStream.toURL()}
            style={S.pipStream}
            objectFit="cover"
            mirror
            zOrder={1}
          />
        </View>
      )}

      {/* Controls */}
      <View style={S.controls}>
        {isIncoming ? (
          // Answer / Reject
          <View style={S.incomingRow}>
            <Pressable style={[S.bigBtn, { backgroundColor: '#E53935' }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); rejectCall(); }}>
              <PhoneOff size={32} color="#fff" />
              <Text style={S.bigBtnLabel}>Decline</Text>
            </Pressable>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Pressable style={[S.bigBtn, { backgroundColor: '#43A047' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); answerCall(); }}>
                <PhoneIcon size={32} color="#fff" />
                <Text style={S.bigBtnLabel}>Answer</Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          // In-call / outgoing controls
          <View style={S.activeRow}>
            <Pressable
              style={[S.ctrlBtn, { backgroundColor: isMuted ? t.red + '30' : t.surface }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleMute(); }}
            >
              {isMuted ? <MicOff size={24} color={t.red} /> : <Mic size={24} color={t.text} />}
            </Pressable>

            {isVideo && (
              <Pressable
                style={[S.ctrlBtn, { backgroundColor: isCameraOff ? t.red + '30' : t.surface }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleCamera(); }}
              >
                {isCameraOff
                  ? <VideoOff size={24} color={t.red} />
                  : <VideoIcon size={24} color={t.text} />}
              </Pressable>
            )}

            <Pressable
              style={[S.ctrlBtn, { backgroundColor: '#E53935' }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); hangUp(); }}
            >
              <PhoneOff size={24} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#000' },
  noVideo:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  avatarRing:   { width: 140, height: 140, borderRadius: 70, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatar:       { width: 110, height: 110, borderRadius: 55, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 42, fontWeight: '200' as const },
  name:         { fontSize: 26, fontWeight: '300' as const },
  status:       { fontSize: 14 },
  pip:          { position: 'absolute', top: 48, right: 16, width: 100, height: 140, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  pipStream:    { flex: 1 },
  controls:     { position: 'absolute', bottom: 56, left: 0, right: 0, alignItems: 'center' },
  incomingRow:  { flexDirection: 'row', gap: 60 },
  activeRow:    { flexDirection: 'row', gap: 20 },
  bigBtn:       { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', elevation: 6, gap: 4 },
  bigBtnLabel:  { color: '#fff', fontSize: 10, fontWeight: '600' as const },
  ctrlBtn:      { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
