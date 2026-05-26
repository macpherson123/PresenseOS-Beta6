/**
 * PresenceNetContext
 *
 * Single source of truth for the device's relay connection and realtime features:
 *   - Socket.IO connection to the user-configured relay URL
 *   - Pair request / response exchange (NFC + duration negotiation)
 *   - E2E text messaging via the relay (TODO: enable AES-GCM once key exchange is wired)
 *   - WebRTC call state + signaling
 *
 * Server event protocol (PresenceBackend/server.js):
 *   register        → registered
 *   message         → message (relay) | message:delivered | message:pending
 *   call:offer      → call:incoming
 *   call:answer     → call:answered
 *   call:ice        ↔ call:ice
 *   call:reject     → call:rejected
 *   call:end        → call:ended
 *   pair:request    ↔ pair:request
 *   pair:response   ↔ pair:response
 */

import React, {
  createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode,
} from 'react';
import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
const { PresenceDeviceControl } = NativeModules;
import { io, Socket } from 'socket.io-client';
import {
  mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';
import { useUser } from '@/contexts/UserContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useContacts } from '@/contexts/ContactsContext';

async function requestMediaPermissions(video: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const results = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  } catch { return false; }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PairRequest {
  requestId:  string;
  from:       string;
  fromName:   string;
  publicKey?: string;
  duration:   string;
}

interface CallState {
  status:    'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'failed';
  peerId:    string | null;
  peerName:  string | null;
  startedAt: number | null;
  type:      'audio' | 'video';
}

interface PresenceNetContextValue {
  connected:               boolean;
  relayUrl:                string | null;
  pendingPairRequest:      PairRequest | null;
  pairWaiting:             boolean;
  sendPairRequest:         (toUserId: string, duration: string) => void;
  respondToPairRequest:    (requestId: string, agreed: boolean, duration: string, toUserId?: string) => void;
  clearPendingPairRequest: () => void;
  sendNetMessage:          (toUserId: string, body: string, conversationId?: string) => Promise<boolean>;
  callState:               CallState;
  localStream:             MediaStream | null;
  remoteStream:            MediaStream | null;
  callContact:             (peerId: string, peerName: string, video: boolean) => Promise<void>;
  answerCall:              () => Promise<void>;
  rejectCall:              () => void;
  hangUp:                  () => void;
  toggleMute:              () => void;
  toggleCamera:            () => void;
  isMuted:                 boolean;
  isCameraOff:             boolean;
}

const defaultValue: PresenceNetContextValue = {
  connected:               false,
  relayUrl:                null,
  pendingPairRequest:      null,
  pairWaiting:             false,
  sendPairRequest:         () => {},
  respondToPairRequest:    () => {},
  clearPendingPairRequest: () => {},
  sendNetMessage:          async () => false,
  callState:               { status: 'idle', peerId: null, peerName: null, startedAt: null, type: 'audio' },
  localStream:             null,
  remoteStream:            null,
  callContact:             async () => {},
  answerCall:              async () => {},
  rejectCall:              () => {},
  hangUp:                  () => {},
  toggleMute:              () => {},
  toggleCamera:            () => {},
  isMuted:                 false,
  isCameraOff:             false,
};

const PresenceNetContext = createContext<PresenceNetContextValue>(defaultValue);

// STUN + TURN — TURN is required for cellular-to-cellular (symmetric NAT).
// Without TURN, iceConnectionState stays 'checking' forever on CGNAT (4G/5G).
// openrelay.metered.ca changed their credentials policy — do not use it.
// Strategy: user's self-hosted TURN first, then reliable public fallbacks.
// iceTransportPolicy: 'relay' is set when no STUN-friendly network is detected.
function buildRtcConfig(settings: any): any {
  const iceServers: any[] = [
    // STUN — only useful on non-CGNAT networks (WiFi with UPnP, etc.)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
  ];

  // User-supplied TURN (self-hosted coturn on the relay server — best option)
  const turnUrl = settings?.turnUrl?.trim();
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username:   settings.turnUsername ?? '',
      credential: settings.turnPassword ?? '',
    });
  }

  // freestun.net — free TURN server, more reliable than openrelay
  iceServers.push({
    urls: [
      'turn:freestun.net:3479',
      'turns:freestun.net:5350',
    ],
    username:   'free',
    credential: 'free',
  });

  // metered.ca free tier (requires API key — use demo key)
  iceServers.push({
    urls: [
      'turn:a.relay.metered.ca:80',
      'turn:a.relay.metered.ca:443',
      'turns:a.relay.metered.ca:443?transport=tcp',
    ],
    username:   'e8dd65b6f0fd5b83d9e1f0c9',
    credential: 'uMGYbxRd/3AEIpBs',
  });

  // Force TURN (relay) if user is on cellular / CGNAT — STUN will never work
  // We detect this by checking if a user TURN server is configured (they've
  // set it up because STUN failed). If no user TURN, we still try 'all' but
  // the public TURN servers above handle the CGNAT case.
  const iceTransportPolicy = 'all'; // 'relay' forces TURN-only — use for coturn debugging

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy:         'max-bundle',
    rtcpMuxPolicy:        'require',
    iceTransportPolicy,
  };
}

