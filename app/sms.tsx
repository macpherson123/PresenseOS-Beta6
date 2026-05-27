import React, {
  useState, useCallback, useEffect, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  FlatList, Linking, NativeModules, Platform, KeyboardAvoidingView,
  ActivityIndicator, Alert, Animated, AppState, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Plus, Send, Phone as PhoneIcon,
  MessageSquare, Search, X, User, ChevronRight,
  CircleAlert, Trash2, UserPlus,
} from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PresenceKeyboard from '@/components/PresenceKeyboard';

const { PresenceDeviceControl } = NativeModules;

// ── Types ────────────────────────────────────────────────────────────────────
interface SmsThread {
  threadId: string;
  address: string;
  contactName?: string;
  snippet: string;
  msgCount: number;
  date?: number;
}

interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: number;
  type: number; // 1=received, 2=sent
  read: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-NZ', { weekday: 'short', month: 'short', day: 'numeric' });
}

function initials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40, bg, text }: { name: string; size?: number; bg: string; text: string }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={[{ color: text, fontSize: size * 0.35, fontWeight: '600' as const }]}>{initials(name)}</Text>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function SmsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const params = useLocalSearchParams<{ number?: string }>();

  // Navigation state
  const [view, setView] = useState<'inbox' | 'thread' | 'compose'>(params.number ? 'compose' : 'inbox');
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Inbox state
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Thread view state
  const [activeThread, setActiveThread] = useState<SmsThread | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Compose state
  const [composeTarget, setComposeTarget] = useState(params.number ?? '');
  const [composeDraft, setComposeDraft] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [contactSuggestions, setContactSuggestions] = useState<Array<{ name: string; number: string }>>([]);

  // Permission / role
  const [hasDefaultRole, setHasDefaultRole] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  // Delete state
  const [swipedThreadId, setSwipedThreadId] = useState<string | null>(null);

  // Save contact modal (cross-platform, replaces Alert.prompt which is iOS-only)
  const [saveContactName, setSaveContactName] = useState('');
  const [showSaveContact, setShowSaveContact] = useState(false);

  // ── Load threads ────────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!PresenceDeviceControl) return;
    setLoadingThreads(true);
    try {
      const raw: any[] = await PresenceDeviceControl.getSmsConversations();
      const resolved = await Promise.all(
        raw.filter((th: any) => th?.address).map(async (th: any) => {
          let contactName = th.address;
          try {
            const n = await PresenceDeviceControl.getContactForNumber(th.address);
            if (n) contactName = n;
          } catch {}
          return { ...th, contactName } as SmsThread;
        })
      );
      // Always show newest conversation first
      resolved.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
      setThreads(resolved);
    } catch (e: any) {
      if (e?.message?.includes('READ_SMS')) {
        Alert.alert(
          'Permission required',
          'presenceOS needs READ_SMS permission to show messages. Grant it in Settings > Apps > presenceOS > Permissions.',
        );
      }
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  // ── Load messages for thread ──────────────────────────────────────────
  const loadMessages = useCallback(async (thread: SmsThread) => {
    if (!PresenceDeviceControl) return;
    setLoadingMessages(true);
    try {
      const msgs: SmsMessage[] = await PresenceDeviceControl.getSmsMessages(thread.threadId);
      msgs.sort((a, b) => a.date - b.date); // native returns DESC LIMIT 200; re-sort ASC for display
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
    finally { setLoadingMessages(false); }
  }, []);

  // ── Mark thread as read ────────────────────────────────────────────────
  const markRead = useCallback(async (threadId: string) => {
    try {
      if (PresenceDeviceControl?.markThreadRead) {
        await PresenceDeviceControl.markThreadRead(threadId);
      }
    } catch {}
  }, []);

  // ── Open thread ──────────────────────────────────────────────────────
  const openThread = useCallback((thread: SmsThread) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSwipedThreadId(null);
    setActiveThread(thread);
    setDraftText('');
    setView('thread');
    slideAnim.setValue(1);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    loadMessages(thread);
    markRead(thread.threadId);
  }, [loadMessages, markRead, slideAnim]);

  const goBack = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
      setView('inbox');
      setActiveThread(null);
      setMessages([]);
      loadThreads();
    });
  }, [slideAnim, loadThreads]);

  // ── Send message in active thread ────────────────────────────────────
  const sendReply = useCallback(async () => {
    if (!draftText.trim() || !activeThread || sending) return;
    const body = draftText.trim();
    setDraftText('');
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const optimistic: SmsMessage = {
      id: `opt_${Date.now()}`, address: activeThread.address,
      body, date: Date.now(), type: 2, read: 1,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      await PresenceDeviceControl.sendSms(activeThread.address, body);
      setTimeout(() => loadMessages(activeThread), 500);
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send SMS');
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setDraftText(body);
    } finally {
      setSending(false);
    }
  }, [draftText, activeThread, sending, loadMessages]);

  // ── Compose new ─────────────────────────────────────────────────────
  const openCompose = useCallback(() => {
    setComposeTarget('');
    setComposeDraft('');
    setContactSuggestions([]);
    setView('compose');
    slideAnim.setValue(1);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [slideAnim]);

  const sendCompose = useCallback(async () => {
    const to = composeTarget.trim();
    const body = composeDraft.trim();
    if (!to || !body || composeSending) return;
    setComposeSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await PresenceDeviceControl.sendSms(to, body);
      setComposeDraft('');
      const updated = await new Promise<any[]>(resolve => {
        PresenceDeviceControl.getSmsConversations().then(resolve).catch(() => resolve([]));
      });
      // Find the thread we just sent to and open it
      const thread = updated.find((t: any) => t.address === to || t.address?.replace(/\D/g,'') === to.replace(/\D/g,''));
      if (thread) {
        setActiveThread(thread);
        await loadMessages(thread);
        setView('thread');
      } else {
        await loadThreads();
        setView('inbox');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send SMS');
    } finally {
      setComposeSending(false);
    }
  }, [composeTarget, composeDraft, composeSending, loadThreads]);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2 || !PresenceDeviceControl?.searchContacts) {
      setContactSuggestions([]);
      return;
    }
    try {
      const results = await PresenceDeviceControl.searchContacts(query);
      setContactSuggestions(results as Array<{ name: string; number: string }>);
    } catch {
      setContactSuggestions([]);
    }
  }, []);

  // ── Save contact from thread ──────────────────────────────────────────
  const saveContact = useCallback(() => {
    if (!activeThread) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaveContactName('');
    setShowSaveContact(true);
  }, [activeThread]);

  const confirmSaveContact = useCallback(async () => {
    if (!activeThread || !saveContactName.trim()) return;
    const name = saveContactName.trim();
    setShowSaveContact(false);
    try {
      await PresenceDeviceControl.addContactToPhone(name, activeThread.address);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', `${name} saved to your contacts.`);
      setActiveThread(prev => prev ? { ...prev, contactName: name } : prev);
      loadThreads();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save contact');
    }
  }, [activeThread, saveContactName, loadThreads]);

  // ── Delete thread ─────────────────────────────────────────────────────
  const deleteThread = useCallback((thread: SmsThread) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Conversation',
      `Delete your conversation with ${thread.contactName ?? thread.address}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setSwipedThreadId(null) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSwipedThreadId(null);
            setThreads(prev => prev.filter(t => t.threadId !== thread.threadId));
            try {
              if (PresenceDeviceControl?.deleteThread) {
                await PresenceDeviceControl.deleteThread(thread.threadId);
              }
            } catch {
              loadThreads();
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }, [loadThreads]);

  // ── Request default SMS role ────────────────────────────────────────
  const requestRole = useCallback(async () => {
    if (!PresenceDeviceControl) return;
    try {
      await PresenceDeviceControl.requestSmsRole();
    } catch (e: any) {
      Alert.alert('Could not request SMS role', e?.message ?? '');
    }
  }, []);

  // ── Check default SMS role ────────────────────────────────────────────
  const checkRole = useCallback(async () => {
    if (PresenceDeviceControl?.isDefaultSmsApp) {
      try {
        const v: boolean = await PresenceDeviceControl.isDefaultSmsApp();
        setHasDefaultRole(v);
      } catch { setHasDefaultRole(true); } // if can't check, assume default to hide banner
    } else {
      // Native module doesn't support check — hide banner to avoid confusion
      setHasDefaultRole(true);
    }
    setCheckingRole(false);
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadThreads();
    checkRole();
  }, [loadThreads, checkRole]);

  // ── Auto-refresh: poll every 5s when in inbox ──
  useEffect(() => {
    if (view !== 'inbox') return;
    const interval = setInterval(loadThreads, 5000);
    return () => clearInterval(interval);
  }, [view, loadThreads]);

  // Refresh when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { loadThreads(); checkRole(); }
    });
    return () => sub.remove();
  }, [loadThreads, checkRole]);

  // Auto-refresh messages in thread view (poll for incoming)
  useEffect(() => {
    if (view !== 'thread' || !activeThread) return;
    const interval = setInterval(() => loadMessages(activeThread), 4000);
    return () => clearInterval(interval);
  }, [view, activeThread, loadMessages]);

  // ── Filtered threads ─────────────────────────────────────────────────
  const filteredThreads = useMemo(() => {
    if (!searchQuery) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(th =>
      (th.contactName ?? th.address).toLowerCase().includes(q) ||
      th.snippet?.toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  const slideStyle = { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 350] }) }] };
  const threadTitle = activeThread?.contactName ?? activeThread?.address ?? '';
  const isUnknownContact = activeThread && (!activeThread.contactName || activeThread.contactName === activeThread.address);

  return (
    <View style={[styles.container, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />

      {/* ── INBOX VIEW ── */}
      {(view === 'inbox') && (
        <View style={styles.flex}>
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            
            <Text style={[styles.headerTitle, { color: t.text }]}>SMS</Text>
            <Pressable onPress={openCompose} style={styles.headerAction} hitSlop={12}>
              <Plus size={22} color={t.accent} />
            </Pressable>
          </View>

          {!checkingRole && !hasDefaultRole && (
            <Pressable
              style={[styles.roleBanner, { backgroundColor: t.accentDim, borderColor: t.accent + '30' }]}
              onPress={requestRole}
            >
              <CircleAlert size={14} color={t.accent} />
              <Text style={[styles.roleBannerText, { color: t.accent }]}>
                Set as default SMS app to receive messages here
              </Text>
              <ChevronRight size={14} color={t.accent} />
            </Pressable>
          )}

          <View style={[styles.searchBar, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Search size={15} color={t.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: t.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages..."
              placeholderTextColor={t.textMuted}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {!!searchQuery && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <X size={15} color={t.textMuted} />
              </Pressable>
            )}
          </View>

          {loadingThreads && threads.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={t.accent} />
            </View>
          ) : filteredThreads.length === 0 ? (
            <View style={styles.centerBox}>
              <MessageSquare size={48} color={t.textMuted} strokeWidth={1.2} />
              <Text style={[styles.emptyText, { color: t.textMuted }]}>
                {searchQuery ? 'No matching conversations' : 'No SMS conversations'}
              </Text>
              {!searchQuery && (
                <Pressable style={[styles.newMsgBtn, { backgroundColor: t.accent }]} onPress={openCompose}>
                  <Plus size={16} color={t.bg} />
                  <Text style={[styles.newMsgBtnText, { color: t.bg }]}>New Message</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredThreads}
              keyExtractor={item => item.threadId}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: t.borderLight }]} />}
              renderItem={({ item }) => {
                const swiped = swipedThreadId === item.threadId;
                return (
                  <View style={styles.threadRowWrap}>
                    <Pressable
                      style={[styles.threadRow, swiped && { backgroundColor: t.redDim }]}
                      onPress={() => {
                        if (swiped) { setSwipedThreadId(null); return; }
                        openThread(item);
                      }}
                      onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSwipedThreadId(swiped ? null : item.threadId);
                      }}
                      delayLongPress={400}
                    >
                      <Avatar
                        name={item.contactName ?? item.address}
                        size={46}
                        bg={swiped ? t.red + '30' : t.accentDim}
                        text={swiped ? t.red : t.accent}
                      />
                      <View style={styles.threadContent}>
                        <View style={styles.threadTop}>
                          <Text style={[styles.threadName, { color: swiped ? t.red : t.text }]} numberOfLines={1}>
                            {item.contactName ?? item.address}
                          </Text>
                          {item.date ? (
                            <Text style={[styles.threadTime, { color: t.textMuted }]}>
                              {formatRelTime(item.date)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.threadSnippet, { color: t.textSecondary }]} numberOfLines={1}>
                          {swiped ? 'Tap delete to remove this conversation' : (item.snippet || '...')}
                        </Text>
                      </View>
                      {swiped && (
                        <Pressable
                          style={[styles.deleteBtn, { backgroundColor: t.red }]}
                          onPress={() => deleteThread(item)}
                          hitSlop={8}
                        >
                          <Trash2 size={18} color="#fff" />
                        </Pressable>
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── THREAD VIEW ── */}
      {(view === 'thread') && activeThread && (
        <Animated.View style={[styles.flex, slideStyle]}>
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
              <ChevronLeft size={22} color={t.text} />
            </Pressable>
            <Pressable
              style={styles.threadHeaderCenter}
              onPressIn={() => router.push(`/phone?number=${activeThread.address}` as never)}
            >
              <Avatar name={threadTitle} size={32} bg={t.accentDim} text={t.accent} />
              <View>
                <Text style={[styles.headerTitle, { color: t.text, textAlign: 'center' }]} numberOfLines={1}>
                  {threadTitle}
                </Text>
                {activeThread.contactName && activeThread.contactName !== activeThread.address && (
                  <Text style={[styles.headerSub, { color: t.textMuted }]}>{activeThread.address}</Text>
                )}
              </View>
            </Pressable>
            <View style={styles.headerActions}>
              {isUnknownContact && (
                <Pressable style={styles.headerAction} hitSlop={12} onPress={saveContact}>
                  <UserPlus size={18} color={t.accent} />
                </Pressable>
              )}
              <Pressable
                style={styles.headerAction}
                hitSlop={12}
                onPressIn={() => router.push(`/phone?number=${activeThread.address}` as never)}
              >
                <PhoneIcon size={20} color={t.accent} />
              </Pressable>
            </View>
          </View>

          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
            keyboardVerticalOffset={0}
          >
            {loadingMessages && messages.length === 0 ? (
              <View style={styles.centerBox}><ActivityIndicator color={t.accent} /></View>
            ) : (
              <ScrollView
                ref={scrollRef}
                style={styles.flex}
                contentContainerStyle={[styles.messagesList, { paddingBottom: 8 }]}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              >
                {messages.map((msg, idx) => {
                  const isSent = msg.type === 2;
                  const prevMsg = messages[idx - 1];
                  const showDateHeader = !prevMsg || (
                    new Date(msg.date).toDateString() !== new Date(prevMsg.date).toDateString()
                  );
                  const showTime = !prevMsg || (msg.date - prevMsg.date > 5 * 60 * 1000);
                  return (
                    <React.Fragment key={msg.id}>
                      {showDateHeader && (
                        <Text style={[styles.dateHeader, { color: t.textMuted }]}>
                          {formatFullDate(msg.date)}
                        </Text>
                      )}
                      {showTime && !showDateHeader && (
                        <Text style={[styles.dateSep, { color: t.textMuted }]}>
                          {formatTime(msg.date)}
                        </Text>
                      )}
                      <View style={[styles.msgRow, isSent && styles.msgRowSent]}>
                        <View style={[
                          styles.bubble,
                          isSent
                            ? [styles.bubbleSent, { backgroundColor: t.accent }]
                            : [styles.bubbleRecv, { backgroundColor: t.surface, borderColor: t.border }],
                        ]}>
                          <Text style={[styles.bubbleText, { color: isSent ? t.bg : t.text }]}>
                            {msg.body}
                          </Text>
                          <Text style={[styles.bubbleTime, { color: isSent ? t.bg + 'A0' : t.textMuted }]}>
                            {formatTime(msg.date)}
                          </Text>
                        </View>
                      </View>
                    </React.Fragment>
                  );
                })}
              </ScrollView>
            )}

            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }}>
              <PresenceKeyboard
                value={draftText}
                onChange={setDraftText}
                onSend={draftText.trim() && !sending ? sendReply : undefined}
                contacts={contactSuggestions}
              />
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}

      {/* ── COMPOSE VIEW ── */}
      {(view === 'compose') && (
        <Animated.View style={[styles.flex, slideStyle]}>
          <View style={[styles.header, { borderBottomColor: t.border }]}>
            <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
              <ChevronLeft size={22} color={t.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: t.text }]}>New Message</Text>
            <View style={{ width: 36 }} />
          </View>

          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            <View style={styles.composeTo}>
              <Text style={[styles.composeToLabel, { color: t.textMuted }]}>To:</Text>
              <TextInput
                style={[styles.composeToInput, { color: t.text }]}
                value={composeTarget}
                onChangeText={(v) => {
                  setComposeTarget(v);
                  if (v.length >= 2 && /[a-zA-Z]/.test(v)) {
                    searchContacts(v);
                  } else {
                    setContactSuggestions([]);
                  }
                }}
                placeholder="Phone number or name..."
                placeholderTextColor={t.textMuted}
                keyboardType="default"
                autoFocus
                returnKeyType="next"
              />
              {!!composeTarget && (
                <Pressable onPress={() => { setComposeTarget(''); setContactSuggestions([]); }} hitSlop={8}>
                  <X size={15} color={t.textMuted} />
                </Pressable>
              )}
            </View>
            {contactSuggestions.length > 0 && (
              <View style={[styles.suggestionBox, { backgroundColor: t.surface, borderColor: t.border }]}>
                {contactSuggestions.map((c, i) => (
                  <Pressable
                    key={c.number}
                    style={[styles.suggestionRow, i < contactSuggestions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}
                    onPress={() => {
                      setComposeTarget(c.number);
                      setContactSuggestions([]);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <User size={14} color={t.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestionName, { color: t.text }]}>{c.name}</Text>
                      <Text style={[styles.suggestionNumber, { color: t.textMuted }]}>{c.number}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={[styles.composeDivider, { backgroundColor: t.border }]} />

            <View style={styles.composeMsgArea}>
              <TextInput
                style={[styles.composeMsgInput, { color: t.text }]}
                value={composeDraft}
                onChangeText={setComposeDraft}
                placeholder="Write a message..."
                placeholderTextColor={t.textMuted}
                multiline
                maxLength={1600}
                textAlignVertical="top"
              />
            </View>

            <View style={[styles.inputRow, { borderTopColor: t.border, backgroundColor: t.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.charCount, { color: t.textMuted }]}>
                  {composeDraft.length}/1600
                </Text>
              </View>
              <Pressable
                style={[styles.sendBtn, { backgroundColor: (composeTarget.trim() && composeDraft.trim()) ? t.accent : t.surface }]}
                onPress={sendCompose}
                disabled={!composeTarget.trim() || !composeDraft.trim() || composeSending}
              >
                {composeSending
                  ? <ActivityIndicator size="small" color={t.bg} />
                  : <Send size={18} color={(composeTarget.trim() && composeDraft.trim()) ? t.bg : t.textMuted} />}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
      {/* Save contact modal */}
      <Modal visible={showSaveContact} transparent animationType="fade" onRequestClose={() => setShowSaveContact(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowSaveContact(false)}>
          <Pressable style={[styles.saveModal, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
            <Text style={[styles.saveModalTitle, { color: t.text }]}>Save Contact</Text>
            <Text style={[styles.saveModalSub, { color: t.textMuted }]}>{activeThread?.address}</Text>
            <TextInput
              style={[styles.saveModalInput, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
              value={saveContactName}
              onChangeText={setSaveContactName}
              placeholder="Contact name"
              placeholderTextColor={t.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmSaveContact}
            />
            <View style={styles.saveModalBtns}>
              <Pressable style={[styles.saveModalBtn, { borderColor: t.border }]} onPress={() => setShowSaveContact(false)}>
                <Text style={{ color: t.textMuted, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveModalBtn, { backgroundColor: t.accent }]} onPress={confirmSaveContact}>
                <Text style={{ color: t.bg, fontSize: 15, fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.3, flex: 1, textAlign: 'center' },
  headerSub: { fontSize: 11, textAlign: 'center', marginTop: 1 },
  headerAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  threadHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  roleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  roleBannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 8, borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  listContent: { paddingVertical: 4 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  threadRowWrap: { overflow: 'hidden' },
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  deleteBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  threadContent: { flex: 1 },
  threadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  threadName: { fontSize: 15, fontWeight: '500' as const, flex: 1, marginRight: 8 },
  threadTime: { fontSize: 12 },
  threadSnippet: { fontSize: 13, lineHeight: 18 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' as const },
  newMsgBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  newMsgBtnText: { fontSize: 14, fontWeight: '600' as const },
  messagesList: { paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  dateHeader: { textAlign: 'center' as const, fontSize: 12, fontWeight: '500' as const, marginVertical: 12, letterSpacing: 0.3 },
  dateSep: { textAlign: 'center' as const, fontSize: 11, marginVertical: 8 },
  msgRow: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 1 },
  msgRowSent: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleSent: { borderBottomRightRadius: 4 },
  bubbleRecv: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' as const },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  msgInput: {
    flex: 1, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, maxHeight: 120, lineHeight: 20,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  composeTo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  composeToLabel: { fontSize: 15, fontWeight: '500' as const },
  composeToInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  composeDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  composeMsgArea: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  composeMsgInput: { flex: 1, fontSize: 15, lineHeight: 22 },
  charCount: { fontSize: 11, textAlign: 'right' as const, marginRight: 8, marginBottom: 4 },
  suggestionBox: {
    marginHorizontal: 16, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', zIndex: 10,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  suggestionName: { fontSize: 14, fontWeight: '500' as const },
  suggestionNumber: { fontSize: 12, marginTop: 1 },
  saveModal: { width: 300, borderRadius: 20, padding: 24, borderWidth: 1, gap: 12 },
  saveModalTitle: { fontSize: 17, fontWeight: '600' as const, textAlign: 'center' as const },
  saveModalSub: { fontSize: 13, textAlign: 'center' as const, marginBottom: 4 },
  saveModalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  saveModalBtns: { flexDirection: 'row' as const, gap: 10, marginTop: 4 },
  saveModalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' as const, borderWidth: 1 },
});
