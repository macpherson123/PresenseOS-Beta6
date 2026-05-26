/**
 * NFC Pairing Screen
 *
 * Device A (host):
 *   1. Writes its identity card (userId + username + publicKey) to NFC tag
 *   2. Waits for Device B to complete via signal server
 *
 * Device B (scanner):
 *   1. Reads NFC tag → gets Device A's identity
 *   2. Sends its own identity back via signal server
 *   3. Both devices now have each other as contacts with public keys
 *
 * NFC is accompanied by a QR code fallback — tap the QR to deep-link
 * directly into this screen on Device B pre-filled with Device A's data.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  Animated, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import { useContacts } from '@/contexts/ContactsContext';
import { usePresenceNet } from '@/contexts/PresenceNetContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Nfc, QrCode, Check, Wifi, Shield, Clock } from 'lucide-react-native';

// ── Identity card exchanged over NFC ─────────────────────────────────────────
interface IdentityCard {
  userId:    string;
  username:  string;
  publicKey: string;
  v:         1;         // protocol version
}

// ── Modes ─────────────────────────────────────────────────────────────────────
type Mode = 'choose' | 'host' | 'scan' | 'confirm' | 'done' | 'error';

// ── NFC init ──────────────────────────────────────────────────────────────────
let nfcStarted = false;
async function ensureNfc() {
  if (nfcStarted) return true;
  try {
    await NfcManager.start();
    nfcStarted = true;
    return true;
  } catch {
    return false;
  }
}

export default function NfcPairScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ incoming?: string }>();
  const { activeTheme: t } = useSettings();
  const { user } = useUser();
  const { addContact } = useContacts();
  const {
    connected,
    sendPairRequest,
    respondToPairRequest,
    pendingPairRequest,
    clearPendingPairRequest,
  } = usePresenceNet();

  // Clear any stale pair request on mount
  React.useEffect(() => {
    clearPendingPairRequest();
  }, []);
  const { settings } = useSettings();

  const [mode, setMode]           = useState<Mode>('choose');
  const [nfcOk, setNfcOk]         = useState(false);
  const [theirCard, setTheirCard]  = useState<IdentityCard | null>(null);
  const [status, setStatus]        = useState('');

  const pulse   = useRef(new Animated.Value(1)).current;
  const mounted = useRef(true);

  useEffect(() => {
    ensureNfc().then(ok => { if (mounted.current) setNfcOk(ok); });

    // If opened via deep link with incoming card (QR fallback)
    if (params.incoming) {
      try {
        const card = JSON.parse(decodeURIComponent(params.incoming)) as IdentityCard;
        setTheirCard(card);
        setMode('confirm');
      } catch {}
    }

    // Register handler for server-pushed NFC completion
    (global as any).__presenceNFCPairHandler = (card: IdentityCard) => {
      if (!mounted.current) return;
      setTheirCard(card);
      setMode('confirm');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    return () => {
      mounted.current = false;
      (global as any).__presenceNFCPairHandler = null;
      (globalThis as any).__presencePairResponseHandler = null;
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  // Pulsing animation when waiting
  useEffect(() => {
    if (mode === 'host' || mode === 'scan') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.18, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [mode, pulse]);

  // ── My identity card ───────────────────────────────────────────────────────
  const myCard: IdentityCard = {
    userId:    user.userId,
    username:  user.username,
    publicKey: user.publicKey ?? '',
    v:         1,
  };
  const myCardJson = JSON.stringify(myCard);

  // ── HOST: write NFC + wait for server completion ───────────────────────────
  const startHost = useCallback(async () => {
    if (!nfcOk) { Alert.alert('NFC unavailable', 'This device does not support NFC.'); return; }
    setMode('host');
    setStatus('Hold your phone steady near your contact\'s phone…');
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const bytes = Ndef.encodeMessage([Ndef.textRecord(myCardJson)]);
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus('Tag written! Waiting for them to complete pairing…');
      // The server will push nfc:pair:incoming once they scan and confirm
    } catch (e: any) {
      if (e?.message !== 'NFC request cancelled') {
        setMode('error');
        setStatus('NFC write failed: ' + (e?.message ?? 'Unknown error'));
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }, [nfcOk, myCardJson]);

  // ── SCAN: read NFC then send our card back via server ─────────────────────
  const startScan = useCallback(async () => {
    if (!nfcOk) { Alert.alert('NFC unavailable', 'This device does not support NFC.'); return; }
    setMode('scan');
    setStatus('Hold your phone near the other device\'s NFC tag…');
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const records = tag?.ndefMessage ?? [];
      let card: IdentityCard | null = null;
      for (const rec of records) {
        try {
          const text = Ndef.text.decodePayload(rec.payload as any);
          const parsed = JSON.parse(text);
          if (parsed.v === 1 && parsed.userId && parsed.publicKey) {
            card = parsed as IdentityCard;
            break;
          }
        } catch {}
      }
      if (!card) throw new Error('Not a valid PresenceOS identity tag');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTheirCard(card);
      setMode('confirm');
    } catch (e: any) {
      if (e?.message !== 'NFC request cancelled') {
        setMode('error');
        setStatus(e?.message ?? 'Scan failed');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }, [nfcOk, connected, settings.serverUrl, myCard]);

  // ── CONFIRM: mutual duration agreement ───────────────────────────────────
  const [showDuration,   setShowDuration]   = useState(false);
  const [selectedDur,    setSelectedDur]    = useState<'1h'|'24h'|'7d'|'30d'|'unlimited'>('7d');
  const [waitingAgree,   setWaitingAgree]   = useState(false);   // waiting for other side to agree
  const [theirProposedDur, setTheirProposedDur] = useState<string|null>(null); // other side's proposal
  const [agreedDur,      setAgreedDur]      = useState<string|null>(null);    // both agreed

  const DURATIONS = [
    { label:'1 hour',    ms: 60*60*1000,      key:'1h'        as const },
    { label:'24 hours',  ms: 24*60*60*1000,   key:'24h'       as const },
    { label:'7 days',    ms: 7*24*60*60*1000, key:'7d'        as const },
    { label:'30 days',   ms: 30*24*60*60*1000,key:'30d'       as const },
    { label:'Unlimited', ms: 0,               key:'unlimited' as const },
  ];

  // Listen for incoming pair:request via PresenceNetContext
  // pendingPairRequest is set by the context when the other device sends a pair:request
  useEffect(() => {
    if (!pendingPairRequest?.requestId) return;
    // If we know who we're pairing with, check it matches — otherwise accept any request
    if (theirCard && pendingPairRequest.from !== theirCard.userId) return;
    // Populate theirCard from the request if not already set
    if (!theirCard) {
      setTheirCard({
        userId:    pendingPairRequest.from,
        username:  pendingPairRequest.fromName,
        publicKey: pendingPairRequest.publicKey ?? '',
      });
      setMode('confirm');
    }
    setTheirProposedDur(pendingPairRequest.duration);
    setSelectedDur(pendingPairRequest.duration as any); // pre-select for easy agree
    setMode('confirm');
    setShowDuration(true);
  }, [pendingPairRequest?.requestId]);

  const finaliseContact = useCallback((durKey: string) => {
    if (!theirCard) return;
    const dur = DURATIONS.find(d => d.key === durKey) ?? DURATIONS[2];
    const expiresAt = dur.ms === 0 ? 'unlimited' : new Date(Date.now() + dur.ms).toISOString();
    addContact({
      id:          theirCard.userId,
      username:    theirCard.username,
      publicKey:   theirCard.publicKey,
      connectedAt: new Date().toISOString(),
    }, dur.label, expiresAt);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowDuration(false);
    setWaitingAgree(false);
    setTheirProposedDur(null);
    setMode('done');
    // Clear from context so navigating to contacts doesn't re-show the approval prompt
    clearPendingPairRequest();
  }, [theirCard, addContact, clearPendingPairRequest]);

  // Keep pair:response handler fresh so it can call finaliseContact
  useEffect(() => {
    (globalThis as any).__presencePairResponseHandler = (resp: { agreed: boolean; duration: string }) => {
      if (!mounted.current) return;
      if (resp.agreed) {
        finaliseContact(selectedDur);
      } else {
        setTheirProposedDur(resp.duration);
        setSelectedDur(resp.duration as any);
        setWaitingAgree(false);
        setShowDuration(true);
      }
    };
    return () => { (globalThis as any).__presencePairResponseHandler = null; };
  }, [finaliseContact, selectedDur]);

  // Propose duration to other side via PresenceNetContext.sendPairRequest
  const proposeDuration = useCallback(() => {
    if (!theirCard) return;
    if (!connected) {
      Alert.alert(
        'Server Required',
        'Both devices must be connected to the PresenceOS relay to complete mutual pairing. Check your server connection in Settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    sendPairRequest(theirCard.userId, selectedDur);
    setWaitingAgree(true);
    // Timeout after 60s — notify but do NOT auto-add
    setTimeout(() => {
      setWaitingAgree(w => {
        if (w) {
          Alert.alert(
            'No Response',
            `${theirCard?.username ?? 'The other device'} hasn't responded yet. You can wait or cancel pairing.`,
            [
              { text: 'Keep Waiting', style: 'cancel' },
              { text: 'Cancel Pairing', style: 'destructive', onPress: () => {
                setWaitingAgree(false);
                setShowDuration(false);
                setMode('choose');
              }},
            ]
          );
        }
        return w;
      });
    }, 60000);
  }, [theirCard, connected, selectedDur, sendPairRequest]);

  // Respond to other side's proposal via PresenceNetContext.respondToPairRequest
  const respondToDuration = useCallback((ourDurKey: string) => {
    if (!theirCard || !pendingPairRequest) {
      finaliseContact(ourDurKey);
      return;
    }
    if (ourDurKey === theirProposedDur) {
      // Agreed — respond THEN clear, order matters
      respondToPairRequest(pendingPairRequest.requestId, true, ourDurKey, pendingPairRequest.from);
      setTimeout(() => clearPendingPairRequest(), 500);
      finaliseContact(ourDurKey);
    } else {
      // Different duration — respond then propose ours
      respondToPairRequest(pendingPairRequest.requestId, false, ourDurKey, pendingPairRequest.from);
      setTimeout(() => clearPendingPairRequest(), 500);
      setSelectedDur(ourDurKey as any);
      sendPairRequest(theirCard.userId, ourDurKey);
      setWaitingAgree(true);
    }
  }, [theirCard, pendingPairRequest, theirProposedDur, respondToPairRequest,
      clearPendingPairRequest, sendPairRequest, finaliseContact]);

  // ── Deep-link QR code URL ──────────────────────────────────────────────────
  const qrUrl = `presenceos://nfc-pair?incoming=${encodeURIComponent(myCardJson)}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <OSStatusBar />
      <View style={S.header}>
        
        <Text style={[S.title, { color: t.text }]}>Pair Device</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>

        {/* ── CHOOSE ─────────────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <View style={{ alignItems: 'center', gap: 18, paddingTop: 24 }}>
            <Animated.View style={[S.nfcCircle, {
              backgroundColor: t.accentDim, borderColor: t.accent,
              transform: [{ scale: pulse }],
            }]}>
              <Nfc size={52} color={t.accent} />
            </Animated.View>

            <Text style={[S.waitTitle, { color: t.text }]}>Tap Phones Together</Text>
            <Text style={[S.sub, { color: t.textMuted, maxWidth: 300 }]}>
              Hold this phone close to your contact's PresenceOS device. Both
              of you will be asked to agree on how long the connection lasts.
            </Text>

            {!connected && (
              <View style={[S.warnBox, { backgroundColor: t.redDim, borderColor: t.red + '40' }]}>
                <Wifi size={14} color={t.red} />
                <Text style={[S.warnText, { color: t.red }]}>Not connected to server — online pairing unavailable.</Text>
              </View>
            )}

            <Pressable style={[S.btn, { backgroundColor: t.accent, alignSelf: 'stretch' }]} onPress={startScan}>
              <Nfc size={22} color={t.bg} />
              <Text style={[S.btnTxt, { color: t.bg }]}>Start Pairing</Text>
            </Pressable>

            <Pressable onPress={startHost} hitSlop={12}>
              <Text style={{ color: t.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>
                Use this phone as the tag instead
              </Text>
            </Pressable>

            {settings.developerMode && (
              <View style={[S.qrBox, { backgroundColor: t.surface, borderColor: t.border, marginTop: 8 }]}>
                <QrCode size={18} color={t.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.qrTitle, { color: t.text }]}>QR Code Fallback</Text>
                  <Text style={[S.qrSub, { color: t.textMuted }]}>
                    If NFC is unavailable, the other person can scan a QR code of this link.
                  </Text>
                  <Text style={[S.qrLink, { color: t.accent }]} selectable numberOfLines={2}>{qrUrl}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── HOST waiting ────────────────────────────────────────────────── */}
        {mode === 'host' && (
          <View style={S.waitBox}>
            <Animated.View style={[S.nfcCircle, { backgroundColor: t.accentDim, borderColor: t.accent, transform: [{ scale: pulse }] }]}>
              <Nfc size={52} color={t.accent} />
            </Animated.View>
            <Text style={[S.waitTitle, { color: t.text }]}>NFC Tag Written</Text>
            <Text style={[S.waitSub, { color: t.textMuted }]}>{status}</Text>
            <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
            <Pressable style={[S.cancelBtn, { borderColor: t.border }]} onPress={() => { NfcManager.cancelTechnologyRequest().catch(()=>{}); setMode('choose'); }}>
              <Text style={{ color: t.textMuted, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── SCAN waiting ─────────────────────────────────────────────────── */}
        {mode === 'scan' && (
          <View style={S.waitBox}>
            <Animated.View style={[S.nfcCircle, { backgroundColor: t.accentDim, borderColor: t.accent, transform: [{ scale: pulse }] }]}>
              <Nfc size={52} color={t.accent} />
            </Animated.View>
            <Text style={[S.waitTitle, { color: t.text }]}>Ready to Scan</Text>
            <Text style={[S.waitSub, { color: t.textMuted }]}>{status}</Text>
            <Pressable style={[S.cancelBtn, { borderColor: t.border }]} onPress={() => { NfcManager.cancelTechnologyRequest().catch(()=>{}); setMode('choose'); }}>
              <Text style={{ color: t.textMuted, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── CONFIRM ──────────────────────────────────────────────────────── */}
        {mode === 'confirm' && theirCard && (
          <View style={S.confirmBox}>
            <View style={[S.nfcCircle, { backgroundColor: t.accentDim, borderColor: t.accent }]}>
              <Shield size={42} color={t.accent} />
            </View>
            <Text style={[S.waitTitle, { color: t.text }]}>Contact Found</Text>
            <View style={[S.cardBox, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[S.cardLabel, { color: t.textMuted }]}>USERNAME</Text>
              <Text style={[S.cardValue, { color: t.text }]}>{theirCard.username}</Text>
              <Text style={[S.cardLabel, { color: t.textMuted, marginTop: 10 }]}>USER ID</Text>
              <Text style={[S.cardValue, { color: t.accent, fontSize: 13 }]}>{theirCard.userId}</Text>
              <Text style={[S.cardLabel, { color: t.textMuted, marginTop: 10 }]}>PUBLIC KEY</Text>
              <Text style={[S.cardSub, { color: t.textMuted }]} numberOfLines={2}>
                {theirCard.publicKey.slice(0, 60)}…
              </Text>
            </View>
            <Text style={[S.waitSub, { color: t.textMuted, marginTop: 4 }]}>
              Messages with this contact will be end-to-end encrypted using this key.
            </Text>
            <Pressable style={[S.btn, { backgroundColor: t.accent, marginTop: 12 }]} onPress={() => setShowDuration(true)}>
              <Clock size={20} color={t.bg} />
              <Text style={[S.btnTxt, { color: t.bg }]}>
                {theirProposedDur ? `${theirCard?.username} proposes ${DURATIONS.find(d=>d.key===theirProposedDur)?.label ?? theirProposedDur} — respond` : 'Set Connection Duration'}
              </Text>
            </Pressable>
            <Pressable style={{ marginTop: 10 }} onPress={() => setMode('choose')}>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── DONE ────────────────────────────────────────────────────────── */}
        {mode === 'done' && (
          <View style={S.waitBox}>
            <View style={[S.nfcCircle, { backgroundColor: t.greenDim, borderColor: t.green }]}>
              <Check size={48} color={t.green} />
            </View>
            <Text style={[S.waitTitle, { color: t.text }]}>Contact Added!</Text>
            <Text style={[S.waitSub, { color: t.textMuted }]}>
              {theirCard?.username} is now in your contacts. Your messages will be end-to-end encrypted.
            </Text>
            <Pressable style={[S.btn, { backgroundColor: t.accent, marginTop: 20 }]}
              onPressIn={() => router.replace('/')}>
              <Text style={[S.btnTxt, { color: t.bg }]}>Done</Text>
            </Pressable>
          </View>
        )}

        {/* ── ERROR ───────────────────────────────────────────────────────── */}
        {mode === 'error' && (
          <View style={S.waitBox}>
            <Text style={[S.waitTitle, { color: t.red }]}>Pairing Failed</Text>
            <Text style={[S.waitSub, { color: t.textMuted }]}>{status}</Text>
            <Pressable style={[S.btn, { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, marginTop: 20 }]}
              onPress={() => setMode('choose')}>
              <Text style={[S.btnTxt, { color: t.text }]}>Try Again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Duration modal — shown before finalising add */}
      {showDuration && (
        <View style={[S.durOverlay]}>
          <View style={[S.durSheet, { backgroundColor: t.bg, borderColor: t.border }]}>
            <Text style={[S.durTitle, { color: t.text }]}>Connection Duration</Text>
            <Text style={[S.durSub, { color: t.textMuted }]}>How long should this connection last?</Text>
            {DURATIONS.map(dur => (
              <Pressable
                key={dur.key}
                style={[S.durRow, {
                  backgroundColor: selectedDur === dur.key ? t.accentDim : t.surface,
                  borderColor:     selectedDur === dur.key ? t.accent + '60' : t.border,
                }]}
                onPress={() => setSelectedDur(dur.key)}
              >
                <Clock size={16} color={selectedDur === dur.key ? t.accent : t.textMuted} />
                <Text style={[S.durTxt, { color: selectedDur === dur.key ? t.accent : t.text }]}>{dur.label}</Text>
                {selectedDur === dur.key && <Check size={16} color={t.accent} />}
              </Pressable>
            ))}
            {theirProposedDur && theirProposedDur !== selectedDur && (
              <View style={[S.warnBox, { backgroundColor: t.accentDim, borderColor: t.accent + '40', borderRadius: 12 }]}>
                <Clock size={14} color={t.accent} />
                <Text style={[S.warnText, { color: t.accent }]}>
                  {theirCard?.username} proposed: {DURATIONS.find(d => d.key === theirProposedDur)?.label ?? theirProposedDur}
                </Text>
              </View>
            )}
            {waitingAgree ? (
              <View style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
                <ActivityIndicator color={t.accent} />
                <Text style={{ color: t.textMuted, fontSize: 13 }}>
                  Waiting for {theirCard?.username} to agree…
                </Text>
              </View>
            ) : (
              <Pressable
                style={[S.btn, { backgroundColor: t.accent, marginTop: 8 }]}
                onPress={() => theirProposedDur ? respondToDuration(selectedDur) : proposeDuration()}
              >
                <Check size={18} color={t.bg} />
                <Text style={[S.btnTxt, { color: t.bg }]}>
                  {theirProposedDur
                    ? selectedDur === theirProposedDur ? 'Agree & Add Contact' : 'Propose This Duration'
                    : connected ? 'Propose to ' + (theirCard?.username ?? 'them') : 'Add Contact'}
                </Text>
              </Pressable>
            )}
            <Pressable style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setShowDuration(false)}>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    <BottomBackBar />
    </View>
  );
}

const S = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingVertical:14 },
  title:       { fontSize:17, fontWeight:'600' as const },
  body:        { padding:20, gap:16 },
  sub:         { fontSize:14, lineHeight:22, textAlign:'center' as const },
  warnBox:     { flexDirection:'row', alignItems:'flex-start', gap:10, padding:14, borderRadius:12, borderWidth:1 },
  warnText:    { flex:1, fontSize:12, lineHeight:18 },
  btn:         { borderRadius:16, padding:18, gap:6, alignItems:'center' as const },
  btnTxt:      { fontSize:16, fontWeight:'600' as const },
  btnSub:      { fontSize:12 },
  divRow:      { flexDirection:'row', alignItems:'center', gap:12 },
  divLine:     { flex:1, height:StyleSheet.hairlineWidth },
  divTxt:      { fontSize:11, fontWeight:'600' as const, letterSpacing:1 },
  qrBox:       { flexDirection:'row', gap:12, padding:16, borderRadius:14, borderWidth:1 },
  qrTitle:     { fontSize:14, fontWeight:'600' as const, marginBottom:4 },
  qrSub:       { fontSize:12, lineHeight:18, marginBottom:8 },
  qrLink:      { fontSize:11, fontFamily: Platform.OS === 'ios' ? 'Menlo':'monospace' },
  waitBox:     { alignItems:'center' as const, gap:12, paddingTop:40 },
  nfcCircle:   { width:120, height:120, borderRadius:60, borderWidth:2, alignItems:'center', justifyContent:'center' },
  waitTitle:   { fontSize:20, fontWeight:'600' as const, textAlign:'center' as const },
  waitSub:     { fontSize:14, textAlign:'center' as const, lineHeight:22, maxWidth:280 },
  cancelBtn:   { marginTop:12, paddingHorizontal:24, paddingVertical:10, borderRadius:10, borderWidth:1 },
  confirmBox:  { alignItems:'center' as const, gap:12, paddingTop:20 },
  cardBox:     { width:'100%' as any, borderRadius:14, borderWidth:1, padding:16, gap:4 },
  cardLabel:   { fontSize:10, letterSpacing:1.5, fontWeight:'700' as const },
  cardValue:   { fontSize:17, fontWeight:'600' as const },
  cardSub:     { fontSize:11, lineHeight:16 },
  // Duration modal
  durOverlay:  { position:'absolute' as const, top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' as const },
  durSheet:    { borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, borderWidth:1, gap:12 },
  durTitle:    { fontSize:18, fontWeight:'600' as const },
  durSub:      { fontSize:13 },
  durRow:      { flexDirection:'row' as const, alignItems:'center' as const, gap:12, borderRadius:14, borderWidth:1, padding:14 },
  durTxt:      { flex:1, fontSize:15 },
});
