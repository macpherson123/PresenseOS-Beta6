/**
 * PowerButtonHandler
 * Listens for powerButtonPress and powerButtonLongPress events from MainActivity.
 * - Single press: lock the app (show PIN screen)
 * - Long press: show reboot/power-off menu
 *
 * Rendered once at the root layout level.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Power, RotateCcw, RefreshCw, X } from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';

const { PresenceDeviceControl } = NativeModules;

export default function PowerButtonHandler() {
  const { activeTheme: t } = useSettings();
  const { lockApp } = useUser();
  const [showMenu, setShowMenu] = useState(false);

  const handleSinglePress = useCallback(() => {
    // Single press: lock screen
    lockApp();
    if (PresenceDeviceControl?.lockScreen) {
      PresenceDeviceControl.lockScreen().catch(() => {});
    }
  }, [lockApp]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setShowMenu(true);
  }, []);

  useEffect(() => {
    const singleSub = DeviceEventEmitter.addListener('powerButtonPress', handleSinglePress);
    const longSub   = DeviceEventEmitter.addListener('powerButtonLongPress', handleLongPress);
    return () => {
      singleSub.remove();
      longSub.remove();
    };
  }, [handleSinglePress, handleLongPress]);

  const actions = [
    {
      label: 'Power Off',
      icon: <Power size={22} color={t.red} />,
      color: t.red,
      onPress: async () => {
        setShowMenu(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (PresenceDeviceControl?.powerOff) {
          await PresenceDeviceControl.powerOff();
        }
      },
    },
    {
      label: 'Reboot',
      icon: <RefreshCw size={22} color={t.accent} />,
      color: t.accent,
      onPress: async () => {
        setShowMenu(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (PresenceDeviceControl?.rebootDevice) {
          await PresenceDeviceControl.rebootDevice(null);
        }
      },
    },
    {
      label: 'Recovery',
      icon: <RotateCcw size={22} color={t.teal} />,
      color: t.teal,
      onPress: async () => {
        setShowMenu(false);
        if (PresenceDeviceControl?.rebootDevice) {
          await PresenceDeviceControl.rebootDevice('recovery');
        }
      },
    },
  ];

  return (
    <Modal
      visible={showMenu}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setShowMenu(false)}
    >
      <Pressable style={styles.backdrop} onPress={() => setShowMenu(false)}>
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.menuHeader}>
            <Text style={[styles.menuTitle, { color: t.textMuted }]}>POWER</Text>
            <Pressable onPress={() => setShowMenu(false)} hitSlop={12}>
              <X size={16} color={t.textMuted} />
            </Pressable>
          </View>

          {actions.map((action, i) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [
                styles.menuRow,
                { borderTopColor: t.border },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: t.card },
              ]}
              onPress={action.onPress}
            >
              {action.icon}
              <Text style={[styles.menuLabel, { color: action.color }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    width: 260,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  menuTitle: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 3,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
});
