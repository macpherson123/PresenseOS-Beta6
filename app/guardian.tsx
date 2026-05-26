import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform, Animated, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@/contexts/UserContext';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, ShieldCheck, Plus, Trash2, Phone, MapPin,
  AlertTriangle, Heart, ChevronRight, Users, Radio, Eye, EyeOff,
} from 'lucide-react-native';

interface Guardian {
  id: string;
  name: string;
  userId: string;
  addedAt: string;
}

const MOCK_GUARDIANS: Guardian[] = [];

export default function GuardianScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { activeTheme: t } = useSettings();
  const [guardians, setGuardians] = useState<Guardian[]>(MOCK_GUARDIANS);
  const [showAdd, setShowAdd] = useState(false);
  const [newGuardianCode, setNewGuardianCode] = useState('');
  const [newGuardianName, setNewGuardianName] = useState('');
  const [safetyWordEnabled, setSafetyWordEnabled] = useState(false);
  const [safetyWord, setSafetyWord] = useState('');
  const [showSafetyWord, setShowSafetyWord] = useState(false);
  const [locationShareOnAlert, setLocationShareOnAlert] = useState(true);
  const [voiceRelayEnabled, setVoiceRelayEnabled] = useState(false);
  const [missedCallThreshold, setMissedCallThreshold] = useState(3);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleAddGuardian = useCallback(() => {
    if (!newGuardianCode.trim() || !newGuardianName.trim()) return;
    if (guardians.length >= 3) {
      Alert.alert('Maximum Guardians', 'You can have a maximum of 3 guardians.');
      return;
    }
    haptic();
    const newG: Guardian = {
      id: `g_${Date.now()}`,
      name: newGuardianName.trim(),
      userId: newGuardianCode.trim().toUpperCase(),
      addedAt: new Date().toISOString(),
    };
    setGuardians((prev) => [...prev, newG]);
    setNewGuardianCode('');
    setNewGuardianName('');
    setShowAdd(false);
    Alert.alert('Guardian Added', `${newG.name} has been added as a guardian. They must also add you to complete the pairing.`);
  }, [newGuardianCode, newGuardianName, guardians, haptic]);

  const handleRemoveGuardian = useCallback((g: Guardian) => {
    Alert.alert(
      'Remove Guardian',
      `Remove ${g.name} as a guardian? They will no longer receive safety alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            haptic();
            setGuardians((prev) => prev.filter((x) => x.id !== g.id));
          },
        },
      ]
    );
  }, [haptic]);

  const handleTestAlert = useCallback(() => {
    haptic();
    Alert.alert(
      'Test Alert Sent',
      'A test notification has been sent to all your guardians. This does not share your location.',
    );
  }, [haptic]);

  const cycleMissedCalls = useCallback(() => {
    haptic();
    const options = [2, 3, 5];
    const idx = options.indexOf(missedCallThreshold);
    setMissedCallThreshold(options[(idx + 1) % options.length]);
  }, [missedCallThreshold, haptic]);

  const switchTrack = (enabled: boolean, color: string) => ({
    false: t.border,
    true: color + '60',
  });

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Guardian Relay</Text>
        <View style={{ width: 32 }} />
      </View>

      <PhilosophyBanner screen="guardian" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Animated.View style={[
            styles.heroIcon,
            { backgroundColor: t.greenDim, borderColor: t.green + '30', transform: [{ scale: pulseAnim }] },
          ]}>
            <ShieldCheck size={36} color={t.green} />
          </Animated.View>
          <Text style={[styles.heroTitle, { color: t.text }]}>Emergency Contact Bridge</Text>
          <Text style={[styles.heroBody, { color: t.textSecondary }]}>
            A dignified safety net. No tracking. No monitoring.{'\n'}Only event-based alerts when you need help.
          </Text>
        </View>

        <View style={[styles.ethicsCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.ethicsRow}>
            <View style={[styles.ethicsDot, { backgroundColor: t.green }]} />
            <Text style={[styles.ethicsText, { color: t.textSecondary }]}>No always-on tracking</Text>
          </View>
          <View style={styles.ethicsRow}>
            <View style={[styles.ethicsDot, { backgroundColor: t.green }]} />
            <Text style={[styles.ethicsText, { color: t.textSecondary }]}>No background monitoring</Text>
          </View>
          <View style={styles.ethicsRow}>
            <View style={[styles.ethicsDot, { backgroundColor: t.green }]} />
            <Text style={[styles.ethicsText, { color: t.textSecondary }]}>Consent-based NFC pairing only</Text>
          </View>
          <View style={styles.ethicsRow}>
            <View style={[styles.ethicsDot, { backgroundColor: t.green }]} />
            <Text style={[styles.ethicsText, { color: t.textSecondary }]}>Local-first logic — no cloud profiling</Text>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: t.textMuted }]}>
          GUARDIANS ({guardians.length}/3)
        </Text>

        {guardians.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Users size={24} color={t.textMuted} />
            <Text style={[styles.emptyText, { color: t.textMuted }]}>No guardians added yet</Text>
            <Text style={[styles.emptySubtext, { color: t.textMuted }]}>
              Add up to 3 trusted NFC-paired contacts
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            {guardians.map((g, idx) => (
              <React.Fragment key={g.id}>
                {idx > 0 && <View style={[styles.divider, { backgroundColor: t.border }]} />}
                <View style={styles.guardianRow}>
                  <View style={[styles.guardianAvatar, { backgroundColor: t.greenDim }]}>
                    <Text style={[styles.guardianInitial, { color: t.green }]}>
                      {g.name[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.guardianInfo}>
                    <Text style={[styles.guardianName, { color: t.text }]}>{g.name}</Text>
                    <Text style={[styles.guardianId, { color: t.textMuted }]}>{g.userId}</Text>
                  </View>
                  <Pressable
                    style={[styles.removeBtn, { backgroundColor: t.redDim }]}
                    onPress={() => handleRemoveGuardian(g)}
                    hitSlop={8}
                  >
                    <Trash2 size={14} color={t.red} />
                  </Pressable>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {guardians.length < 3 && (
          <>
            {showAdd ? (
              <View style={[styles.addForm, { backgroundColor: t.surface, borderColor: t.border }]}>
                <TextInput
                  style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
                  value={newGuardianName}
                  onChangeText={setNewGuardianName}
                  placeholder="Guardian name"
                  placeholderTextColor={t.textMuted}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
                  value={newGuardianCode}
                  onChangeText={setNewGuardianCode}
                  placeholder="Their presenceOS ID (e.g. POS-ABCD1234)"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <View style={styles.addFormActions}>
                  <Pressable
                    style={[styles.cancelBtn, { borderColor: t.border }]}
                    onPress={() => { setShowAdd(false); setNewGuardianCode(''); setNewGuardianName(''); }}
                  >
                    <Text style={[styles.cancelBtnText, { color: t.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: t.green },
                      (!newGuardianCode.trim() || !newGuardianName.trim()) && styles.btnDisabled,
                    ]}
                    onPress={handleAddGuardian}
                    disabled={!newGuardianCode.trim() || !newGuardianName.trim()}
                  >
                    <Text style={[styles.confirmBtnText, { color: t.bg }]}>Add Guardian</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={[styles.addBtn, { borderColor: t.green + '40' }]}
                onPress={() => { haptic(); setShowAdd(true); }}
              >
                <Plus size={18} color={t.green} />
                <Text style={[styles.addBtnText, { color: t.green }]}>Add Guardian</Text>
              </Pressable>
            )}
          </>
        )}

        <Text style={[styles.sectionHeader, { color: t.textMuted }]}>ALERT TRIGGERS</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Phone size={18} color={t.textSecondary} />
              <View>
                <Text style={[styles.settingLabel, { color: t.text }]}>Missed Call Threshold</Text>
                <Text style={[styles.settingDesc, { color: t.textMuted }]}>
                  Alert after consecutive unanswered calls
                </Text>
              </View>
            </View>
            <Pressable onPress={cycleMissedCalls} style={styles.valueChip}>
              <Text style={[styles.valueText, { color: t.accent }]}>{missedCallThreshold} calls</Text>
              <ChevronRight size={14} color={t.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <AlertTriangle size={18} color={safetyWordEnabled ? t.accent : t.textMuted} />
              <View>
                <Text style={[styles.settingLabel, { color: t.text }]}>Safety Word</Text>
                <Text style={[styles.settingDesc, { color: t.textMuted }]}>
                  Trigger alert by entering a secret word
                </Text>
              </View>
            </View>
            <Switch
              value={safetyWordEnabled}
              onValueChange={(v) => { haptic(); setSafetyWordEnabled(v); }}
              trackColor={switchTrack(safetyWordEnabled, t.accent)}
              thumbColor={safetyWordEnabled ? t.accent : t.textMuted}
            />
          </View>

          {safetyWordEnabled && (
            <View style={[styles.safetyWordWrap, { borderTopColor: t.border }]}>
              <View style={styles.safetyWordInput}>
                <TextInput
                  style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border, flex: 1 }]}
                  value={safetyWord}
                  onChangeText={setSafetyWord}
                  placeholder="Enter your safety word"
                  placeholderTextColor={t.textMuted}
                  secureTextEntry={!showSafetyWord}
                  autoCorrect={false}
                />
                <Pressable onPress={() => setShowSafetyWord(!showSafetyWord)} hitSlop={8}>
                  {showSafetyWord
                    ? <Eye size={20} color={t.textSecondary} />
                    : <EyeOff size={20} color={t.textMuted} />
                  }
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.sectionHeader, { color: t.textMuted }]}>ALERT ACTIONS</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <MapPin size={18} color={locationShareOnAlert ? t.teal : t.textMuted} />
              <View>
                <Text style={[styles.settingLabel, { color: t.text }]}>Share Location on Alert</Text>
                <Text style={[styles.settingDesc, { color: t.textMuted }]}>
                  Last known voluntary location only
                </Text>
              </View>
            </View>
            <Switch
              value={locationShareOnAlert}
              onValueChange={(v) => { haptic(); setLocationShareOnAlert(v); }}
              trackColor={switchTrack(locationShareOnAlert, t.teal)}
              thumbColor={locationShareOnAlert ? t.teal : t.textMuted}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: t.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Radio size={18} color={voiceRelayEnabled ? t.accent : t.textMuted} />
              <View>
                <Text style={[styles.settingLabel, { color: t.text }]}>Voice Relay</Text>
                <Text style={[styles.settingDesc, { color: t.textMuted }]}>
                  Open optional voice channel to guardian
                </Text>
              </View>
            </View>
            <Switch
              value={voiceRelayEnabled}
              onValueChange={(v) => { haptic(); setVoiceRelayEnabled(v); }}
              trackColor={switchTrack(voiceRelayEnabled, t.accent)}
              thumbColor={voiceRelayEnabled ? t.accent : t.textMuted}
            />
          </View>
        </View>

        {guardians.length > 0 && (
          <Pressable
            style={[styles.testBtn, { backgroundColor: t.accentDim, borderColor: t.accent + '30' }]}
            onPress={handleTestAlert}
          >
            <Heart size={18} color={t.accent} />
            <Text style={[styles.testBtnText, { color: t.accent }]}>Send Test Alert</Text>
          </Pressable>
        )}

        <View style={[styles.infoCard, { backgroundColor: t.tealDim, borderColor: t.teal + '20' }]}>
          <ShieldCheck size={16} color={t.teal} />
          <Text style={[styles.infoText, { color: t.textSecondary }]}>
            Guardian Relay uses event-based logic only. No data is collected, stored, or transmitted unless an alert is triggered. Location is shared once, not tracked. Voice relay requires mutual consent.
          </Text>
        </View>
      </ScrollView>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: 10,
    textAlign: 'center' as const,
  },
  heroBody: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 22,
    maxWidth: 300,
  },
  ethicsCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 10,
    marginBottom: 8,
  },
  ethicsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ethicsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ethicsText: {
    fontSize: 13,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  emptySubtext: {
    fontSize: 12,
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  guardianAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianInitial: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  guardianInfo: {
    flex: 1,
  },
  guardianName: {
    fontSize: 15,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  guardianId: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginLeft: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  addForm: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
    gap: 12,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
  },
  addFormActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  safetyWordWrap: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  safetyWordInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});

