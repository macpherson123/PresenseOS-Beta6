/**
 * Presence Contacts
 *
 * Pairing modes:
 *   NFC       — tap phones (/nfc-pair screen)
 *   QR        — show QR code / scan QR code   ← DEVELOPER MODE ONLY
 *
 * Both flows:
 *   1. Show identity QR / NFC
 *   2. Other device scans / taps
 *   3. BOTH users shown duration agreement (1h / 24h / 7d / 30d / Unlimited)
 *   4. Contact added only when both agree (server relays confirmation)
 *
 * Chat fix: navigates to /chat/<conversationId> not contactId
 * Expiry: "X expiring soon" pill on home screen when within 24h
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Animated,
  Alert, Modal, Dimensions, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { useSettings } from '@/contexts/SettingsContext';
import { useContacts } from '@/contexts/ContactsContext';
import { useUser } from '@/contexts/UserContext';
import { usePresenceNet } from '@/contexts/PresenceNetContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Nfc, Smartphone, MessageCircle, Trash2,
  Terminal, X, QrCode, Clock, Check, UserPlus, ScanLine,
} from 'lucide-react-native';

const { width: SW } = Dimensions.get('window');

const DURATIONS = [
  { label: '1 hour',    ms: 60*60*1000,            key: '1h'        },
  { label: '24 hours',  ms: 24*60*60*1000,          key: '24h'       },
  { label: '7 days',    ms: 7*24*60*60*1000,        key: '7d'        },
  { label: '30 days',   ms: 30*24*60*60*1000,       key: '30d'       },
  { label: 'Unlimited', ms: 0,                      key: 'unlimited' },
] as const;
type DurKey = typeof DURATIONS[number]['key'];

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' });
}
function timeLeft(expiresAt: string): string {
  if (!expiresAt || expiresAt === 'unlimited') return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000);
  return h < 24 ? `${h}h left` : `${Math.floor(h/24)}d left`;
}
function expiringSoon(expiresAt: string): boolean {
  if (!expiresAt || expiresAt === 'unlimited') return false;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 && ms < 24 * 3600000;
}

export default function ContactsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeTheme: t, settings, uiTokens: s } = useSettings();
  const { contacts, addContact, removeContact, conversations } = useContacts();
  const { user } = useUser();
  const { connected, sendPairRequest, respondToPairRequest, pendingPairRequest, pairWaiting, clearPendingPairRequest } = usePresenceNet();

  const [showMyQR,      setShowMyQR]      = useState(false);
  const [showScanner,   setShowScanner]   = useState(false);
  const [showDuration,  setShowDuration]  = useState(false);
  const [pendingCard,   setPendingCard]   = useState<{userId:string;username:string;publicKey?:string}|null>(null);
  const [selectedDur,   setSelectedDur]  = useState<DurKey>('7d');
  const [scanLocked,    setScanLocked]    = useState(false);
  const [showWaiting,   setShowWaiting]   = useState(false);
  const [showIncoming,  setShowIncoming]  = useState(false);
  const [incomingDur,   setIncomingDur]   = useState<DurKey>('7d');
  const [cameraPerms,   requestCameraPerms] = useCameraPermissions();

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.04, duration: 1400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 1400, useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [pulse]);

  // NFC pair handler from server
  useEffect(() => {
    (global as any).__presenceNFCPairHandler = (card: any) => {
      setPendingCard(card);
      setShowDuration(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    return () => { (global as any).__presenceNFCPairHandler = null; };
  }, []);

  // My identity card as JSON (for QR)
  const myCard = JSON.stringify({
    userId: user.userId, username: user.username,
    publicKey: user.publicKey ?? '', v: 1,
  });

  // QR scanning
  const handleBarcode = useCallback((result: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    try {
      const data = JSON.parse(result.data);
      if (data.v === 1 && data.userId && data.username) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowScanner(false);
        setPendingCard({ userId: data.userId, username: data.username, publicKey: data.publicKey });
        setShowDuration(true);
        return;
      }
      // Could be a presenceos:// deep link
      if (result.data.startsWith('presenceos://nfc-pair?incoming=')) {
        const raw = decodeURIComponent(result.data.replace('presenceos://nfc-pair?incoming=', ''));
        const card = JSON.parse(raw);
        if (card.v === 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowScanner(false);
          setPendingCard({ userId: card.userId, username: card.username, publicKey: card.publicKey });
          setShowDuration(true);
          return;
        }
      }
    } catch {}
    Alert.alert('Not a valid PresenceOS QR code');
    setTimeout(() => setScanLocked(false), 2000);
  }, [scanLocked]);

  const openScanner = async () => {
    if (!cameraPerms?.granted) {
      const res = await requestCameraPerms();
      if (!res.granted) { Alert.alert('Camera permission needed to scan QR codes'); return; }
    }
    setScanLocked(false);
    setShowScanner(true);
  };

  const confirmDuration = useCallback(() => {
    if (!pendingCard) return;
    const dur = DURATIONS.find(d => d.key === selectedDur)!;

    if (connected) {
      // Send pair request via relay — wait for other device to agree
      sendPairRequest(pendingCard.userId, dur.label);
      setShowDuration(false);
      setShowWaiting(true);
    } else {
      // Offline fallback — add directly (no mutual agreement possible)
      const expiresAt = dur.ms === 0 ? 'unlimited' : new Date(Date.now() + dur.ms).toISOString();
      addContact({ id: pendingCard.userId, username: pendingCard.username, publicKey: pendingCard.publicKey, connectedAt: new Date().toISOString() }, dur.label, expiresAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDuration(false); setPendingCard(null);
    }
  }, [pendingCard, selectedDur, addContact, connected, sendPairRequest]);

  // Handle pair response from the other device
  useEffect(() => {
    (global as any).__presencePairResponseHandler = (resp: any) => {
      setShowWaiting(false);
      if (resp.accepted && pendingCard) {
        const dur = DURATIONS.find(d => d.label === resp.duration) ?? DURATIONS[2];
        const expiresAt = dur.ms === 0 ? 'unlimited' : new Date(Date.now() + dur.ms).toISOString();
        addContact({ id: pendingCard.userId, username: pendingCard.username, publicKey: pendingCard.publicKey ?? resp.publicKey, connectedAt: new Date().toISOString() }, resp.duration, expiresAt);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingCard(null);
      } else {
        Alert.alert('Request Declined', 'The other device declined the connection request.');
        setPendingCard(null);
      }
    };
    return () => { (global as any).__presencePairResponseHandler = null; };
  }, [pendingCard, addContact]);

  // Show incoming pair request modal when one arrives
  useEffect(() => {
    if (pendingPairRequest) {
      const durKey = DURATIONS.find(d => d.label === pendingPairRequest.duration)?.key ?? '7d';
      setIncomingDur(durKey as DurKey);
      setShowIncoming(true);
    }
  }, [pendingPairRequest]);

  const handleAcceptIncoming = useCallback(() => {
    if (!pendingPairRequest) return;
    const dur = DURATIONS.find(d => d.key === incomingDur)!;
    // Only accept if durations match
    if (dur.label !== pendingPairRequest.duration) {
      Alert.alert('Duration Mismatch', `You selected "${dur.label}" but they proposed "${pendingPairRequest.duration}". Both must agree on the same duration.`);
      return;
    }
    // Pass pendingPairRequest.from explicitly — UUID userIds contain hyphens which
    // break the requestId.split('-')[0] fallback in the context
    respondToPairRequest(pendingPairRequest.requestId, true, dur.label, pendingPairRequest.from);
    const expiresAt = dur.ms === 0 ? 'unlimited' : new Date(Date.now() + dur.ms).toISOString();
    addContact({ id: pendingPairRequest.from, username: pendingPairRequest.fromName, publicKey: pendingPairRequest.publicKey, connectedAt: new Date().toISOString() }, dur.label, expiresAt);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowIncoming(false);
    clearPendingPairRequest(); // clear so re-entering contacts doesn't re-show the modal
  }, [pendingPairRequest, incomingDur, respondToPairRequest, addContact, clearPendingPairRequest]);

  const handleRejectIncoming = useCallback(() => {
    if (!pendingPairRequest) return;
    respondToPairRequest(pendingPairRequest.requestId, false, '', pendingPairRequest.from);
    setShowIncoming(false);
    clearPendingPairRequest();
  }, [pendingPairRequest, respondToPairRequest, clearPendingPairRequest]);

  const openChat = useCallback((contactId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const conv = conversations.find(c => c.contactId === contactId && c.isActive);
    if (conv) router.push(`/chat/${conv.id}` as never);
    else Alert.alert('No active conversation', 'This contact has no active conversation yet.');
  }, [conversations, router]);

  const removeConfirm = useCallback((contact: typeof contacts[0]) => {
    Alert.alert('Remove Contact', `Remove ${contact.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeContact(contact.id) },
    ]);
  }, [removeContact]);

  return (
    <View style={[S.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />
      <View style={S.header}>
        
        <Text style={[S.title, { color: t.text }]}>Contacts</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Pairing buttons ─────────────────────────────────────────────── */}
        <View style={S.pairRow}>
          {/* NFC — always available */}
          <Pressable style={[S.pairBtn, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}
            onPressIn={() => router.push('/nfc-pair' as never)}>
            <Nfc size={26} color={t.accent} />
            <Text style={[S.pairLabel, { color: t.text }]}>NFC Pair</Text>
            <Text style={[S.pairSub, { color: t.textMuted }]}>Tap phones</Text>
          </Pressable>

          {/* QR — developer mode only */}
          {settings.developerMode ? (
            <>
              <Pressable style={[S.pairBtn, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}
                onPress={() => setShowMyQR(true)}>
                <QrCode size={26} color={t.teal} />
                <Text style={[S.pairLabel, { color: t.text }]}>My QR</Text>
                <Text style={[S.pairSub, { color: t.textMuted }]}>Show code</Text>
              </Pressable>
              <Pressable style={[S.pairBtn, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}
                onPress={openScanner}>
                <ScanLine size={26} color={t.green} />
                <Text style={[S.pairLabel, { color: t.text }]}>Scan QR</Text>
                <Text style={[S.pairSub, { color: t.textMuted }]}>Camera</Text>
              </Pressable>
            </>
          ) : (
            <View style={[S.pairBtn, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.4, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}>
              <QrCode size={26} color={t.textMuted} />
              <Text style={[S.pairLabel, { color: t.textMuted }]}>QR Code</Text>
              <Text style={[S.pairSub, { color: t.textMuted }]}>Dev mode</Text>
            </View>
          )}
        </View>

        {!settings.developerMode && (
          <Text style={[S.devHint, { color: t.textMuted }]}>
            QR pairing requires Developer Mode (Settings → System → Developer Mode)
          </Text>
        )}

        {/* ── Contact list ─────────────────────────────────────────────────── */}
        {contacts.length > 0 && (
          <Text style={[S.sectionLabel, { color: t.textMuted, letterSpacing: s.letterSpacing, textTransform: s.uppercase ? 'uppercase' : 'none' }]}>CONNECTED ({contacts.length})</Text>
        )}

        {contacts.map(contact => {
          const conv = conversations.find(c => c.contactId === contact.id && c.isActive);
          const rem  = conv ? timeLeft(conv.expiresAt) : '';
          const soon = conv ? expiringSoon(conv.expiresAt) : false;
          return (
            <View key={contact.id} style={[S.contactRow, { borderBottomColor: t.border }]}>
              <View style={S.avatarWrap}>
                {contact.profilePicture
                  ? <Image source={{ uri: contact.profilePicture }} style={S.avatar} />
                  : <View style={[S.avatar, S.avatarFb, { backgroundColor: t.surface }]}>
                      <Text style={[S.avatarLetter, { color: t.text }]}>{contact.username[0]?.toUpperCase()}</Text>
                    </View>}
                <View style={[S.dot, { backgroundColor: t.green, borderColor: t.bg }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.contactName, { color: t.text }]}>{contact.username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Smartphone size={10} color={t.textMuted} />
                  <Text style={[S.sub, { color: t.textMuted }]}>
                    {contact.id.startsWith('dev_') ? 'Dev' : 'NFC'} · {fmtDate(contact.connectedAt)}
                  </Text>
                  {rem !== '' && (
                    <View style={[S.pill, { backgroundColor: soon ? t.redDim : t.accentDim, borderColor: soon ? t.red+'40' : t.accent+'30' }]}>
                      <Clock size={8} color={soon ? t.red : t.accent} />
                      <Text style={[S.pillTxt, { color: soon ? t.red : t.accent }]}>{rem}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={S.actions}>
                <Pressable style={[S.chip, { backgroundColor: t.accentDim, borderColor: t.accent+'30' }]}
                  onPress={() => openChat(contact.id)}>
                  <MessageCircle size={14} color={t.accent} />
                </Pressable>
                <Pressable style={[S.chip, { backgroundColor: t.redDim, borderColor: t.red+'30' }]}
                  onPress={() => removeConfirm(contact)}>
                  <Trash2 size={14} color={t.red} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {contacts.length === 0 && (
          <View style={S.empty}>
            <Text style={[S.emptyTitle, { color: t.textSecondary }]}>No contacts yet</Text>
            <Text style={[S.emptySub, { color: t.textMuted }]}>
              Pair via NFC by tapping phones together. Each connection has an agreed time limit.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ══ MY QR CODE ══════════════════════════════════════════════════════ */}
      <Modal visible={showMyQR} animationType="fade" transparent onRequestClose={() => setShowMyQR(false)}>
        <View style={[S.overlay, { backgroundColor: 'rgba(0,0,0,0.88)' }]}>
          <Pressable style={S.overlayBg} onPress={() => setShowMyQR(false)} />
          <View style={[S.qrSheet, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={S.sheetHdr}>
              <Text style={[S.sheetTitle, { color: t.text }]}>My QR Code</Text>
              <Pressable onPress={() => setShowMyQR(false)} hitSlop={12}>
                <X size={22} color={t.textMuted} />
              </Pressable>
            </View>
            <Text style={[S.sheetSub, { color: t.textMuted }]}>
              Let the other person scan this with their PresenceOS device.
            </Text>
            <Animated.View style={[S.qrWrap, { borderColor: t.accent+'60', transform: [{ scale: pulse }] }]}>
              <QRCode
                value={myCard}
                size={SW * 0.58}
                color={t.text}
                backgroundColor={t.bg}
              />
            </Animated.View>
            <Text style={[S.qrName, { color: t.text }]}>{user.username}</Text>
            <Text style={[S.qrId,   { color: t.textMuted }]}>{user.userId}</Text>
            <Text style={[S.qrNote, { color: t.textMuted }]}>
              Both devices will be prompted to agree on a connection duration before the contact is added.
            </Text>
          </View>
        </View>
      </Modal>

      {/* ══ QR SCANNER ═══════════════════════════════════════════════════════ */}
      <Modal visible={showScanner} animationType="slide" transparent={false} onRequestClose={() => setShowScanner(false)}>
        <View style={[S.scanRoot, { backgroundColor: '#000' }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
          {/* Overlay frame */}
          <View style={S.scanOverlay}>
            <View style={S.scanFrame}>
              <View style={[S.scanCorner, S.scanTL, { borderColor: t.accent }]} />
              <View style={[S.scanCorner, S.scanTR, { borderColor: t.accent }]} />
              <View style={[S.scanCorner, S.scanBL, { borderColor: t.accent }]} />
              <View style={[S.scanCorner, S.scanBR, { borderColor: t.accent }]} />
            </View>
            <Text style={S.scanHint}>Point at a PresenceOS QR code</Text>
          </View>
          <Pressable style={[S.scanClose, { backgroundColor: t.surface }]}
            onPress={() => setShowScanner(false)}>
            <X size={22} color={t.text} />
          </Pressable>
        </View>
      </Modal>

      {/* ══ DURATION AGREEMENT ═══════════════════════════════════════════════ */}
      <Modal visible={showDuration} animationType="slide" transparent onRequestClose={() => { setShowDuration(false); setPendingCard(null); }}>
        <View style={S.overlay}>
          <View style={[S.durSheet, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={S.sheetHdr}>
              <Text style={[S.sheetTitle, { color: t.text }]}>Connection Duration</Text>
              <Pressable onPress={() => { setShowDuration(false); setPendingCard(null); }} hitSlop={12}>
                <X size={22} color={t.textMuted} />
              </Pressable>
            </View>

            {pendingCard && (
              <View style={[S.previewRow, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[S.previewAvatar, { backgroundColor: t.accentDim }]}>
                  <Text style={[S.previewInitial, { color: t.accent }]}>{pendingCard.username[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={[S.previewName, { color: t.text }]}>{pendingCard.username}</Text>
                  <Text style={[S.sub, { color: t.textMuted }]}>{pendingCard.userId}</Text>
                </View>
              </View>
            )}

            <Text style={[S.durLabel, { color: t.textMuted }]}>How long should this connection last?</Text>

            {DURATIONS.map(d => (
              <Pressable key={d.key}
                style={[S.durRow, {
                  backgroundColor: selectedDur === d.key ? t.accentDim : t.surface,
                  borderColor:     selectedDur === d.key ? t.accent+'60' : t.border,
                  borderRadius: s.radiusSm, borderWidth: s.borderWidth,
                }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDur(d.key); }}>
                <Clock size={16} color={selectedDur === d.key ? t.accent : t.textMuted} />
                <Text style={[S.durTxt, { color: selectedDur === d.key ? t.accent : t.text }]}>{d.label}</Text>
                {selectedDur === d.key && <Check size={16} color={t.accent} />}
              </Pressable>
            ))}

            <Pressable style={[S.confirmBtn, { backgroundColor: t.accent }]} onPress={confirmDuration}>
              <UserPlus size={18} color={t.bg} />
              <Text style={[S.confirmTxt, { color: t.bg }]}>{connected ? 'Send Request' : 'Add Contact'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══ WAITING FOR AGREEMENT ═══════════════════════════════════════════════ */}
      <Modal visible={showWaiting} animationType="fade" transparent onRequestClose={() => { setShowWaiting(false); setPendingCard(null); }}>
        <View style={S.overlay}>
          <View style={[S.durSheet, { backgroundColor: t.bg, borderColor: t.border, alignItems: 'center' as any }]}>
            <ActivityIndicator size="large" color={t.accent} style={{ marginTop: 12 }} />
            <Text style={[S.sheetTitle, { color: t.text, textAlign: 'center' }]}>Waiting for Agreement</Text>
            <Text style={[S.sheetSub, { color: t.textMuted, textAlign: 'center' }]}>
              The other device needs to accept the connection and agree on the duration.
            </Text>
            <Pressable
              style={[S.confirmBtn, { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }]}
              onPress={() => { setShowWaiting(false); setPendingCard(null); }}
            >
              <X size={16} color={t.textMuted} />
              <Text style={[S.confirmTxt, { color: t.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══ INCOMING PAIR REQUEST ════════════════════════════════════════════════ */}
      <Modal visible={showIncoming && !!pendingPairRequest} animationType="slide" transparent onRequestClose={handleRejectIncoming}>
        <View style={S.overlay}>
          <View style={[S.durSheet, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={S.sheetHdr}>
              <Text style={[S.sheetTitle, { color: t.text }]}>Connection Request</Text>
              <Pressable onPress={handleRejectIncoming} hitSlop={12}>
                <X size={22} color={t.textMuted} />
              </Pressable>
            </View>

            {pendingPairRequest && (
              <View style={[S.previewRow, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[S.previewAvatar, { backgroundColor: t.accentDim }]}>
                  <Text style={[S.previewInitial, { color: t.accent }]}>{pendingPairRequest.fromName[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={[S.previewName, { color: t.text }]}>{pendingPairRequest.fromName}</Text>
                  <Text style={[S.sub, { color: t.textMuted }]}>Proposed: {pendingPairRequest.duration}</Text>
                </View>
              </View>
            )}

            <Text style={[S.durLabel, { color: t.textMuted }]}>Select the same duration to accept:</Text>

            {DURATIONS.map(d => (
              <Pressable key={d.key}
                style={[S.durRow, {
                  backgroundColor: incomingDur === d.key ? t.accentDim : t.surface,
                  borderColor:     incomingDur === d.key ? t.accent+'60' : t.border,
                  borderRadius: s.radiusSm, borderWidth: s.borderWidth,
                }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIncomingDur(d.key); }}>
                <Clock size={16} color={incomingDur === d.key ? t.accent : t.textMuted} />
                <Text style={[S.durTxt, { color: incomingDur === d.key ? t.accent : t.text }]}>{d.label}</Text>
                {incomingDur === d.key && <Check size={16} color={t.accent} />}
              </Pressable>
            ))}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={[S.confirmBtn, { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }]}
                onPress={handleRejectIncoming}
              >
                <Text style={[S.confirmTxt, { color: t.red }]}>Decline</Text>
              </Pressable>
              <Pressable
                style={[S.confirmBtn, { flex: 1, backgroundColor: t.accent }]}
                onPress={handleAcceptIncoming}
              >
                <Check size={16} color={t.bg} />
                <Text style={[S.confirmTxt, { color: t.bg }]}>Accept</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    <BottomBackBar />
    </View>
  );
}

const S = StyleSheet.create({
  root:           { flex:1 },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingVertical:14 },
  title:          { fontSize:17, fontWeight:'600' as const },
  scroll:         { paddingHorizontal:20, paddingBottom:40 },
  pairRow:        { flexDirection:'row', gap:10, paddingVertical:20 },
  pairBtn:        { flex:1, borderRadius:18, borderWidth:1, alignItems:'center', paddingVertical:18, gap:5 },
  pairLabel:      { fontSize:13, fontWeight:'600' as const },
  pairSub:        { fontSize:10 },
  devHint:        { fontSize:11, textAlign:'center' as const, marginBottom:12, lineHeight:16 },
  sectionLabel:   { fontSize:11, fontWeight:'700' as const, letterSpacing:2, marginBottom:12, marginTop:4 },
  contactRow:     { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:14, borderBottomWidth:1 },
  avatarWrap:     { position:'relative' as const },
  avatar:         { width:48, height:48, borderRadius:24 },
  avatarFb:       { alignItems:'center', justifyContent:'center' },
  avatarLetter:   { fontSize:18, fontWeight:'600' as const },
  dot:            { position:'absolute' as const, bottom:1, right:1, width:12, height:12, borderRadius:6, borderWidth:2 },
  contactName:    { fontSize:15, fontWeight:'500' as const, marginBottom:3 },
  sub:            { fontSize:11 },
  pill:           { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:6, paddingVertical:2, borderRadius:8, borderWidth:1 },
  pillTxt:        { fontSize:9, fontWeight:'700' as const },
  actions:        { flexDirection:'row', gap:8 },
  chip:           { width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center', borderWidth:1 },
  empty:          { alignItems:'center' as const, paddingVertical:40, gap:10 },
  emptyTitle:     { fontSize:16, fontWeight:'500' as const },
  emptySub:       { fontSize:13, textAlign:'center' as const, maxWidth:280, lineHeight:20 },
  // Modals
  overlay:        { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.6)' },
  overlayBg:      { ...StyleSheet.absoluteFillObject },
  // QR sheet
  qrSheet:        { borderTopLeftRadius:28, borderTopRightRadius:28, padding:28, borderWidth:1, gap:14, alignItems:'center' as const },
  sheetHdr:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', width:'100%' as any },
  sheetTitle:     { fontSize:18, fontWeight:'600' as const },
  sheetSub:       { fontSize:13, lineHeight:19, textAlign:'center' as const },
  qrWrap:         { borderRadius:20, borderWidth:2, padding:18, marginVertical:8 },
  qrName:         { fontSize:17, fontWeight:'600' as const },
  qrId:           { fontSize:11, letterSpacing:1 },
  qrNote:         { fontSize:11, textAlign:'center' as const, lineHeight:17 },
  // Scanner
  scanRoot:       { flex:1 },
  scanOverlay:    { flex:1, alignItems:'center', justifyContent:'center', gap:20 },
  scanFrame:      { width:250, height:250, position:'relative' as const },
  scanCorner:     { position:'absolute' as const, width:36, height:36, borderWidth:3 },
  scanTL:         { top:0, left:0,  borderRightWidth:0, borderBottomWidth:0 },
  scanTR:         { top:0, right:0, borderLeftWidth:0,  borderBottomWidth:0 },
  scanBL:         { bottom:0, left:0,  borderRightWidth:0, borderTopWidth:0 },
  scanBR:         { bottom:0, right:0, borderLeftWidth:0,  borderTopWidth:0 },
  scanHint:       { color:'#fff', fontSize:14, fontWeight:'500' as const, textShadowColor:'#000', textShadowRadius:4, textShadowOffset:{ width:0, height:1 } },
  scanClose:      { position:'absolute' as const, top:50, right:20, width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },
  // Duration
  durSheet:       { borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, borderWidth:1, gap:12 },
  previewRow:     { flexDirection:'row', alignItems:'center', gap:14, borderRadius:14, borderWidth:1, padding:14 },
  previewAvatar:  { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },
  previewInitial: { fontSize:18, fontWeight:'600' as const },
  previewName:    { fontSize:15, fontWeight:'600' as const },
  durLabel:       { fontSize:13, lineHeight:20 },
  durRow:         { flexDirection:'row', alignItems:'center', gap:12, borderRadius:14, borderWidth:1, padding:14 },
  durTxt:         { flex:1, fontSize:15 },
  confirmBtn:     { borderRadius:16, paddingVertical:16, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10 },
  confirmTxt:     { fontSize:15, fontWeight:'600' as const },
});
