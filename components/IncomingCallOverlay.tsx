/**
 * IncomingCallOverlay
 * Listens to DeviceEventEmitter for 'incomingCall' events emitted by
 * PresenceInCallService / PresenceDialerModule, and shows a full-screen
 * modal overlay no matter what screen the user is on.
 *
 * Native side must emit:
 *   ReactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
 *     .emit("incomingCall", args)          // args: { phoneNumber: String }
 *   and "callStateChanged" { state: "disconnected" } to dismiss it.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Modal,
  DeviceEventEmitter, Vibration, NativeModules,
} from 'react-native';
import { Phone, PhoneOff, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/contexts/SettingsContext';
import { useRouter } from 'expo-router';

const { PresenceDialer } = NativeModules;

interface IncomingCallState {
  visible: boolean;
  phoneNumber: string;
  contactName?: string;
}

export default function IncomingCallOverlay() {
  const { activeTheme: t } = useSettings();
  const router = useRouter();
  const [call, setCall] = useState<IncomingCallState>({ visible: false, phoneNumber: '' });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const vibPattern = useRef<ReturnType<typeof setInterval> | null>(null);

  const show = useCallback((phoneNumber: string, contactName?: string) => {
    setCall({ visible: true, phoneNumber, contactName });
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    // Pulse animation on avatar
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    // Vibrate ringtone pattern
    vibPattern.current = setInterval(() => {
      Vibration.vibrate([0, 400, 200, 400]);
    }, 2000);
  }, [fadeAnim, pulseAnim]);

  const dismiss = useCallback(() => {
    Vibration.cancel();
    if (vibPattern.current) clearInterval(vibPattern.current);
    pulseAnim.stopAnimation();
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setCall({ visible: false, phoneNumber: '' });
    });
  }, [fadeAnim, pulseAnim]);

  const answerCall = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dismiss();
    if (PresenceDialer?.answerCall) {
      PresenceDialer.answerCall().catch(console.warn);
    }
    router.push('/phone' as never);
  }, [dismiss, router]);

  const declineCall = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (PresenceDialer?.endCall) {
      PresenceDialer.endCall().catch(console.warn);
    }
    dismiss();
  }, [dismiss]);

  useEffect(() => {
    const incomingSub = DeviceEventEmitter.addListener('incomingCall', (event: { phoneNumber: string; contactName?: string }) => {
      show(event.phoneNumber, event.contactName);
    });

    const stateSub = DeviceEventEmitter.addListener('callStateChanged', (event: { state: string; phoneNumber?: string }) => {
      // Show overlay if we receive a ringing state (fallback if incomingCall event missed)
      if (event.state === 'ringing') {
        show(event.phoneNumber ?? '', undefined);
        return;
      }
      if (event.state === 'disconnected' || event.state === 'ended') {
        dismiss();
      }
      // Don't dismiss on 'active' — the answer button already dismisses
    });

    return () => {
      incomingSub.remove();
      stateSub.remove();
      Vibration.cancel();
      if (vibPattern.current) clearInterval(vibPattern.current);
    };
  }, [show, dismiss]);

  if (!call.visible) return null;

  return (
    <Modal
      visible={call.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={declineCall}
    >
      <Animated.View style={[styles.overlay, { backgroundColor: t.bg, opacity: fadeAnim }]}>
        {/* Subtle gradient-like top area */}
        <View style={[styles.topBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
          <Text style={[styles.incomingLabel, { color: t.textMuted }]}>INCOMING CALL</Text>
        </View>

        <View style={styles.center}>
          <Animated.View style={[styles.avatarRing, { borderColor: t.accent + '30', transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.avatarInner, { backgroundColor: t.accentDim, borderColor: t.accent + '50' }]}>
              <User size={52} color={t.accent} />
            </View>
          </Animated.View>

          <Text style={[styles.contactName, { color: t.text }]}>
            {call.contactName || call.phoneNumber}
          </Text>
          {call.contactName && (
            <Text style={[styles.phoneNumber, { color: t.textMuted }]}>{call.phoneNumber}</Text>
          )}
          <Text style={[styles.callType, { color: t.textSecondary }]}>Mobile</Text>
        </View>

        <View style={styles.actions}>
          {/* Decline */}
          <Pressable
            style={[styles.actionBtn, { backgroundColor: t.redDim, borderColor: t.red }]}
            onPress={declineCall}
          >
            <PhoneOff size={28} color={t.red} />
            <Text style={[styles.actionLabel, { color: t.red }]}>Decline</Text>
          </Pressable>

          {/* Answer */}
          <Pressable
            style={[styles.actionBtn, { backgroundColor: t.greenDim, borderColor: t.green }]}
            onPress={answerCall}
          >
            <Phone size={28} color={t.green} />
            <Text style={[styles.actionLabel, { color: t.green }]}>Answer</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  topBar: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  incomingLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 28,
    fontWeight: '300' as const,
    letterSpacing: 0.5,
  },
  phoneNumber: {
    fontSize: 15,
    letterSpacing: 1,
  },
  callType: {
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingBottom: 64,
    paddingHorizontal: 40,
  },
  actionBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
});
