/**
 * presenceOS — PowerMenu
 * Shown when the hardware power button is held (or via the _layout hook).
 * Options: Lock, Restart, Recovery, Bootloader, Power Off
 */
import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, NativeModules, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Lock, RotateCcw, Zap, Power, ChevronRight } from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';

const { PresenceDeviceControl } = NativeModules;

interface PowerMenuProps {
  visible: boolean;
  onClose: () => void;
  onLock: () => void;
}

const POWER_OPTIONS = [
  { id: 'lock',       label: 'Lock Screen',  sub: 'Lock immediately',        icon: Lock,      color: '#E8A838' },
  { id: 'restart',    label: 'Restart',       sub: 'Normal reboot',           icon: RotateCcw, color: '#42A5F5' },
  { id: 'recovery',   label: 'Recovery',      sub: 'Boot into recovery',      icon: Zap,       color: '#AB47BC' },
  { id: 'bootloader', label: 'Bootloader',    sub: 'Boot into fastboot',      icon: Zap,       color: '#FF7043' },
  { id: 'poweroff',   label: 'Power Off',     sub: 'Shut down the device',    icon: Power,     color: '#E85454' },
] as const;

export default function PowerMenu({ visible, onClose, onLock }: PowerMenuProps) {
  const { activeTheme: t } = useSettings();

  const handleOption = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onClose();

    if (id === 'lock') {
      setTimeout(onLock, 200);
      return;
    }

    if (id === 'poweroff') {
      Alert.alert('Power Off', 'Are you sure you want to shut down?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Power Off', style: 'destructive', onPress: async () => {
          try { await PresenceDeviceControl?.powerOff(); } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not power off');
          }
        }},
      ]);
      return;
    }

    const rebootReasons: Record<string, string | null> = {
      restart: null,
      recovery: 'recovery',
      bootloader: 'bootloader',
    };

    if (id in rebootReasons) {
      const label = POWER_OPTIONS.find(o => o.id === id)?.label ?? 'Reboot';
      Alert.alert(label, `Are you sure you want to reboot into ${label.toLowerCase()}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: label, style: 'destructive', onPress: async () => {
          try { await PresenceDeviceControl?.rebootDevice(rebootReasons[id]); }
          catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not reboot'); }
        }},
      ]);
    }
  }, [onClose, onLock]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.title, { color: t.textMuted }]}>POWER OPTIONS</Text>
          {POWER_OPTIONS.map((opt, i) => {
            const Icon = opt.icon;
            return (
              <Pressable
                key={opt.id}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: t.border },
                  i < POWER_OPTIONS.length - 1 && styles.rowBorder,
                  pressed && { backgroundColor: opt.color + '12' },
                ]}
                onPress={() => handleOption(opt.id)}
              >
                <View style={[styles.iconWrap, { backgroundColor: opt.color + '18', borderColor: opt.color + '40' }]}>
                  <Icon size={18} color={opt.color} strokeWidth={1.8} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: t.text }]}>{opt.label}</Text>
                  <Text style={[styles.rowSub, { color: t.textMuted }]}>{opt.sub}</Text>
                </View>
                <ChevronRight size={16} color={t.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    width: 300,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 1 },
});
