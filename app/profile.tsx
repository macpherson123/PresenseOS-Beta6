import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useUser } from '@/contexts/UserContext';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Camera, Shield, Music2, UserCircle,
} from 'lucide-react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateUser } = useUser();
  const { activeTheme: t } = useSettings();
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(user.username);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        updateUser({ profilePicture: result.assets[0].uri });
      }
    } catch (e) {
      console.log('Image picker error:', e);
    }
  }, [updateUser]);

  const saveUsername = useCallback(() => {
    if (newUsername.trim()) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      updateUser({ username: newUsername.trim() });
      setEditingUsername(false);
    }
  }, [newUsername, updateUser]);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <PhilosophyBanner screen="profile" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <Pressable style={styles.avatarWrap} onPress={pickImage}>
            {user.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: t.surface, borderColor: t.border }]}>
                <UserCircle size={48} color={t.textMuted} />
              </View>
            )}
            <View style={[styles.cameraIcon, { backgroundColor: t.accent, borderColor: t.bg }]}>
              <Camera size={14} color={t.white} />
            </View>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: t.textMuted }]}>USER ID</Text>
            <View style={styles.idBadge}>
              <Shield size={12} color={t.accent} />
              <Text style={[styles.idText, { color: t.accent }]}>{user.userId}</Text>
            </View>
          </View>
          <View style={[styles.cardDivider, { backgroundColor: t.border }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: t.textMuted }]}>USERNAME</Text>
            {editingUsername ? (
              <View style={styles.editRow}>
                <TextInput
                  style={[styles.editInput, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  autoFocus
                />
                <Pressable onPress={saveUsername} style={[styles.saveBtn, { backgroundColor: t.accent }]}>
                  <Text style={[styles.saveBtnText, { color: t.bg }]}>Save</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setEditingUsername(true); setNewUsername(user.username); }}>
                <Text style={[styles.cardValue, { color: t.text }]}>{user.username || 'Not set'}</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.cardDivider, { backgroundColor: t.border }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: t.textMuted }]}>MUSIC SOURCE</Text>
            <View style={styles.musicBadge}>
              <Music2 size={12} color={t.teal} />
              <Text style={[styles.musicText, { color: t.teal }]}>
                {user.musicService === 'local' ? 'Local Files' :
                  user.musicService.charAt(0).toUpperCase() + user.musicService.slice(1)}
              </Text>
            </View>
          </View>
          <View style={[styles.cardDivider, { backgroundColor: t.border }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: t.textMuted }]}>COMPANION</Text>
            <Text style={[styles.cardValue, { color: t.text }]}>
              {user.companionId || 'Not set'}
            </Text>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: t.accentDim, borderColor: t.accent + '20' }]}>
          <Text style={[styles.infoTitle, { color: t.accent }]}>Your identity on presenceOS</Text>
          <Text style={[styles.infoBody, { color: t.textSecondary }]}>
            Your User ID is permanent and cannot be changed. Your username can be updated at any time. Your profile is private — there is no public discovery or lookup.
          </Text>
        </View>

        <Pressable
          style={[styles.companionBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          onPressIn={() => router.push('/companion' as never)}
        >
          <Text style={[styles.companionBtnText, { color: t.text }]}>
            {user.companionId ? 'Manage Companion' : 'Set Up Companion'}
          </Text>
        </Pressable>
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  avatarWrap: {
    position: 'relative' as const,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cameraIcon: {
    position: 'absolute' as const,
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  cardRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 2,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  cardDivider: {
    height: 1,
    marginLeft: 16,
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  idText: {
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  musicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  musicText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    borderWidth: 1,
  },
  saveBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  infoCard: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  companionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  companionBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
});

