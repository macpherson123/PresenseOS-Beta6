import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Shield, Link2, Users, Bell, Eye, EyeOff,
  CheckCircle, XCircle, UserPlus, Unlink, Info, Heart,
} from 'lucide-react-native';
import BottomBackBar from '@/components/BottomBackBar';

const COMPANION_DATA_KEY = 'companion_app_data';

interface CompanionData {
  isCompanionMode: boolean;
  linkedUsers: { id: string; name: string; linkedAt: string }[];
  pendingBridges: { fromUser: string; toUser: string; requestedAt: string }[];
  activityLog: { action: string; timestamp: string }[];
}

const defaultCompanionData: CompanionData = {
  isCompanionMode: false,
  linkedUsers: [],
  pendingBridges: [],
  activityLog: [],
};

export default function CompanionAppScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [userCode, setUserCode] = useState('');

  const companionQuery = useQuery({
    queryKey: ['companion-data'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(COMPANION_DATA_KEY);
      return stored ? { ...defaultCompanionData, ...JSON.parse(stored) } as CompanionData : defaultCompanionData;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CompanionData) => {
      await AsyncStorage.setItem(COMPANION_DATA_KEY, JSON.stringify(data));
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['companion-data'], data);
    },
  });

  const companionData = companionQuery.data || defaultCompanionData;

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const activateCompanionMode = useCallback(() => {
    haptic();
    const updated: CompanionData = {
      ...companionData,
      isCompanionMode: true,
      activityLog: [
        { action: 'Companion mode activated', timestamp: new Date().toISOString() },
        ...companionData.activityLog,
      ],
    };
    saveMutation.mutate(updated);
    Alert.alert('Companion Mode Active', 'You can now link presenceOS users and bridge their NFC connections.');
  }, [companionData, saveMutation, haptic]);

  const addLinkedUser = useCallback(() => {
    if (!userCode.trim()) return;
    haptic();

    const exists = companionData.linkedUsers.find(u => u.id === userCode.trim().toUpperCase());
    if (exists) {
      Alert.alert('Already Linked', 'This user is already linked to your companion app.');
      return;
    }

    const updated: CompanionData = {
      ...companionData,
      linkedUsers: [
        ...companionData.linkedUsers,
        { id: userCode.trim().toUpperCase(), name: `User ${userCode.trim().slice(-4)}`, linkedAt: new Date().toISOString() },
      ],
      activityLog: [
        { action: `Linked user ${userCode.trim().toUpperCase()}`, timestamp: new Date().toISOString() },
        ...companionData.activityLog,
      ],
    };
    saveMutation.mutate(updated);
    setUserCode('');
    Alert.alert('User Linked', `${userCode.trim().toUpperCase()} has been added. They must also set you as their companion.`);
  }, [userCode, companionData, saveMutation, haptic]);

  const unlinkUser = useCallback((userId: string) => {
    haptic();
    Alert.alert(
      'Unlink User',
      `Remove ${userId} from your companion list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const updated: CompanionData = {
              ...companionData,
              linkedUsers: companionData.linkedUsers.filter(u => u.id !== userId),
              activityLog: [
                { action: `Unlinked user ${userId}`, timestamp: new Date().toISOString() },
                ...companionData.activityLog,
              ],
            };
            saveMutation.mutate(updated);
          },
        },
      ]
    );
  }, [companionData, saveMutation, haptic]);

  const bridgeUsers = useCallback(() => {
    haptic();
    if (companionData.linkedUsers.length < 2) {
      Alert.alert('Need Two Users', 'You need at least two linked presenceOS users to bridge a connection.');
      return;
    }
    const user1 = companionData.linkedUsers[0];
    const user2 = companionData.linkedUsers[1];
    Alert.alert(
      'Bridge Connection',
      `Connect ${user1.id} and ${user2.id}? Both users must have you set as their companion for this to work.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Bridge',
          onPress: () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            const updated: CompanionData = {
              ...companionData,
              activityLog: [
                { action: `Bridged ${user1.id} ↔ ${user2.id}`, timestamp: new Date().toISOString() },
                ...companionData.activityLog,
              ],
            };
            saveMutation.mutate(updated);
            Alert.alert('Connection Bridged', `${user1.id} and ${user2.id} can now communicate. Both must agree to a conversation timeframe.`);
          },
        },
      ]
    );
  }, [companionData, saveMutation, haptic]);

  if (!companionData.isCompanionMode) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          
          <Text style={[styles.headerTitle, { color: t.text }]}>Companion App</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.setupContent}>
          <View style={[styles.setupIcon, { backgroundColor: t.accentDim, borderColor: t.accent + '30' }]}>
            <Shield size={44} color={t.accent} />
          </View>
          <Text style={[styles.setupTitle, { color: t.text }]}>presenceOS Companion</Text>
          <Text style={[styles.setupBody, { color: t.textSecondary }]}>
            The Companion App allows a trusted person (like a parent) to bridge NFC connections between two presenceOS users who cannot physically meet.
          </Text>

          <View style={[styles.setupRules, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.rulesTitle, { color: t.text }]}>What a companion can do:</Text>
            <View style={styles.ruleRow}>
              <CheckCircle size={14} color={t.green} />
              <Text style={[styles.ruleText, { color: t.textSecondary }]}>Bridge NFC connections remotely</Text>
            </View>
            <View style={styles.ruleRow}>
              <CheckCircle size={14} color={t.green} />
              <Text style={[styles.ruleText, { color: t.textSecondary }]}>View shared conversations (if user opts in)</Text>
            </View>
            <View style={styles.ruleRow}>
              <XCircle size={14} color={t.red} />
              <Text style={[styles.ruleText, { color: t.textSecondary }]}>Cannot read private messages</Text>
            </View>
            <View style={styles.ruleRow}>
              <XCircle size={14} color={t.red} />
              <Text style={[styles.ruleText, { color: t.textSecondary }]}>Cannot track location</Text>
            </View>
            <View style={styles.ruleRow}>
              <XCircle size={14} color={t.red} />
              <Text style={[styles.ruleText, { color: t.textSecondary }]}>Cannot monitor activity</Text>
            </View>
          </View>

          <Pressable
            style={[styles.activateBtn, { backgroundColor: t.accent }]}
            onPress={activateCompanionMode}
          >
            <Shield size={20} color={t.bg} />
            <Text style={[styles.activateBtnText, { color: t.bg }]}>Activate Companion Mode</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Companion App</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusBanner, { backgroundColor: t.greenDim, borderColor: t.green + '20' }]}>
          <Shield size={16} color={t.green} />
          <Text style={[styles.statusText, { color: t.green }]}>Companion Mode Active</Text>
        </View>

        <View style={[styles.idCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.idLabel, { color: t.textMuted }]}>YOUR COMPANION ID</Text>
          <Text style={[styles.idValue, { color: t.accent }]}>{user.userId}</Text>
          <Text style={[styles.idHint, { color: t.textMuted }]}>
            Share this ID with presenceOS users who want to set you as their companion
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>LINKED USERS</Text>

        <View style={[styles.addUserRow, { backgroundColor: t.surface, borderColor: t.border }]}>
          <TextInput
            style={[styles.addUserInput, { color: t.text }]}
            value={userCode}
            onChangeText={setUserCode}
            placeholder="Enter user ID (e.g. POS-ABCD1234)"
            placeholderTextColor={t.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Pressable
            style={[styles.addUserBtn, { backgroundColor: t.accent }, !userCode.trim() && { opacity: 0.4 }]}
            onPress={addLinkedUser}
            disabled={!userCode.trim()}
          >
            <UserPlus size={18} color={t.bg} />
          </Pressable>
        </View>

        {companionData.linkedUsers.length === 0 ? (
          <View style={[styles.emptyUsers, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Users size={24} color={t.textMuted} />
            <Text style={[styles.emptyUsersText, { color: t.textMuted }]}>
              No users linked yet. Add presenceOS user IDs above.
            </Text>
          </View>
        ) : (
          companionData.linkedUsers.map((linkedUser) => (
            <View key={linkedUser.id} style={[styles.userCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={[styles.userAvatar, { backgroundColor: t.accentDim }]}>
                <Text style={[styles.userInitial, { color: t.accent }]}>
                  {linkedUser.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userId, { color: t.text }]}>{linkedUser.id}</Text>
                <Text style={[styles.userLinkedAt, { color: t.textMuted }]}>
                  Linked {new Date(linkedUser.linkedAt).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Pressable
                style={[styles.unlinkBtn, { backgroundColor: t.redDim }]}
                onPress={() => unlinkUser(linkedUser.id)}
                hitSlop={8}
              >
                <Unlink size={16} color={t.red} />
              </Pressable>
            </View>
          ))
        )}

        {companionData.linkedUsers.length >= 2 && (
          <>
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>BRIDGE CONNECTION</Text>
            <Pressable
              style={[styles.bridgeBtn, { backgroundColor: t.teal }]}
              onPress={bridgeUsers}
            >
              <Link2 size={20} color={t.bg} />
              <Text style={[styles.bridgeBtnText, { color: t.bg }]}>
                Bridge {companionData.linkedUsers[0].id} ↔ {companionData.linkedUsers[1].id}
              </Text>
            </Pressable>
          </>
        )}

        {companionData.activityLog.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>ACTIVITY LOG</Text>
            <View style={[styles.logCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              {companionData.activityLog.slice(0, 10).map((log, idx) => (
                <View key={idx} style={[styles.logRow, idx > 0 && { borderTopWidth: 1, borderTopColor: t.borderLight }]}>
                  <Text style={[styles.logAction, { color: t.textSecondary }]}>{log.action}</Text>
                  <Text style={[styles.logTime, { color: t.textMuted }]}>
                    {new Date(log.timestamp).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={[styles.infoCard, { backgroundColor: t.tealDim, borderColor: t.teal + '20' }]}>
          <Info size={14} color={t.teal} />
          <Text style={[styles.infoText, { color: t.textSecondary }]}>
            As a companion, you can bridge NFC connections so two presenceOS users who cannot physically meet can communicate. Both users must have you set as their companion. You cannot read their messages unless they explicitly share a conversation with you.
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
    paddingBottom: 12,
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
  setupContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  setupIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
  },
  setupTitle: {
    fontSize: 24,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  setupBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center' as const,
    marginBottom: 28,
  },
  setupRules: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 12,
    marginBottom: 28,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleText: {
    fontSize: 13,
    flex: 1,
  },
  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
  },
  activateBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  idCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 20,
  },
  idLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 3,
    marginBottom: 8,
  },
  idValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: 2,
    marginBottom: 8,
  },
  idHint: {
    fontSize: 12,
    textAlign: 'center' as const,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 8,
  },
  addUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 12,
  },
  addUserInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
    paddingVertical: 8,
  },
  addUserBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyUsers: {
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  emptyUsersText: {
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  userInfo: {
    flex: 1,
  },
  userId: {
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  userLinkedAt: {
    fontSize: 11,
    marginTop: 2,
  },
  unlinkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bridgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },
  bridgeBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  logCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  logAction: {
    fontSize: 13,
    flex: 1,
  },
  logTime: {
    fontSize: 11,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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

