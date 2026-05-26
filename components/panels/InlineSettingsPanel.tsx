/**
 * InlineSettingsPanel — Settings embedded as an in-place sliding panel.
 * Swipe right to dismiss back to home. Mirrors InlineMessagesPanel architecture.
 * The actual settings content is rendered by a lazy-loaded Settings screen fragment.
 */
import React, { useRef, useMemo } from 'react';
import {
  View, Text, Pressable, PanResponder, Animated, Dimensions, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Settings as SettingsIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');
const SWIPE_THRESHOLD = SW * 0.28;

export default function InlineSettingsPanel({
  t,
  onSwipeBack,
}: {
  t: any;
  onSwipeBack?: () => void;
}) {
  const router = useRouter();
  const translateX = useRef(new Animated.Value(0)).current;

  // Swipe RIGHT → back to home
  const swipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) =>
      gs.dx > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderMove: (_, gs) => {
      if (gs.dx > 0) translateX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > SWIPE_THRESHOLD || gs.vx > 0.6) {
        Animated.timing(translateX, { toValue: SW, duration: 180, useNativeDriver: true }).start(() => {
          translateX.setValue(0);
          onSwipeBack?.();
        });
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 300, friction: 26 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 300, friction: 26 }).start();
    },
  }), [translateX, onSwipeBack]);

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: t.bg, transform: [{ translateX }] }}
      {...swipePan.panHandlers}
    >
      {/* Swipe hint */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 4, paddingTop: 8, paddingBottom: 4,
      }}>
        <ChevronRight size={12} color={t.textMuted} />
        <Text style={{ fontSize: 10, color: t.textMuted, letterSpacing: 0.5 }}>
          swipe right to go home
        </Text>
      </View>

      {/* Full settings opens as a proper route — tap to expand */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/settings' as never);
        }}
        style={{
          flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
        }}
      >
        <SettingsIcon size={48} color={t.textMuted} strokeWidth={1} />
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '300' }}>Settings</Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Tap to open</Text>
      </Pressable>
    </Animated.View>
  );
}
