import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { SettingsContent } from '@/app/settings';

const { width: SW, height: SH } = Dimensions.get('window');

const DEFAULT_WALLPAPER = require('@/assets/images/wallpaper-default.png');

export default function InlineSettingsPanel({
  t,
  onSwipeBack,
  wallpaperUri,
}: {
  t: any;
  onSwipeBack?: () => void;
  wallpaperUri?: string | null;
}) {
  const router = useRouter();
  const wallpaperSource = wallpaperUri ? { uri: wallpaperUri } : DEFAULT_WALLPAPER;

  return (
    <View style={{ width: SW, height: SH }}>
      {/* ── Blurred wallpaper background ── */}
      <Image source={wallpaperSource} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <BlurView intensity={78} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />

      {/* Settings content — root container made transparent so wallpaper shows through */}
      <SettingsContent
        onBack={onSwipeBack}
        onNavigate={(route) => router.push(route as never)}
        rootTransparent
      />
    </View>
  );
}