// ── Provider ────────────────────────────────────────────────────────────────

export function PresenceNetProvider({ children }: { children: ReactNode }) {
  const { user }              = useUser();
  const { settings }          = useSettings();
  const { receiveMessage }    = useContacts();

  const [connected,  setConnected]  = useState(false);
  const [relayUrl,   setRelayUrl]   = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [pendingPairRequest, setPendingPairRequest] = useState<PairRequest | null>(null);
  const [pairWaiting,        setPairWaiting]        = useState(false);

  const [callState,    setCallState]    = useState<CallState>(defaultValue.callState);
  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isCameraOff,  setIsCameraOff]  = useState(false);

  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef     = useRef<RTCIceCandidate[]>([]);
  const callPeerIdRef     = useRef<string | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const pendingAcks       = useRef<Map<string, (ok: boolean) => void>>(new Map());
  const iceRestartTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep receiveMessage fresh inside the socket event closure
  const receiveMessageRef = useRef(receiveMessage);
  useEffect(() => { receiveMessageRef.current = receiveMessage; }, [receiveMessage]);

  // ── Socket lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    const url = settings?.serverUrl?.trim();
    if (!url || !user?.userId) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      setConnected(false);
      setRelayUrl(null);
      return;
    }

    setRelayUrl(url);
    const socket = io(url, {
      transports: ['websocket'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      auth: { userId: user.userId, username: user.username ?? '' },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('register', {
        userId:    user.userId,
        username:  user.username ?? '',
        publicKey: user.publicKey ?? '',
      });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    // ── Pair negotiation ──
    socket.on('pair:request', (req: PairRequest) => {
      setPendingPairRequest(req);
    });

    socket.on('pair:response', (resp: { requestId: string; accepted?: boolean; agreed?: boolean; duration: string }) => {
      setPairWaiting(false);
      const handler = (globalThis as any).__presencePairResponseHandler;
      if (typeof handler === 'function') {
        handler({ ...resp, agreed: resp.accepted ?? resp.agreed });
      }
    });

    // ── Messaging ──
    socket.on('message', (msg: { from: string; ciphertext: string; iv?: string; conversationId?: string; messageId?: string }) => {
      // TODO: decrypt ciphertext with ECDH shared key when E2E is wired
      receiveMessageRef.current(msg.from, msg.ciphertext);
    });

    socket.on('message:delivered', ({ messageId }: { messageId: string }) => {
      const resolve = pendingAcks.current.get(messageId);
      if (resolve) { resolve(true); pendingAcks.current.delete(messageId); }
    });

    socket.on('message:pending', ({ messageId }: { messageId: string }) => {
      const resolve = pendingAcks.current.get(messageId);
      if (resolve) { resolve(false); pendingAcks.current.delete(messageId); }
    });

    // ── Call signaling ──
    socket.on('call:incoming', async (msg: { from: string; fromName: string; sdp: any; callType: string }) => {
      callPeerIdRef.current = msg.from;
      const isVideo = msg.callType === 'video';
      // Wake the device + show over lockscreen *before* updating React state
      // so the screen is already powering on by the time the overlay renders.
      // Native side is a no-op if the activity isn't alive.
      try { PresenceDeviceControl?.wakeForIncomingCall?.(); } catch {}
      setCallState({ status: 'incoming', peerId: msg.from, peerName: msg.fromName, startedAt: null, type: isVideo ? 'video' : 'audio' });
      await prepareIncomingPc(msg.sdp, isVideo);
    });

    socket.on('call:answered', async (msg: { from: string; sdp: any }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        for (const c of pendingIceRef.current) await pcRef.current.addIceCandidate(c).catch(() => {});
        pendingIceRef.current = [];
        // Move to 'connecting' — let iceconnectionstatechange fire 'connected' when media is actually flowing
        setCallState(s => ({ ...s, status: 'connecting' }));
      } catch {}
    });

    socket.on('call:ice', async (msg: { from: string; candidate: any }) => {
      const candidate = new RTCIceCandidate(msg.candidate);
      if (pcRef.current?.remoteDescription) {
        pcRef.current.addIceCandidate(candidate).catch(() => {});
      } else {
        pendingIceRef.current.push(candidate);
      }
    });

    socket.on('call:ended',   () => tearDownCall());
    socket.on('call:rejected', () => tearDownCall());

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      pendingAcks.current.clear();
    };
  }, [settings?.serverUrl, user?.userId, user?.username]); // eslint-disable-line

  // ── Pair API ──────────────────────────────────────────────────────────────

  const sendPairRequest = useCallback((toUserId: string, duration: string) => {
    if (!socketRef.current?.connected) return;
    const requestId = `${user?.userId ?? 'me'}-${Date.now()}`;
    setPairWaiting(true);
    socketRef.current.emit('pair:request', {
      requestId, to: toUserId,
      from: user?.userId ?? '', fromName: user?.username ?? '',
      publicKey: user?.publicKey ?? '', duration,
    });
  }, [user]);

  const respondToPairRequest = useCallback((requestId: string, agreed: boolean, duration: string, toUserId?: string) => {
    if (!socketRef.current?.connected) return;
    // Always prefer explicit toUserId — the requestId split trick fails with UUID userIds
    const to = toUserId ?? requestId.split('-')[0];
    socketRef.current.emit('pair:response', {
      requestId, accepted: agreed,
      from: user?.userId ?? '', to, duration,
    });
  }, [user]);

  const clearPendingPairRequest = useCallback(() => setPendingPairRequest(null), []);

  // ── Messaging ─────────────────────────────────────────────────────────────

  const sendNetMessage = useCallback(
    async (toUserId: string, body: string, conversationId?: string): Promise<boolean> => {
      if (!socketRef.current?.connected) return false;
      const messageId = `${user?.userId ?? 'u'}_${Date.now()}`;
      return new Promise(resolve => {
        const timeout = setTimeout(() => {
          pendingAcks.current.delete(messageId);
          resolve(false);
        }, 8000);
        pendingAcks.current.set(messageId, (ok) => {
          clearTimeout(timeout);
          resolve(ok);
        });
        // TODO: encrypt body → ciphertext with ECDH AES-GCM before emit
        socketRef.current!.emit('message', {
          to: toUserId,
          ciphertext: body,
          iv: '',
          conversationId: conversationId ?? '',
          messageId,
          timestamp: Date.now(),
        });
      });
    },
    [user]
  );

  // ── WebRTC helpers ────────────────────────────────────────────────────────

  // Arms a 30s safety net — if the call doesn't reach 'connected' within that
  // window, we tear it down with a 'failed' state so the UI can show "Call failed"
  // instead of spinning forever. Cleared when connectionState reaches 'connected'.
  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const armCallTimeout = useCallback(() => {
    clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      callTimeoutRef.current = null;
      // Snapshot status — bail if call already progressed/ended
      let shouldFail = false;
      setCallState(s => {
        if (s.status === 'connecting' || s.status === 'outgoing') {
          shouldFail = true;
          return { ...s, status: 'failed' };
        }
        return s;
      });
      if (!shouldFail) return;
      console.warn('[WebRTC] Call connect timeout (30s) — failing call');
      // Synchronous cleanup so a follow-up call can't be clobbered by us later
      if (socketRef.current?.connected && callPeerIdRef.current) {
        socketRef.current.emit('call:end', { to: callPeerIdRef.current });
      }
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} });
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      callPeerIdRef.current = null;
      pendingIceRef.current = [];
      // Auto-dismiss 'failed' UI after 1.8s — but only if the user hasn't already
      // triggered a new call in the meantime (we check status hasn't moved)
      setTimeout(() => {
        setCallState(s => s.status === 'failed' ? defaultValue.callState : s);
      }, 1800);
    }, 30000);
  }, [clearCallTimeout]);

  const tearDownCall = useCallback(() => {
    if (iceRestartTimer.current) { clearTimeout(iceRestartTimer.current); iceRestartTimer.current = null; }
    clearCallTimeout();
    try { pcRef.current?.close(); } catch {}
    pcRef.current        = null;
    pendingIceRef.current = [];
    callPeerIdRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch {} });
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallState({ status: 'idle', peerId: null, peerName: null, startedAt: null, type: 'audio' });
    // Drop the show-over-lockscreen / keep-screen-on window flags so the
    // home screen stops bypassing the lock once the call is over.
    try { PresenceDeviceControl?.clearIncomingCallWake?.(); } catch {}
  }, [clearCallTimeout]);

  const createPc = useCallback(() => {
    const pc = new RTCPeerConnection(buildRtcConfig(settings));

    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate && socketRef.current?.connected && callPeerIdRef.current) {
        socketRef.current.emit('call:ice', {
          to: callPeerIdRef.current,
          candidate: event.candidate,
        });
      }
    });

    pc.addEventListener('track', (event: any) => {
      const stream = event.streams?.[0];
      if (stream) {
        setRemoteStream(stream);
        // Only promote to 'connected' after the call has been answered (status='connecting').
        // During 'incoming', setRemoteDescription fires ontrack too — ignore it there.
        setCallState(s => {
          if (s.status === 'connecting' || s.status === 'outgoing') {
            if (iceRestartTimer.current) { clearTimeout(iceRestartTimer.current); iceRestartTimer.current = null; }
            clearCallTimeout();
            return { ...s, status: 'connected', startedAt: s.startedAt ?? Date.now() };
          }
          return s;
        });
      }
    });

    // Primary connection state — fires when DTLS + ICE both succeed → media flows
    pc.addEventListener('connectionstatechange', () => {
      const state = (pc as any).connectionState as string;
      console.log('[WebRTC] connectionState:', state);
      if (state === 'connected') {
        if (iceRestartTimer.current) { clearTimeout(iceRestartTimer.current); iceRestartTimer.current = null; }
        clearCallTimeout();
        setCallState(s => s.status !== 'connected' ? { ...s, status: 'connected', startedAt: Date.now() } : s);
      } else if (state === 'failed') {
        // Attempt ICE restart — create a new offer with iceRestart: true
        console.log('[WebRTC] Connection failed — attempting ICE restart');
        pc.restartIce?.();
      } else if (state === 'disconnected') {
        // Give it 8 seconds to self-recover before restarting
        iceRestartTimer.current = setTimeout(() => {
          if ((pc as any).connectionState === 'disconnected') {
            console.log('[WebRTC] Still disconnected after 8s — restarting ICE');
            pc.restartIce?.();
          }
        }, 8000);
      }
    });

    // Fallback via ICE connection state (older WebRTC versions)
    pc.addEventListener('iceconnectionstatechange', () => {
      const state = (pc as any).iceConnectionState as string;
      console.log('[WebRTC] iceConnectionState:', state);
      if (state === 'connected' || state === 'completed') {
        clearCallTimeout();
        setCallState(s => s.status !== 'connected' ? { ...s, status: 'connected', startedAt: Date.now() } : s);
      } else if (state === 'failed') {
        console.log('[WebRTC] ICE failed — restarting');
        pc.restartIce?.();
      } else if (state === 'checking') {
        // On 4G/CGNAT, ICE checking can hang indefinitely without TURN.
        // Give 30 seconds then surface a useful error instead of spinning forever.
        setTimeout(() => {
          const cur = (pc as any).iceConnectionState as string;
          if (cur === 'checking') {
            console.log('[WebRTC] ICE still checking after 30s — likely CGNAT/no TURN');
            setCallState(s => {
              if (s.status === 'connecting' || s.status === 'outgoing') {
                return { ...s, status: 'failed' as any };
              }
              return s;
            });
          }
        }, 30000);
      }
    });

    return pc;
  }, [settings, clearCallTimeout]);

  const getLocalStream = useCallback(async (video: boolean): Promise<MediaStream> => {
    const granted = await requestMediaPermissions(video);
    if (!granted) throw new Error('Media permissions denied');
    return await mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 } as any,
      video: video ? { facingMode: 'user', width: 640, height: 480 } as any : false,
    }) as MediaStream;
  }, []);

  const prepareIncomingPc = useCallback(async (sdp: any, video: boolean) => {
    try {
      const stream = await getLocalStream(video);
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = createPc();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Apply any ICE candidates that arrived before we set the remote description
      for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {});
      pendingIceRef.current = [];
      pcRef.current = pc;
    } catch (e) {
      console.warn('[WebRTC] prepareIncomingPc failed:', e);
      tearDownCall();
    }
  }, [createPc, getLocalStream, tearDownCall]);

  // ── Call API ──────────────────────────────────────────────────────────────

  const callContact = useCallback(async (peerId: string, peerName: string, video: boolean) => {
    if (!socketRef.current?.connected) return;
    try {
      const stream = await getLocalStream(video);
      localStreamRef.current = stream;
      setLocalStream(stream);
      callPeerIdRef.current = peerId;
      const pc = createPc();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pcRef.current = pc;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      socketRef.current.emit('call:offer', {
        to: peerId,
        sdp: offer,
        callType: video ? 'video' : 'audio',
      });
      setCallState({ status: 'outgoing', peerId, peerName, startedAt: null, type: video ? 'video' : 'audio' });
      armCallTimeout();
    } catch (e) {
      console.warn('[WebRTC] callContact failed:', e);
      tearDownCall();
    }
  }, [createPc, getLocalStream, tearDownCall, armCallTimeout]);

  const answerCall = useCallback(async () => {
    if (!pcRef.current || !socketRef.current?.connected) return;
    try {
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socketRef.current.emit('call:answer', {
        to: callPeerIdRef.current,
        sdp: answer,
      });
      // Apply any remaining pending candidates (buffered before local desc was set)
      for (const c of pendingIceRef.current) await pcRef.current.addIceCandidate(c).catch(() => {});
      pendingIceRef.current = [];
      // Move to 'connecting' — connectionstatechange / iceconnectionstatechange
      // will transition to 'connected' once media is actually flowing
      setCallState(s => ({ ...s, status: 'connecting' }));
      armCallTimeout();
    } catch { tearDownCall(); }
  }, [tearDownCall, armCallTimeout]);

  const rejectCall = useCallback(() => {
    if (socketRef.current?.connected && callPeerIdRef.current) {
      socketRef.current.emit('call:reject', { to: callPeerIdRef.current });
    }
    tearDownCall();
  }, [tearDownCall]);

  const hangUp = useCallback(() => {
    if (socketRef.current?.connected && callPeerIdRef.current) {
      socketRef.current.emit('call:end', { to: callPeerIdRef.current });
    }
    tearDownCall();
  }, [tearDownCall]);

  const toggleMute = useCallback(() => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) { audio.enabled = !audio.enabled; setIsMuted(!audio.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) { video.enabled = !video.enabled; setIsCameraOff(!video.enabled); }
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────

  const value: PresenceNetContextValue = {
    connected, relayUrl,
    pendingPairRequest, pairWaiting,
    sendPairRequest, respondToPairRequest, clearPendingPairRequest,
    sendNetMessage,
    callState, localStream, remoteStream,
    callContact, answerCall, rejectCall, hangUp,
    toggleMute, toggleCamera, isMuted, isCameraOff,
  };

  return (
    <PresenceNetContext.Provider value={value}>
      {children}
    </PresenceNetContext.Provider>
  );
}

export function usePresenceNet(): PresenceNetContextValue {
  return useContext(PresenceNetContext);
}
