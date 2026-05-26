/**
 * presenceOS — Entry route
 *
 * When set as default home launcher, Android will always launch this route.
 * We render the home content directly for returning users instead of trying
 * to navigate, which avoids a blank flash on every home-button press.
 *
 * First-ever launch → play welcome → /onboarding
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';

export default function IndexScreen() {
  const router   = useRouter();
  const { user, isLoading } = useUser();
  const { activeTheme: t } = useSettings();

  const welcomeFade  = useRef(new Animated.Value(0)).current;
  const welcomeScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (isLoading) return;

    if (user.hasCompletedOnboarding) {
      // Returning user — go to home screen
      router.replace('/home' as never);
      return;
    }

    // First launch: welcome animation then onboarding
    Animated.parallel([
      Animated.timing(welcomeFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(welcomeScale, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(welcomeFade, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => router.replace('/onboarding' as never));
    }, 2200);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user.hasCompletedOnboarding]);

  // Show home background immediately for returning users to eliminate blank flash
  if (user.hasCompletedOnboarding) {
    return <View style={[styles.container, { backgroundColor: t.bg }]} />;
  }

  // Still loading
  if (isLoading) {
    return <View style={[styles.container, { backgroundColor: t.bg }]} />;
  }

  // First-launch welcome screen
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Animated.View style={[styles.content, {
        opacity: welcomeFade,
        transform: [{ scale: welcomeScale }],
      }]}>
        <View style={[styles.logoRing, { borderColor: t.accent + '40' }]}>
          <View style={[styles.logoInner, { backgroundColor: t.accent + '12', borderColor: t.accent + '25' }]}>
            <Text style={[styles.logoChar, { color: t.accent }]}>P</Text>
          </View>
        </View>
        <Text style={[styles.brand,   { color: t.text }]}>presenceOS</Text>
        <Text style={[styles.tagline, { color: t.textMuted }]}>welcome</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:   { alignItems: 'center', gap: 16 },
  logoRing:  { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoInner: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoChar:  { fontSize: 40, fontWeight: '300' as const },
  brand:     { fontSize: 28, fontWeight: '300' as const, letterSpacing: 2 },
  tagline:   { fontSize: 14, letterSpacing: 3 },
});
