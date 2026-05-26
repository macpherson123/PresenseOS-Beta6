import React, { useMemo, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, PanResponder, Animated,
  Dimensions, Image, StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { MessageCircle, Nfc, ChevronRight, Users } from 'lucide-react-native';
import { useContacts } from '@/contexts/ContactsContext';
import OSStatusBar from '@/components/OSStatusBar';
import * as Haptics from 'expo-haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SW * 0.28;

const DEFAULT_WALLPAPER = require('@/assets/images/wallpaper-default.png');

function fmtRelTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'now';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function InlineMessagesPanel({
  t,
  onSwipeBack,
  onSwipeUp,
  wallpaperUri,
}: {
  t: any;
  onSwipeBack?: () => void;
  onSwipeUp?: () => void;
  wallpaperUri?: string | null;
}) {
  const router = useRouter();
  const { conversations } = useContacts();
  const translateX = useRef(new Animated.Value(0)).current;

  const wallpaperSource = wallpaperUri ? { uri: wallpaperUri } : DEFAULT_WALLPAPER;

  const sorted = useMemo(() =>
    [...conversations]
      .filter(c => c.isActive)
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()),
    [conversations]
  );

  const swipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gs) => {
      if (onSwipeUp && gs.dy < -100 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.8 && gs.vy < -0.9) {
        return true;
      }
      return false;
    },
    onMoveShouldSetPanResponder: (_, gs) => {
      if (gs.dx < -8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5) return true;
      if (onSwipeUp && gs.dy < -60 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5) return true;
      return false;
    },
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gs) => {
      if (gs.dx < 0) translateX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
      if (onSwipeUp && gs.dy < -80 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5) {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 300, friction: 26 }).start();
        onSwipeUp();
        return;
      }
      if (gs.dx < -SWIPE_THRESHOLD || gs.vx < -0.6) {
        Animated.timing(translateX, { toValue: -SW, duration: 180, useNativeDriver: true }).start(() => {
          translateX.setValue(0);
          onSwipeBack?.();
        });
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 300, friction: 26 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 300, friction: 26 }).start();
    },
  }), [translateX, onSwipeBack, onSwipeUp]);

  return (
    <View style={{ width: SW, height: SH }} collapsable={false}>
      <Animated.View
        style={{ width: SW, height: SH, transform: [{ translateX }] }}
        {...swipePan.panHandlers}
      >
        {/* ── Blurred wallpaper background ── */}
        <Image source={wallpaperSource} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />

        <OSStatusBar />

        {/* Header */}
        <View style={{
          paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)',
        }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300', letterSpacing: 0.3 }}>
            PresenceChat
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPressIn={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/nfc-pair' as never);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                borderWidth: 1, borderColor: t.accent + '60',
                backgroundColor: 'rgba(255,255,255,0.10)',
              }}
            >
              <Nfc size={13} color={t.accent} />
              <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>Pair</Text>
            </Pressable>
            <Pressable
              onPressIn={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/contacts' as never);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Users size={13} color="rgba(255,255,255,0.55)" />
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500' }}>Contacts</Text>
            </Pressable>
          </View>
        </View>

        {/* Swipe hint */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 4, paddingVertical: 6,
        }}>
          <ChevronRight size={12} color="rgba(255,255,255,0.35)" style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 }}>
            swipe left to go home
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          scrollEventThrottle={16}
        >
          {sorted.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: 'rgba(255,255,255,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageCircle size={36} color="rgba(255,255,255,0.35)" />
              </View>
              <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>No messages yet</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 260 }}>
                Tap "Pair" to connect with someone via NFC, or open Contacts to see who you've already added.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <Pressable
                  onPressIn={() => router.push('/nfc-pair' as never)}
                  style={{
                    paddingHorizontal: 22, paddingVertical: 11,
                    borderRadius: 20, backgroundColor: t.accentDim,
                    borderWidth: 1, borderColor: t.accent + '50',
                  }}
                >
                  <Text style={{ color: t.accent, fontSize: 14, fontWeight: '600' }}>Pair a Contact</Text>
                </Pressable>
                <Pressable
                  onPressIn={() => router.push('/contacts' as never)}
                  style={{
                    paddingHorizontal: 22, paddingVertical: 11,
                    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>Contacts</Text>
                </Pressable>
              </View>
            </View>
          )}

          {sorted.map(conv => (
            <Pressable
              key={conv.id}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 13, gap: 13,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: 'rgba(255,255,255,0.10)',
                opacity: pressed ? 0.72 : 1,
              })}
              onPressIn={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/chat/${conv.id}` as never);
              }}
            >
              {/* Avatar */}
              <View style={{
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: t.accentDim + 'CC',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: t.accent + '40',
              }}>
                <Text style={{ fontSize: 18, fontWeight: '500', color: t.accent }}>
                  {(conv.contactName?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>

              {/* Content */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{conv.contactName}</Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtRelTime(conv.lastMessageTime)}</Text>
                </View>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                  {conv.lastMessage}
                </Text>
              </View>

              {/* Unread badge */}
              {conv.unreadCount > 0 && (
                <View style={{
                  minWidth: 22, height: 22, borderRadius: 11,
                  backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 5,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Swipe-up hint */}
        <View style={{
          alignItems: 'center', paddingTop: 10, paddingBottom: 16, gap: 4,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)',
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
          <Text style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.30)', fontWeight: '600' }}>SWIPE UP</Text>
        </View>
      </Animated.View>
    </View>
  );
}
