import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { getTheme, type ThemePreset } from '@/constants/colors';
import { getUITokens, type UIStyleTokens } from '@/constants/uiStyles';
export type { UIStyleTokens };

export type UIStyle = 'geometric' | 'modern' | 'classic' | 'simple' | 'oldschool' | 'neon';

export interface DeviceSettings {
  // ── Theme ──────────────────────────────────────────────────────────────────
  themeName:              ThemePreset;
  accentOverride:         string | null;   // custom accent colour, null = use theme default
  uiStyle:                UIStyle;
  showWeather:            boolean;
  weatherCity:            string;   // manual city name, empty = use GPS
  wallpaperUri:           string | null;
  // ── Connectivity ──────────────────────────────────────────────────────────
  wifiEnabled:            boolean;
  bluetoothEnabled:       boolean;
  hotspotEnabled:         boolean;
  mobileDataEnabled:      boolean;
  // ── Display ───────────────────────────────────────────────────────────────
  screenTimeout:          number;
  brightness:             number;
  showBatteryPercentage:  boolean;       // ← NEW
  // ── Notifications & sound ─────────────────────────────────────────────────
  notificationsEnabled:   boolean;
  hapticFeedback:         boolean;
  doNotDisturb:           boolean;
  developerMode:          boolean;
  qrPairingEnabled:       boolean;
  // ── Privacy & access ──────────────────────────────────────────────────────
  locationEnabled:        boolean;
  nfcEnabled:             boolean;
  autoLock:               boolean;
  fontSize:               'xs' | 'small' | 'medium' | 'large' | 'xl';
  // ── Presence Server ────────────────────────────────────────────────────────
  serverUrl:              string;
  // ── Phone ─────────────────────────────────────────────────────────────────
  defaultCallingCode:     string;    // e.g. '+64' — prepended to local numbers when dialling
  // ── Misc ──────────────────────────────────────────────────────────────────
  dismissedTips:          string[];
  browserSocialBlock:     boolean;   // block social media in browser (default on)
  presenceKeyboardEnabled: boolean;  // false = use system keyboard
  // ── WebRTC TURN (optional self-hosted) ────────────────────────────────────
  turnUrl?:               string;    // e.g. 'turn:turn.example.com:3478'
  turnUsername?:          string;
  turnPassword?:          string;
}

const defaultSettings: DeviceSettings = {
  themeName:              'arctic',
  accentOverride:         null,
  uiStyle:                'modern',
  showWeather:            false,
  weatherCity:            '',
  wallpaperUri:           null,
  wifiEnabled:            true,
  bluetoothEnabled:       true,
  hotspotEnabled:         false,
  mobileDataEnabled:      true,
  screenTimeout:          30,
  brightness:             75,
  showBatteryPercentage:  true,          // ← default on
  notificationsEnabled:   true,
  hapticFeedback:         true,
  doNotDisturb:           false,
  developerMode:          false,
  qrPairingEnabled:       false,
  locationEnabled:        true,
  nfcEnabled:             true,
  autoLock:               true,
  fontSize:               'medium',
  serverUrl:              '',
  defaultCallingCode:     '+64',
  dismissedTips:          [],
  browserSocialBlock:     true,
  presenceKeyboardEnabled: false,
  // Self-hosted coturn on AWS EC2 (ap-southeast-2, t3.micro + Elastic IP).
  // Realm presenceos.app, long-term credential. Verified reachable from 4G:
  // STUN reflexive + TURN allocation both succeeded against UDP 3478.
  turnUrl:                'turn:32.236.89.130:3478',
  turnUsername:           'presence',
  turnPassword:           'presenceos2026',
};

const SETTINGS_KEY = 'presence_settings';

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<DeviceSettings>(defaultSettings);

  const activeTheme = useMemo(() => {
    const base = getTheme(settings.themeName);
    if (!settings.accentOverride) return base;
    const accent = settings.accentOverride;
    // Derive dim from accent at 15% opacity
    const accentDim = accent + '26';
    return { ...base, accent, accentDim };
  }, [settings.themeName, settings.accentOverride]);

  const uiTokens = useMemo(() => getUITokens(settings.uiStyle), [settings.uiStyle]);

  const settingsQuery = useQuery({
    queryKey: ['device-settings'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) } as DeviceSettings;
      }
      return defaultSettings;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (s: DeviceSettings) => {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      return s;
    },
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);

  const updateSetting = useCallback(<K extends keyof DeviceSettings>(
    key: K,
    value: DeviceSettings[K],
  ) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      saveMutation.mutate(updated);
      return updated;
    });
  }, [saveMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback((changes: Partial<DeviceSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...changes };
      saveMutation.mutate(updated);
      return updated;
    });
  }, [saveMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissTip = useCallback((tipId: string) => {
    setSettings(prev => {
      if (prev.dismissedTips.includes(tipId)) return prev;
      const updated = { ...prev, dismissedTips: [...prev.dismissedTips, tipId] };
      saveMutation.mutate(updated);
      return updated;
    });
  }, [saveMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTipDismissed = useCallback((tipId: string) =>
    settings.dismissedTips.includes(tipId),
  [settings.dismissedTips]);

  // Memoize the context value so consumers only re-render when something
  // they actually use has changed — not on every parent render cycle.
  return useMemo(
    () => ({ settings, updateSetting, updateSettings, activeTheme, uiTokens, dismissTip, isTipDismissed }),
    [settings, updateSetting, updateSettings, activeTheme, uiTokens, dismissTip, isTipDismissed], // eslint-disable-line react-hooks/exhaustive-deps
  );
});
