import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Share, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, Link2, Share2, Copy, Shield, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CompanionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const { user } = useUser();

  const companionLink = `presenceos://companion/join?ref=${user.userId}`;
  const shareText = `Join me on presenceOS — a distraction-free phone experience built for real connection.\n\nUse my invite link to connect as my companion:\n${companionLink}\n\nGet the companion app at: https://presenceos.app/companion`;

  const handleCopy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Clipboard.setStringAsync(companionLink);
      Alert.alert('Copied', 'Companion link copied to clipboard.');
    } catch {
      Alert.alert('Copy Failed', 'Could not copy to clipboard.');
    }
  }, [companionLink]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ message: shareText, title: 'presenceOS Companion Invite' });
    } catch {
      // User dismissed share sheet
    }
  }, [shareText]);

  return (
    <View style={[styles.container, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Companion</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: t.accentDim }]}>
          <Users size={32} color={t.accent} />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Invite a Companion</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          Share your invite link with someone you trust. They can use the presenceOS companion app to stay connected with you in a distraction-free way.
        </Text>

        <View style={[styles.linkCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.linkCardHeader}>
            <Link2 size={14} color={t.accent} />
            <Text style={[styles.linkLabel, { color: t.textMuted }]}>Your invite link</Text>
          </View>
          <Text style={[styles.linkText, { color: t.text }]} numberOfLines={2} selectable>
            {companionLink}
          </Text>
          <Pressable
            style={[styles.copyBtn, { backgroundColor: t.accentDim }]}
            onPress={handleCopy}
          >
            <Copy size={14} color={t.accent} />
            <Text style={[styles.copyBtnText, { color: t.accent }]}>Copy Link</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.shareBtn, { backgroundColor: t.accent }]}
          onPress={handleShare}
        >
          <Share2 size={18} color={t.bg} />
          <Text style={[styles.shareBtnText, { color: t.bg }]}>Share Invite</Text>
        </Pressable>

        <View style={[styles.infoCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Shield size={16} color={t.teal} />
          <Text style={[styles.infoText, { color: t.textMuted }]}>
            Your companion can see your availability status and send you messages through the companion app. You stay in full control — remove them at any time from Settings.
          </Text>
        </View>
      </View>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 32, gap: 20 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '600' as const, textAlign: 'center' as const },
  body: { fontSize: 14, textAlign: 'center' as const, lineHeight: 22, maxWidth: 320 },
  linkCard: {
    width: '100%', borderRadius: 16, padding: 16, borderWidth: 1, gap: 12,
  },
  linkCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkLabel: { fontSize: 11, letterSpacing: 1, fontWeight: '600' as const },
  linkText: { fontSize: 13, lineHeight: 20, letterSpacing: 0.3 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  copyBtnText: { fontSize: 12, fontWeight: '600' as const },
  shareBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 16, paddingVertical: 16,
  },
  shareBtnText: { fontSize: 16, fontWeight: '600' as const },
  infoCard: {
    width: '100%', flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, borderRadius: 14, padding: 16, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 19 },
});
