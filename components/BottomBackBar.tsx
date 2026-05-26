import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';

interface BottomBackBarProps {
  label?: string;
  onBack?: () => void;
  tint?: string;
}

export default React.memo(function BottomBackBar({ label = 'Back', onBack, tint }: BottomBackBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeTheme: t } = useSettings();
  const colour = tint ?? t.text;

  return (
    <View pointerEvents="box-none" style={[BB.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable
        onPressIn={() => (onBack ? onBack() : router.back())}
        hitSlop={14}
        style={({ pressed }) => [BB.pill, { opacity: pressed ? 0.55 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        <ChevronLeft size={18} color={colour} strokeWidth={1.6} />
        <Text style={[BB.label, { color: colour }]}>{label}</Text>
      </Pressable>
    </View>
  );
});

const BB = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-start',   // left-aligned
    paddingLeft: 16,
    paddingTop: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    // No background, no border — fully transparent
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.4,
    fontWeight: '500',
  },
});
