/**
 * OSStatusBar
 * Styled to match PresenceOS aesthetic:
 * Left: "PRESENCEOS" wordmark
 * Right: NFC · WiFi · BT · Signal · Battery — all larger, more legible
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import {
  Wifi, WifiOff, Bluetooth, BluetoothOff,
  Battery, BatteryCharging, BatteryFull, BatteryLow,
  BatteryMedium, BatteryWarning, Signal, SignalZero, Nfc,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ExBattery from 'expo-battery';

const ICON = 14;  // larger than before (was 11)

function BatteryIcon({ level, charging, color }: { level: number; charging: boolean; color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!charging) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [charging]);

  const pct = level * 100;
  const col = charging ? '#4ADE80' : pct < 15 ? '#E85454' : pct < 30 ? '#F97316' : color;
  const Icon = charging ? BatteryCharging
    : pct >= 90 ? BatteryFull
    : pct >= 50 ? Battery
    : pct >= 25 ? BatteryMedium
    : pct >= 10 ? BatteryLow
    : BatteryWarning;

  const { settings } = useSettings();
  return (
    <Animated.View style={{ opacity: charging ? pulse : 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon size={ICON} color={col} />
      {settings.showBatteryPercentage !== false && (
        <Text style={{ fontSize: 10, color: col, fontWeight: '600', letterSpacing: 0.3 }}>
          {Math.round(pct)}%
        </Text>
      )}
    </Animated.View>
  );
}

function OSStatusBarImpl() {
  const insets = useSafeAreaInsets();
  const { activeTheme: t, settings } = useSettings();
  const { user } = useUser();
  const [batteryLevel, setBatteryLevel] = useState(1);
  const batteryState = ExBattery.useBatteryState();
  const isCharging = batteryState === ExBattery.BatteryState.CHARGING ||
                     batteryState === ExBattery.BatteryState.FULL;

  useEffect(() => {
    const fetch = async () => {
      try {
        const lv = await ExBattery.getBatteryLevelAsync();
        if (lv >= 0) setBatteryLevel(lv);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[S.row, { paddingTop: Math.min(insets.top || 0, 32) + 4 }]} collapsable={false}>
      {/* Left — device ID */}
      <Text style={[S.brand, { color: t.text }]}>{user?.userId ?? 'PRESENCEOS'}</Text>

      {/* Right — status icons */}
      <View style={S.icons} collapsable={false}>
        {settings.nfcEnabled && <Nfc size={ICON} color={t.accent} />}
        {settings.wifiEnabled
          ? <Wifi    size={ICON} color={t.teal} />
          : <WifiOff size={ICON} color={t.textMuted} />}
        {settings.bluetoothEnabled
          ? <Bluetooth    size={ICON} color={t.accent} />
          : <BluetoothOff size={ICON} color={t.textMuted} />}
        {settings.mobileDataEnabled
          ? <Signal     size={ICON} color={t.textSecondary} />
          : <SignalZero size={ICON} color={t.textMuted} />}
        <BatteryIcon level={batteryLevel} charging={isCharging} color={t.text} />
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 6 },
  brand: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 7 },
});

export default React.memo(OSStatusBarImpl);
