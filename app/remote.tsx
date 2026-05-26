import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Smartphone, Wifi, Monitor, Link2, AlertTriangle,
} from 'lucide-react-native';

export default function RemoteScreen() {
  const router = useRouter();
  const { activeTheme: t } = useSettings();
  const [deviceIp, setDeviceIp] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = useCallback(() => {
    if (!deviceIp.trim()) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setIsConnected(true);
  }, [deviceIp]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      'Disconnect',
      'End the remote session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => setIsConnected(false),
        },
      ]
    );
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Remote Device</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Monitor size={30} color="#8B5CF6" />
          </View>
          <Text style={[styles.heroTitle, { color: t.text }]}>Remote Android Access</Text>
          <Text style={[styles.heroBody, { color: t.textSecondary }]}>
            Access your other Android device remotely. Perfect for when you still need the old social apps — kept safely isolated from presenceOS.
          </Text>
        </View>

        {isConnected ? (
          <>
            <View style={[styles.connectedCard, { backgroundColor: t.greenDim, borderColor: t.green + '30' }]}>
              <View style={styles.connectedHeader}>
                <View style={[styles.connectedDot, { backgroundColor: t.green }]} />
                <Text style={[styles.connectedText, { color: t.green }]}>Connected</Text>
              </View>
              <View style={styles.connectedDevice}>
                <Smartphone size={20} color={t.textSecondary} />
                <Text style={[styles.connectedIp, { color: t.textSecondary }]}>{deviceIp}</Text>
              </View>
            </View>

            <View style={[styles.remoteView, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.remoteScreen}>
                <Text style={[styles.remoteScreenText, { color: t.textSecondary }]}>Remote Session Active</Text>
                <Text style={[styles.remoteScreenSub, { color: t.textMuted }]}>
                  Your other device is being mirrored here
                </Text>
              </View>
            </View>

            <Pressable style={[styles.disconnectBtn, { backgroundColor: t.redDim, borderColor: t.red + '30' }]} onPress={handleDisconnect}>
              <Text style={[styles.disconnectText, { color: t.red }]}>End Session</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.setupSection}>
              <Text style={[styles.sectionLabel, { color: t.textMuted }]}>CONNECT TO DEVICE</Text>

              <View style={[styles.setupCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: t.accentDim }]}><Text style={[styles.stepNumText, { color: t.accent }]}>1</Text></View>
                  <Text style={[styles.stepText, { color: t.textSecondary }]}>Install presenceOS Remote app on your other device</Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: t.accentDim }]}><Text style={[styles.stepNumText, { color: t.accent }]}>2</Text></View>
                  <Text style={[styles.stepText, { color: t.textSecondary }]}>Ensure both devices are on the same Wi-Fi network</Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: t.accentDim }]}><Text style={[styles.stepNumText, { color: t.accent }]}>3</Text></View>
                  <Text style={[styles.stepText, { color: t.textSecondary }]}>Enter the IP address shown on your other device</Text>
                </View>
              </View>

              <View style={[styles.ipRow, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Wifi size={16} color={t.textMuted} />
                <TextInput
                  style={[styles.ipInput, { color: t.text }]}
                  value={deviceIp}
                  onChangeText={setDeviceIp}
                  placeholder="192.168.1.100"
                  placeholderTextColor={t.textMuted}
                  keyboardType="numeric"
                />
              </View>

              <Pressable
                style={[styles.connectBtn, !deviceIp.trim() && styles.connectBtnDisabled]}
                onPress={handleConnect}
                disabled={!deviceIp.trim()}
              >
                <Link2 size={18} color={t.white} />
                <Text style={[styles.connectBtnText, { color: t.white }]}>Connect</Text>
              </Pressable>
            </View>

            <View style={[styles.warningCard, { backgroundColor: t.accentDim, borderColor: t.accent + '20' }]}>
              <AlertTriangle size={16} color={t.accent} />
              <Text style={[styles.warningText, { color: t.textSecondary }]}>
                Remote access is designed for accessing your existing device when needed. Social media and distracting apps are kept isolated from your presenceOS experience.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 20,
    maxWidth: 300,
  },
  connectedCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  connectedDevice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedIp: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  remoteView: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
  },
  remoteScreen: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  remoteScreenText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  remoteScreenSub: {
    fontSize: 12,
  },
  disconnectBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  disconnectText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  setupSection: {
    gap: 14,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 2,
  },
  setupCard: {
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  ipInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    paddingVertical: 16,
  },
  connectBtnDisabled: {
    opacity: 0.4,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});

