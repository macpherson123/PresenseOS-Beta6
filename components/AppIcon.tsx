import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import {
  MessageCircle, Phone, Nfc, Music, Globe, Navigation,
  Wrench, Settings, BadgeCheck, ShieldCheck, Camera, Bug, LayoutGrid,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import * as Haptics from 'expo-haptics';

const iconMap: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  MessageCircle,
  Phone,
  Nfc,
  Music,
  Globe,
  Navigation,
  Wrench,
  Settings,
  BadgeCheck,
  ShieldCheck,
  Camera,
  Bug,
  LayoutGrid,
};

interface AppIconProps {
  name: string;
  icon: string;
  color: string;
  onPress: () => void;
  badge?: number;
}

export default React.memo(function AppIcon({ name, icon, color, onPress, badge }: AppIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { activeTheme: t } = useSettings();
  const IconComponent = iconMap[icon];

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [onPress]);

  if (!IconComponent) return null;

  return (
    <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
        <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
          <IconComponent size={26} color={color} />
          {badge && badge > 0 ? (
            <View style={[styles.badge, { backgroundColor: t.red }]}>
              <Text style={[styles.badgeText, { color: t.white }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, { color: t.textSecondary }]} numberOfLines={1}>{name}</Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 76,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  label: {
    fontSize: 11,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
});

