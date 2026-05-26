import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import {
  X, Sparkles, Globe, Timer, Music, Phone, Navigation, Nfc,
  Wrench, Shield, User,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import { philosophyTips } from '@/constants/philosophy';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Sparkles, Globe, Timer, Music, Phone, Navigation, Nfc, Wrench, Shield, User,
};

interface PhilosophyBannerProps {
  screen: string;
}

export default React.memo(function PhilosophyBanner({ screen }: PhilosophyBannerProps) {
  const { isTipDismissed, dismissTip, activeTheme } = useSettings();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const tip = philosophyTips.find((t) => t.screen === screen);
  const isVisible = tip && !isTipDismissed(tip.id);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 12,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isVisible, slideAnim, opacityAnim]);

  const handleDismiss = useCallback(() => {
    if (!tip) return;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissTip(tip.id);
    });
  }, [tip, dismissTip, slideAnim, opacityAnim]);

  if (!isVisible || !tip) return null;

  const IconComp = iconMap[tip.icon];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: activeTheme.accentDim,
          borderColor: activeTheme.accent + '30',
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: activeTheme.accent + '20' }]}>
          {IconComp && <IconComp size={16} color={activeTheme.accent} />}
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: activeTheme.accent }]}>{tip.title}</Text>
          <Text style={[styles.message, { color: activeTheme.textSecondary }]}>{tip.message}</Text>
        </View>
        <Pressable onPress={handleDismiss} hitSlop={12} style={styles.closeBtn}>
          <X size={14} color={activeTheme.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 12,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
    marginTop: -2,
    marginRight: -4,
  },
});

