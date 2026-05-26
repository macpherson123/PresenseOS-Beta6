/**
 * useHaptic — single source of truth for haptic feedback in PresenceOS.
 *
 * Why this exists:
 *   - expo-haptics silently no-ops on devices where the system Vibrator service
 *     isn't reachable (cut-down ROMs, no systemui).
 *   - The `settings.hapticFeedback` toggle has to gate every haptic call, but
 *     dozens of components were calling Haptics.impactAsync directly.
 *
 * Behaviour:
 *   - Returns no-op if settings.hapticFeedback === false.
 *   - Tries expo-haptics first (smoothest pattern on healthy devices).
 *   - On any failure (or if expo returns silently and the device feels dead),
 *     falls back to PresenceSystem.vibrate (native Vibrator + root sysfs).
 */
import { useCallback } from 'react';
import { NativeModules } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/contexts/SettingsContext';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const DURATION_MS: Record<HapticStyle, number> = {
  light:   12,
  medium:  25,
  heavy:   45,
  success: 30,
  warning: 50,
  error:   80,
};

export function useHaptic() {
  const { settings } = useSettings();

  return useCallback((style: HapticStyle = 'light') => {
    if (!settings.hapticFeedback) return;
    const expoCall = (() => {
      switch (style) {
        case 'light':   return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        case 'medium':  return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        case 'heavy':   return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        case 'success': return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        case 'warning': return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        case 'error':   return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    })();
    const fallback = () => NativeModules.PresenceSystem?.vibrate?.(DURATION_MS[style])?.catch?.(() => {});
    try {
      const p: any = expoCall();
      if (p && typeof p.catch === 'function') p.catch(fallback); else fallback();
    } catch {
      fallback();
    }
  }, [settings.hapticFeedback]);
}
