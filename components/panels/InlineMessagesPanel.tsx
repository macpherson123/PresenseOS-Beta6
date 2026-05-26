import React, { useMemo, useRef, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, PanResponder, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, Nfc, ChevronRight, Edit3 } from 'lucide-react-native';
import { useContacts } from '@/contexts/ContactsContext';
import OSStatusBar from '@/components/OSStatusBar';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');
const SWIPE_THRESHOLD = SW * 0.28;

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
  onOpenRotary,
}: {
  t: any;
  onSwipeBack?: () => void;
  onOpenRotary?: () => void;
}) {
  const router = useRouter();
  const { conversations } = useContacts();
  const translateX = useRef(new Animated.Value(0)).current;

  const sorted = useMemo(() =>
    [...conversations]
      .filter(c => c.isActive)
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()),
    [conversations]
  );

  // Swipe right → collapse back to home
  const swipePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Detect LEFT swipe (dx < 0) to dismiss back to home
    onMoveShouldSetPanResponder: (_, gs) => {
      return gs.dx < -8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
    },
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gs) => {
      // Follow finger leftward only
      if (gs.dx < 0) translateX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
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
  }), [translateX, onSwipeBack]);

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: t.bg, transform: [{ translateX }] }}
      {...swipePan.panHandlers}
    >
      <OSStatusBar />

      {/* Header */}
      <View style={{
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: t.border + '60',
      }}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '300', letterSpacing: 0.3 }}>
          PresenceChat
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/nfc-pair' as never);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
              borderWidth: 1, borderColor: t.accent + '50', backgroundColor: t.accentDim,
            }}
          >
            <Nfc size={13} color={t.accent} />
            <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>Pair</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/messages' as never);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
              backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
            }}
          >
            <Edit3 size={13} color={t.textMuted} />
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '500' }}>All</Text>
          </Pressable>
        </View>
      </View>

      {/* Swipe hint */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 4, paddingVertical: 6,
      }}>
        <ChevronRight size={12} color={t.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
        <Text style={{ fontSize: 10, color: t.textMuted, letterSpacing: 0.5 }}>
          swipe left to go home
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        scrollEventThrottle={16}
      >
        {sorted.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            <MessageCircle size={40} color={t.textMuted} />
            <Text style={{ fontSize: 15, color: t.textSecondary, marginTop: 8 }}>No messages yet</Text>
            <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', maxWidth: 260 }}>
              Tap "Pair" to connect with someone via NFC
            </Text>
            <Pressable
              onPressIn={() => router.push('/nfc-pair' as never)}
              style={{
                marginTop: 16, paddingHorizontal: 24, paddingVertical: 11,
                borderRadius: 20, backgroundColor: t.accentDim,
                borderWidth: 1, borderColor: t.accent + '50',
              }}
            >
              <Text style={{ color: t.accent, fontSize: 14, fontWeight: '600' }}>Pair a Contact</Text>
            </Pressable>
          </View>
        )}

        {sorted.map(conv => (
          <Pressable
            key={conv.id}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 13, gap: 13,
              borderBottomWidth: 1, borderBottomColor: t.borderLight,
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/chat/${conv.id}` as never);
            }}
          >
            {/* Avatar */}
            <View style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: t.card, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: t.border + '40',
            }}>
              <Text style={{ fontSize: 18, fontWeight: '500', color: t.text }}>
                {(conv.contactName?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>

            {/* Content */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{conv.contactName}</Text>
                <Text style={{ fontSize: 11, color: t.textMuted }}>{fmtRelTime(conv.lastMessageTime)}</Text>
              </View>
              <Text style={{ fontSize: 13, color: t.textSecondary }} numberOfLines={1}>
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
                <Text style={{ fontSize: 11, fontWeight: '700', color: t.bg }}>
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* APPS handle — opens rotary from messages panel */}
      {onOpenRotary && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onOpenRotary(); }}
          style={{
            alignItems: 'center', paddingTop: 10, paddingBottom: 16, gap: 4,
            borderTopWidth: 1, borderTopColor: t.border + '60',
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          <Text style={{ fontSize: 9, letterSpacing: 2, color: t.textMuted, fontWeight: '600' }}>APPS</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
