import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TouchableWithoutFeedback,
  ScrollView, Dimensions, NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  Flashlight, Lock, Camera, BookOpen, Phone, MessageCircle, MessageSquarePlus,
  Settings, FileText, AlarmClock, Music, Globe, UserPlus, Shield, Wifi, Signal,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';

const { PresenceDeviceControl } = NativeModules;
const { width: SW, height: SH } = Dimensions.get('window');

const QUICK_ITEMS = [
  { id: 'mobileData', label: 'Mobile',   icon: Signal,        type: 'toggle' },
  { id: 'wifi',       label: 'Wi-Fi',    icon: Wifi,          type: 'toggle' },
  { id: 'lock',       label: 'Lock',     icon: Lock,          type: 'toggle' },
  { id: 'newChat',    label: 'New Chat', icon: MessageSquarePlus, type: 'app', route: '__new_chat' },
  { id: 'torch',      label: 'Torch',    icon: Flashlight,    type: 'toggle' },
  { id: 'camera',     label: 'Camera',   icon: Camera,        type: 'app', route: '/camera'    },
  { id: 'notes',      label: 'Notes',    icon: BookOpen,      type: 'app', route: '/notes'     },
  { id: 'phone',      label: 'Phone',    icon: Phone,         type: 'app', route: '/phone'     },
  { id: 'messages',   label: 'Messages', icon: MessageCircle, type: 'app', route: '__messages' },
  { id: 'sms',        label: 'SMS',      icon: MessageCircle, type: 'app', route: '/sms'       },
  { id: 'settings',   label: 'Settings', icon: Settings,      type: 'app', route: '/settings'  },
  { id: 'files',      label: 'Files',    icon: FileText,      type: 'app', route: '/files'     },
  { id: 'alarm',      label: 'Alarms',   icon: AlarmClock,    type: 'app', route: '/alarm'     },
  { id: 'music',      label: 'Music',    icon: Music,         type: 'app', route: '/music'     },
  { id: 'browser',    label: 'Browser',  icon: Globe,         type: 'app', route: '/browser'   },
  { id: 'contacts',   label: 'Contacts', icon: UserPlus,      type: 'app', route: '__contacts' },
  { id: 'guardian',   label: 'Guardian', icon: Shield,        type: 'app', route: '/guardian'  },
] as const;
type ItemId = typeof QUICK_ITEMS[number]['id'];
const DEFAULT_IDS: ItemId[] = ['mobileData','wifi','lock','newChat'];
const QB_KEY = 'pOS_quick_boxes_v4';

interface QuickBoxesProps {
  accent: string; surface: string; border: string; muted: string;
  uiStyle: string; onLock: () => void; onNav: (r: string) => void; onTorch: () => void;
}

function QuickBoxesImpl({ accent, surface, border, muted, uiStyle, onLock, onNav, onTorch }: QuickBoxesProps) {
  const [ids,     setIds]     = useState<ItemId[]>(DEFAULT_IDS);
  const [editing, setEditing] = useState<number|null>(null);
  const { settings, updateSetting } = useSettings();
  // SW − wrapper paddingH (12×2) − row paddingH (16×2) − 3× gap (10×3)
  const TILE = Math.floor((SW - 56 - 30) / 4);
  const radius =
    uiStyle==='geometric' ? 6  :
    uiStyle==='classic'   ? 22 :
    uiStyle==='oldschool' ? 10 :
    uiStyle==='neon'      ? 4  :
    uiStyle==='simple'    ? 14 : 18;

  useEffect(() => { AsyncStorage.getItem(QB_KEY).then(v => { if (v) setIds(JSON.parse(v)); }); }, []);
  const persist = (next: ItemId[]) => { setIds(next); AsyncStorage.setItem(QB_KEY, JSON.stringify(next)); };

  const handlePress = (id: ItemId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === 'lock')  { onLock();  return; }
    if (id === 'torch') { onTorch(); return; }
    if (id === 'wifi') {
      const next = !settings.wifiEnabled;
      updateSetting('wifiEnabled', next);
      PresenceDeviceControl?.setWifiEnabled?.(next)?.catch?.(() => updateSetting('wifiEnabled', !next));
      return;
    }
    if (id === 'mobileData') {
      const next = !settings.mobileDataEnabled;
      updateSetting('mobileDataEnabled', next);
      PresenceDeviceControl?.setMobileDataEnabled?.(next)?.catch?.(() => updateSetting('mobileDataEnabled', !next));
      return;
    }
    const item = QUICK_ITEMS.find(a => a.id === id);
    if (item && 'route' in item) onNav(item.route as string);
  };

  const isToggleActive = (id: ItemId) => {
    if (id === 'wifi')       return settings.wifiEnabled;
    if (id === 'mobileData') return settings.mobileDataEnabled;
    return false;
  };

  return (
    <>
      <View style={QBS.row}>
        {ids.map((id, i) => {
          const item = QUICK_ITEMS.find(a => a.id === id); if (!item) return null;
          const Icon = item.icon;
          return (
            <Pressable key={id} onPress={() => handlePress(id)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setEditing(i); }}
              style={({ pressed }) => [{ width: TILE, height: TILE, borderRadius: radius, borderWidth: 1,
                backgroundColor: surface, borderColor: border, alignItems: 'center', justifyContent: 'center',
                gap: 9, opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
            >
              <Icon size={24} strokeWidth={1.4} color={isToggleActive(id) ? accent : muted} />
              <Text style={[QBS.label, { color: isToggleActive(id) ? accent : muted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => setEditing(null)}>
          <View style={QBS.overlay}>
            <TouchableWithoutFeedback>
              <View style={[QBS.picker, { backgroundColor: surface, borderColor: border }]}>
                <Text style={[QBS.pickerHdr, { color: muted }]}>ASSIGN BUTTON</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {QUICK_ITEMS.map(item => {
                    const Icon = item.icon, sel = ids[editing ?? -1] === item.id;
                    return (
                      <Pressable key={item.id}
                        onPressIn={() => { if (editing === null) return; const n = [...ids] as ItemId[]; n[editing] = item.id; persist(n); setEditing(null); }}
                        style={({ pressed }) => [QBS.pRow, { borderBottomColor: border }, pressed && { backgroundColor: accent + '12' }, sel && { backgroundColor: accent + '15' }]}
                      >
                        <View style={[QBS.pIcon, { backgroundColor: sel ? accent + '20' : accent + '08', borderColor: sel ? accent + '50' : border }]}>
                          <Icon size={16} strokeWidth={1.5} color={sel ? accent : muted} />
                        </View>
                        <Text style={[QBS.pLabel, { color: sel ? '#F0EDE8' : muted }]}>{item.label}</Text>
                        {sel && <View style={[QBS.pDot, { backgroundColor: accent }]} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const QBS = StyleSheet.create({
  row:       { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  label:     { fontSize: 10, textAlign: 'center' as const, letterSpacing: 0.1 },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center' },
  picker:    { width: SW*0.86, maxHeight: SH*0.65, borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  pickerHdr: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 2.5, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  pRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  pIcon:     { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pLabel:    { flex: 1, fontSize: 15 },
  pDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8A838' },
});

export default React.memo(QuickBoxesImpl);
