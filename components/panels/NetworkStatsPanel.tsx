/**
 * presenceOS — Network Stats Panel
 * Slides in from top on swipe-down gesture from home screen.
 * Shows live rx/tx rates and connection count via PresenceDeviceControl.
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, Pressable, Animated, StyleSheet, NativeModules,
} from 'react-native';

const { PresenceDeviceControl } = NativeModules;

interface NetworkStats {
  rx: string;
  tx: string;
  connections: number;
  idle: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  accent: string;
  text: string;
  surface: string;
  border: string;
  muted: string;
}

export default function NetworkStatsPanel({ visible, onClose, accent, text, surface, border, muted }: Props) {
  const slideAnim = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -320,
      useNativeDriver: true,
      tension: 200,
      friction: 20,
    }).start();
  }, [visible]);

  const [stats, setStats] = useState<NetworkStats>({ rx: '0 KB/s', tx: '0 KB/s', connections: 0, idle: true });

  useEffect(() => {
    if (!visible) return;
    const fetchStats = async () => {
      try {
        const s = await PresenceDeviceControl?.getNetworkStats?.();
        if (s) setStats(s);
        else setStats({ rx: '—', tx: '—', connections: 0, idle: true });
      } catch {
        setStats({ rx: '—', tx: '—', connections: 0, idle: true });
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 2000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/* Tap-outside to close */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <Animated.View style={[
        NS.panel,
        { backgroundColor: surface, borderBottomColor: border },
        { transform: [{ translateY: slideAnim }] },
      ]}>
        {/* Header */}
        <View style={NS.header}>
          <Text style={[NS.title, { color: muted }]}>NETWORK ACTIVITY</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[NS.doneBtn, { color: accent }]}>done</Text>
          </Pressable>
        </View>

        {/* RX / TX cards */}
        <View style={NS.statsRow}>
          <View style={[NS.statCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
            <Text style={[NS.statLabel, { color: muted }]}>RECEIVING</Text>
            <Text style={[NS.statValue, { color: text }]}>{stats.rx}</Text>
          </View>
          <View style={[NS.statCard, { backgroundColor: accent + '12', borderColor: accent + '30' }]}>
            <Text style={[NS.statLabel, { color: muted }]}>SENDING</Text>
            <Text style={[NS.statValue, { color: text }]}>{stats.tx}</Text>
          </View>
        </View>

        {/* Status row */}
        <View style={NS.statusRow}>
          <View style={[NS.statusDot, { backgroundColor: stats.idle ? accent + '40' : accent }]} />
          <Text style={[NS.statusText, { color: muted }]}>
            {stats.idle
              ? 'presenceOS is idle — nothing running in background'
              : `${stats.connections} active connection${stats.connections !== 1 ? 's' : ''}`}
          </Text>
        </View>

        <Text style={[NS.note, { color: muted }]}>
          presenceOS only uses network when you are actively using an app
        </Text>
      </Animated.View>
    </>
  );
}

const NS = StyleSheet.create({
  panel: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200,
    borderBottomWidth: 1,
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 12,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  title:    { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2 },
  doneBtn:  { fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, gap: 4 },
  statLabel:{ fontSize: 9, fontWeight: '600' as const, letterSpacing: 1.5 },
  statValue:{ fontSize: 22, fontWeight: '200' as const },
  statusRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusDot:{ width: 6, height: 6, borderRadius: 3 },
  statusText:{ fontSize: 11, flex: 1 },
  note:     { fontSize: 10, opacity: 0.6 },
});
