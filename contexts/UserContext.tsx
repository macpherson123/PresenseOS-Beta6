/**
 * UserContext — device identity + E2E keypair management
 *
 * On first launch generates an ECDH P-256 keypair:
 *   - Private key: SecureStore (hardware-backed on Android, never leaves device)
 *   - Public key:  AsyncStorage + registered on signal server
 *
 * Encryption model:
 *   Send:    ECDH(myPriv, theirPub) → AES-GCM shared key → encrypt message
 *   Receive: ECDH(myPriv, senderPub) → same key → decrypt
 *   Server sees: only ciphertext + iv. Never the shared key or plaintext.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useQuery, useMutation } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';

export interface UserProfile {
  userId:                  string;
  username:                string;
  profilePicture?:         string;
  companionId?:            string;
  hasCompletedOnboarding:  boolean;
  musicService:            'local' | 'spotify' | 'deezer';
  screenPin?:              string;
  publicKey?:              string; // JWK JSON — shared with contacts
}

const STORAGE_KEY = 'presence_user';
const PRIVKEY_KEY = 'presence_privkey'; // SecureStore — hardware-backed
const PUBKEY_KEY  = 'presence_pubkey';  // AsyncStorage — public, shareable

const generateUserId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = 'POS-';
  for (let i = 0; i < 8; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
};

// ── Web Crypto helpers ────────────────────────────────────────────────────────
const getSubtle = (): SubtleCrypto | null => {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto.subtle;
  const g = global as any;
  return g.crypto?.subtle ?? null;
};

const toB64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromB64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function generateKeypair() {
  const s = getSubtle();
  if (!s) return null;
  const kp = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey','deriveBits']);
  const pub  = await s.exportKey('jwk', kp.publicKey);
  const priv = await s.exportKey('jwk', kp.privateKey);
  return { pub: JSON.stringify(pub), priv: JSON.stringify(priv) };
}

/** Derive shared AES-GCM key — called per conversation */
export async function deriveSharedKey(myPrivJwk: string, theirPubJwk: string): Promise<CryptoKey | null> {
  const s = getSubtle(); if (!s) return null;
  try {
    const [myPriv, theirPub] = await Promise.all([
      s.importKey('jwk', JSON.parse(myPrivJwk), { name:'ECDH', namedCurve:'P-256' }, false, ['deriveKey','deriveBits']),
      s.importKey('jwk', JSON.parse(theirPubJwk), { name:'ECDH', namedCurve:'P-256' }, false, []),
    ]);
    return s.deriveKey({ name:'ECDH', public: theirPub }, myPriv, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  } catch (e) { console.error('[Crypto] deriveSharedKey', e); return null; }
}

export async function encryptMessage(key: CryptoKey, plaintext: string) {
  const s = getSubtle(); if (!s) return null;
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = await s.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: toB64(buf), iv: toB64(iv.buffer) };
}

export async function decryptMessage(key: CryptoKey, ciphertext: string, iv: string): Promise<string | null> {
  const s = getSubtle(); if (!s) return null;
  try {
    const buf = await s.decrypt({ name:'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
    return new TextDecoder().decode(buf);
  } catch (e) { console.error('[Crypto] decrypt', e); return null; }
}

// ── Context ───────────────────────────────────────────────────────────────────
export const [UserProvider, useUser] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile>({
    userId: generateUserId(), username: '', hasCompletedOnboarding: false, musicService: 'local',
  });
  const [privateKey, setPrivateKey] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const s = await AsyncStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) as UserProfile : null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (p: UserProfile) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      return p;
    },
  });

  // Initialise keypair on first boot
  useEffect(() => {
    const init = async () => {
      const profile = userQuery.data;
      if (profile) setUser(profile);

      let priv = await SecureStore.getItemAsync(PRIVKEY_KEY).catch(() => null);
      let pub  = await AsyncStorage.getItem(PUBKEY_KEY).catch(() => null);

      if (!priv || !pub) {
        const kp = await generateKeypair();
        if (kp) {
          priv = kp.priv; pub = kp.pub;
          await SecureStore.setItemAsync(PRIVKEY_KEY, priv);
          await AsyncStorage.setItem(PUBKEY_KEY, pub);
        }
      }

      if (priv) setPrivateKey(priv);

      // Ensure publicKey is embedded in profile for NFC sharing
      // Works whether profile exists or not — always embed publicKey
      if (pub) {
        const current = profile ?? { userId: generateUserId(), username: '', hasCompletedOnboarding: false, musicService: 'local' as const };
        if (!current.publicKey) {
          const updated = { ...current, publicKey: pub };
          setUser(updated);
          saveMutation.mutate(updated);
        } else {
          // publicKey already in profile — just make sure state has it
          if (!user.publicKey) setUser(prev => ({ ...prev, publicKey: pub! }));
        }
      }
    };
    init();
  }, [userQuery.data]); // eslint-disable-line

  const updateUser = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => {
      const next = { ...prev, ...updates };
      saveMutation.mutate(next);
      return next;
    });
  }, [saveMutation]);

  const completeOnboarding = useCallback((username: string, pic?: string, pin?: string) => {
    updateUser({ username, profilePicture: pic, hasCompletedOnboarding: true, screenPin: pin });
  }, [updateUser]);

  const [isAppLocked, setIsAppLocked] = useState(false);

  return {
    user,
    updateUser,
    completeOnboarding,
    setPin:        (pin: string) => updateUser({ screenPin: pin }),
    clearPin:      () => updateUser({ screenPin: undefined }),
    verifyPin:     (pin: string) => !user.screenPin || user.screenPin === pin,
    isAppLocked,
    lockApp:       () => setIsAppLocked(true),
    unlockApp:     () => setIsAppLocked(false),
    isLoading:     userQuery.isLoading,
    getPrivateKey: () => privateKey,
  };
});
