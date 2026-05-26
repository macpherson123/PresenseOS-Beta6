import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSettings } from '@/contexts/SettingsContext';
import { useContacts } from '@/contexts/ContactsContext';
import { usePresenceNet } from '@/contexts/PresenceNetContext';
import { useUser } from '@/contexts/UserContext';
import {
  ChevronLeft, Send, Phone as PhoneIcon, Video, Clock, Camera, Image as ImageIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getTimeRemaining(expiresAt: string): string {
  if (!expiresAt || expiresAt === 'unlimited') return 'unlimited';
  const now = new Date();
  const expires = new Date(expiresAt);
  if (isNaN(expires.getTime())) return 'unlimited';
  const diffMs = expires.getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h remaining`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d remaining`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const { contacts, getConversation, getConversationMessages, sendMessage, markAsRead } = useContacts();
  const { user } = useUser();
  const { sendNetMessage, callContact } = usePresenceNet();
  const [messageText, setMessageText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const conversation = useMemo(() => getConversation(id ?? ''), [id, getConversation]);
  const messages = useMemo(() => getConversationMessages(id ?? ''), [id, getConversationMessages]);

  const markedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (id && id !== markedRef.current) {
      markedRef.current = id;
      markAsRead(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: read image as base64 and send via relay
  const sendImageOverRelay = useCallback(async (uri: string, convId: string) => {
    if (!conversation?.contactId) return;
    const contact = contacts.find(c => c.id === conversation.contactId);
    if (!contact) return;
    try {
      // Compress to jpeg and read as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Prefix so receiver knows it's an image payload
      const payload = `__img__:${base64}`;
      sendNetMessage(contact.id, payload, convId).then(ok => {
        if (!ok) console.warn('[Chat] Image relay failed — recipient may be offline');
      });
    } catch (e) {
      console.warn('[Chat] Failed to encode image:', e);
    }
  }, [conversation, contacts, sendNetMessage]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,  // reduce size for relay transport
    });
    if (!result.canceled && result.assets[0] && id) {
      const asset = result.assets[0];
      sendMessage(id, '[Image]', 'me', 'image', asset.uri);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      await sendImageOverRelay(asset.uri, id);
    }
  }, [id, sendMessage, sendImageOverRelay]);

  const handleCameraCapture = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0] && id) {
      const asset = result.assets[0];
      sendMessage(id, '[Image]', 'me', 'image', asset.uri);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      await sendImageOverRelay(asset.uri, id);
    }
  }, [id, sendMessage, sendImageOverRelay]);


  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !id || !conversation) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const text = messageText.trim();
    setMessageText('');
    // Save locally immediately (optimistic)
    sendMessage(id, text, 'me');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    // Transmit over relay
    if (conversation?.contactId) {
      const contact = contacts.find(c => c.id === conversation.contactId);
      if (contact) {
        sendNetMessage(contact.id, text, id).then(ok => {
          if (!ok) console.warn('[Chat] Network send failed — recipient may be offline');
        });
      }
    }
  }, [messageText, id, conversation, contacts, sendMessage, sendNetMessage]);

  if (!conversation) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: t.surface, borderBottomColor: t.border }]}>
          <Pressable onPressIn={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <ChevronLeft size={22} color={t.text} />
          </Pressable>
          <Text style={[styles.headerName, { color: t.text }]}>Chat</Text>
          <View style={{ width: 68 }} />
        </View>
        <View style={styles.emptyChat}>
          <Text style={[styles.errorText, { color: t.textMuted }]}>Conversation not found</Text>
          <Pressable
            style={[styles.backToMessages, { borderColor: t.accent + '40' }]}
            onPressIn={() => router.back()}
          >
            <Text style={[styles.backToMessagesText, { color: t.accent }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const timeRemaining = getTimeRemaining(conversation.expiresAt);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <Pressable onPressIn={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={22} color={t.text} />
        </Pressable>

        <View style={styles.headerCenter}>
          {conversation.contactPicture ? (
            <Image source={{ uri: conversation.contactPicture }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback, { backgroundColor: t.card }]}>
              <Text style={[styles.headerAvatarText, { color: t.text }]}>
                {conversation.contactName[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View>
            <Text style={[styles.headerName, { color: t.text }]}>{conversation.contactName}</Text>
            <View style={styles.timerRow}>
              <Clock size={9} color={t.textMuted} />
              <Text style={[styles.timerText, { color: t.textMuted }]}>{timeRemaining}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: t.card }]}
            hitSlop={8}
            onPress={() => {
              const contact = contacts.find(c => c.id === conversation?.contactId);
              if (contact) { callContact(contact.id, contact.username, false); router.push('/video-call' as never); }
            }}
          >
            <PhoneIcon size={18} color={t.teal} />
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: t.card }]}
            hitSlop={8}
            onPress={() => {
              const contact = contacts.find(c => c.id === conversation?.contactId);
              if (contact) { callContact(contact.id, contact.username, true); router.push('/video-call' as never); }
            }}
          >
            <Video size={18} color={t.accent} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View style={styles.encryptedBanner}>
            <Text style={[styles.encryptedText, { color: t.textMuted }]}>
              End-to-end encrypted · P2P connection
            </Text>
            <Text style={[styles.durationText, { color: t.textMuted }]}>
              Agreed duration: {conversation.agreedDuration}
            </Text>
          </View>

          {messages.length === 0 && (
            <View style={styles.noMessages}>
              <Text style={[styles.noMessagesText, { color: t.textMuted }]}>
                No messages yet. Say hello!
              </Text>
            </View>
          )}

          {messages.map((msg) => {
            const isMe = msg.senderId === 'me';
            return (
              <View
                key={msg.id}
                style={[
                  styles.bubble,
                  msg.mediaUri && styles.bubbleMedia,
                  isMe
                    ? [styles.bubbleMe, { backgroundColor: t.accent }]
                    : [styles.bubbleThem, { backgroundColor: t.surface, borderColor: t.border }],
                ]}
              >
                {msg.mediaUri && msg.type === 'image' ? (
                  <Image
                    source={{ uri: msg.mediaUri }}
                    style={{ width: 200, height: 150, borderRadius: 10, marginBottom: 2 }}
                    contentFit="cover"
                  />
                ) : msg.mediaUri && msg.type === 'video' ? (
                  <Pressable
                    style={{ width: 200, height: 150, borderRadius: 10, marginBottom: 2, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {/* TODO: open video player */}}
                  >
                    <Video size={40} color={t.accent} />
                    <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 6 }}>Video</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.bubbleText, { color: isMe ? t.bg : t.text }]}>
                    {msg.text}
                  </Text>
                )}
                <Text style={[styles.bubbleTime, { color: isMe ? t.bg + '80' : t.textMuted }]}>
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable style={styles.attachBtn} onPress={handleCameraCapture}>
            <Camera size={20} color={t.textMuted} />
          </Pressable>
          <Pressable style={styles.attachBtn} onPress={handlePickImage}>
            <ImageIcon size={20} color={t.textMuted} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Message..."
            placeholderTextColor={t.textMuted}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable
            style={[
              styles.sendBtn,
              { backgroundColor: messageText.trim() ? t.accent : t.card },
            ]}
            onPress={handleSend}
            disabled={!messageText.trim()}
          >
            <Send size={18} color={messageText.trim() ? t.bg : t.textMuted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  timerText: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  encryptedBanner: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
  },
  encryptedText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  durationText: {
    fontSize: 10,
    marginTop: 2,
    opacity: 0.6,
  },
  noMessages: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noMessagesText: {
    fontSize: 14,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 2,
  },
  bubbleMedia: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center' as const,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  backToMessages: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  backToMessagesText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
});

