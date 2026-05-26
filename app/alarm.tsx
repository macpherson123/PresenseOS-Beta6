import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  TextInput, Switch, Alert, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, AlarmClock, Plus, Trash2, Bell, BellOff, X, Check,
} from 'lucide-react-native';

const ALARMS_KEY = 'presence_alarms';

interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
  days: number[]; // 0=Sun 1=Mon ... 6=Sat
  repeat: boolean;
}

const DAY_LABELS = ['S','M','T','W','T','F','S'];
const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function nextAlarmTime(alarm: Alarm): string {
  const now = new Date();
  const candidate = new Date();
  candidate.setHours(alarm.hour, alarm.minute, 0, 0);
  if (alarm.days.length === 0 || !alarm.repeat) {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate.toLocaleDateString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(alarm.hour, alarm.minute, 0, 0);
    if (d > now && alarm.days.includes(d.getDay())) {
      return d.toLocaleDateString('en-NZ', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }
  return `${pad(alarm.hour)}:${pad(alarm.minute)}`;
}

export default function AlarmScreen() {
  const router  = useRouter();
  const { activeTheme: t } = useSettings();
  const [alarms,     setAlarms]     = useState<Alarm[]>([]);
  const [showModal,  setShowModal]  = useState(false);
  const [editAlarm,  setEditAlarm]  = useState<Alarm | null>(null);
  const [hour,       setHour]       = useState('07');
  const [minute,     setMinute]     = useState('00');
  const [label,      setLabel]      = useState('');
  const [repeat,     setRepeat]     = useState(false);
  const [days,       setDays]       = useState<number[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(ALARMS_KEY).then(v => {
      if (v) setAlarms(JSON.parse(v));
    });
  }, []);

  const save = useCallback((updated: Alarm[]) => {
    setAlarms(updated);
    AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(updated));
  }, []);

  const openNew = () => {
    setEditAlarm(null);
    setHour('07'); setMinute('00'); setLabel(''); setRepeat(false); setDays([]);
    setShowModal(true);
  };

  const openEdit = (a: Alarm) => {
    setEditAlarm(a);
    setHour(pad(a.hour)); setMinute(pad(a.minute));
    setLabel(a.label); setRepeat(a.repeat); setDays([...a.days]);
    setShowModal(true);
  };

  const handleSave = () => {
    const h = Math.min(23, Math.max(0, parseInt(hour) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute) || 0));
    if (editAlarm) {
      save(alarms.map(a => a.id === editAlarm.id
        ? { ...a, hour: h, minute: m, label, repeat, days }
        : a));
    } else {
      const alarm: Alarm = {
        id: `alarm_${Date.now()}`,
        hour: h, minute: m,
        label: label || 'Alarm',
        enabled: true, repeat, days,
      };
      save([...alarms, alarm]);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
  };

  const toggleEnabled = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlarm = (id: string) => {
    Alert.alert('Delete Alarm', 'Remove this alarm?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => save(alarms.filter(a => a.id !== id)) },
    ]);
  };

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const sortedAlarms = [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  return (
    <View style={[S.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={S.header}>
        
        <Text style={[S.title, { color: t.text }]}>Alarms</Text>
        <Pressable onPress={openNew} hitSlop={12}>
          <Plus size={24} color={t.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={S.scroll}>
        {sortedAlarms.length === 0 && (
          <View style={S.empty}>
            <AlarmClock size={48} color={t.textMuted} />
            <Text style={[S.emptyText, { color: t.textMuted }]}>No alarms set</Text>
            <Pressable style={[S.addBtn, { borderColor: t.accent + '50' }]} onPress={openNew}>
              <Text style={[S.addBtnText, { color: t.accent }]}>Add Alarm</Text>
            </Pressable>
          </View>
        )}
        {sortedAlarms.map(alarm => (
          <Pressable key={alarm.id} style={[S.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => openEdit(alarm)}>
            <View style={S.cardLeft}>
              <Text style={[S.time, { color: alarm.enabled ? t.text : t.textMuted }]}>
                {pad(alarm.hour)}:{pad(alarm.minute)}
              </Text>
              <Text style={[S.alarmLabel, { color: t.textMuted }]}>{alarm.label}</Text>
              {alarm.repeat && alarm.days.length > 0 && (
                <Text style={[S.days, { color: t.accent }]}>
                  {alarm.days.map(d => DAY_NAMES[d]).join(' · ')}
                </Text>
              )}
              {alarm.enabled && (
                <Text style={[S.next, { color: t.teal }]}>Next: {nextAlarmTime(alarm)}</Text>
              )}
            </View>
            <View style={S.cardRight}>
              <Switch
                value={alarm.enabled}
                onValueChange={() => toggleEnabled(alarm.id)}
                trackColor={{ false: t.border, true: t.accent + '80' }}
                thumbColor={alarm.enabled ? t.accent : t.textMuted}
              />
              <Pressable onPress={() => deleteAlarm(alarm.id)} hitSlop={8} style={S.deleteBtn}>
                <Trash2 size={16} color={t.red} />
              </Pressable>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={[S.modal, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={S.modalHeader}>
              <Text style={[S.modalTitle, { color: t.text }]}>{editAlarm ? 'Edit Alarm' : 'New Alarm'}</Text>
              <Pressable onPress={() => setShowModal(false)} hitSlop={12}>
                <X size={22} color={t.textMuted} />
              </Pressable>
            </View>
            <View style={S.timeRow}>
              <TextInput
                style={[S.timeInput, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]}
                value={hour} onChangeText={setHour} keyboardType="number-pad"
                maxLength={2} placeholder="07" placeholderTextColor={t.textMuted}
              />
              <Text style={[S.timeSep, { color: t.text }]}>:</Text>
              <TextInput
                style={[S.timeInput, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]}
                value={minute} onChangeText={setMinute} keyboardType="number-pad"
                maxLength={2} placeholder="00" placeholderTextColor={t.textMuted}
              />
            </View>
            <TextInput
              style={[S.labelInput, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]}
              value={label} onChangeText={setLabel}
              placeholder="Label (optional)" placeholderTextColor={t.textMuted}
            />
            <View style={S.repeatRow}>
              <Text style={[S.repeatLabel, { color: t.text }]}>Repeat</Text>
              <Switch
                value={repeat} onValueChange={setRepeat}
                trackColor={{ false: t.border, true: t.accent + '80' }}
                thumbColor={repeat ? t.accent : t.textMuted}
              />
            </View>
            {repeat && (
              <View style={S.daysRow}>
                {DAY_LABELS.map((d, i) => (
                  <Pressable
                    key={i}
                    style={[S.dayBtn, { borderColor: days.includes(i) ? t.accent : t.border, backgroundColor: days.includes(i) ? t.accent + '20' : 'transparent' }]}
                    onPress={() => toggleDay(i)}
                  >
                    <Text style={[S.dayText, { color: days.includes(i) ? t.accent : t.textMuted }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable style={[S.saveBtn, { backgroundColor: t.accent }]} onPress={handleSave}>
              <Check size={18} color={t.bg} />
              <Text style={[S.saveBtnText, { color: t.bg }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    <BottomBackBar />
    </View>
  );
}

const S = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title:       { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.3 },
  scroll:      { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  empty:       { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyText:   { fontSize: 15 },
  addBtn:      { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginTop: 8 },
  addBtnText:  { fontSize: 14, fontWeight: '600' as const },
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 18, borderWidth: 1 },
  cardLeft:    { flex: 1, gap: 3 },
  cardRight:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  time:        { fontSize: 36, fontWeight: '200' as const, letterSpacing: 1 },
  alarmLabel:  { fontSize: 12 },
  days:        { fontSize: 11, fontWeight: '600' as const },
  next:        { fontSize: 11 },
  deleteBtn:   { padding: 4 },
  modalOverlay:{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, gap: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle:  { fontSize: 17, fontWeight: '600' as const },
  timeRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  timeInput:   { fontSize: 40, fontWeight: '200' as const, textAlign: 'center' as const, width: 80, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  timeSep:     { fontSize: 40, fontWeight: '200' as const },
  labelInput:  { borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1 },
  repeatRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  repeatLabel: { fontSize: 15 },
  daysRow:     { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dayBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dayText:     { fontSize: 12, fontWeight: '600' as const },
  saveBtn:     { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '600' as const },
});
