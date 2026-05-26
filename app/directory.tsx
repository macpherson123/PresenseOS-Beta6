import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Platform, Linking, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Search, ShieldCheck, Phone, MapPin, Clock,
  Building2, Heart, Siren, Landmark, School, Zap, Briefcase,
  BadgeCheck, Shield, Train,
} from 'lucide-react-native';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Emergency: Siren,
  Healthcare: Heart,
  Government: Landmark,
  Banking: Building2,
  Education: School,
  Utilities: Zap,
  Insurance: Shield,
  Transport: Train,
  Other: Building2,
};

const CATEGORY_COLORS: Record<string, string> = {
  Emergency: '#E85454',
  Healthcare: '#F472B6',
  Government: '#E8A838',
  Banking: '#3ABFAD',
  Education: '#8B5CF6',
  Utilities: '#F97316',
  Insurance: '#38BDF8',
  Transport: '#4ADE80',
};

export default function DirectoryScreen() {
  const router = useRouter();
  const { activeTheme: t } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory>('All');

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const verifiedBusinesses = useMemo(() => {
    return mockBusinesses.filter((b) => b.verified);
  }, []);

  const filteredBusinesses = useMemo(() => {
    let list = verifiedBusinesses;
    if (selectedCategory !== 'All') {
      list = list.filter((b) => b.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.phone.includes(q)
      );
    }
    return list;
  }, [verifiedBusinesses, selectedCategory, searchQuery]);

  const handleCall = useCallback((name: string, phone: string) => {
    haptic();
    const cleaned = phone.replace(/\s/g, '');
    const telUrl = `tel:${cleaned}`;

    Alert.alert(
      `Call ${name}`,
      `Dial ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: async () => {
            console.log('[Directory] Calling:', phone);
            try {
              if (Platform.OS === 'web') {
                window.open(telUrl, '_self');
                return;
              }
              const supported = await Linking.canOpenURL(telUrl);
              if (supported) {
                await Linking.openURL(telUrl);
              } else {
                Alert.alert('Cannot Place Call', 'Telephony is not available on this device.');
              }
            } catch (error) {
              console.log('[Directory] Call error:', error);
              Alert.alert('Call Error', 'Something went wrong while trying to place the call.');
            }
          },
        },
      ]
    );
  }, [haptic]);

  const getCategoryColor = useCallback((cat: string): string => {
    return CATEGORY_COLORS[cat] || '#6B7280';
  }, []);

  const renderBusiness = useCallback(({ item: biz }: { item: Business }) => {
    const catColor = getCategoryColor(biz.category);
    const CatIcon = CATEGORY_ICONS[biz.category] || Building2;
    return (
      <Pressable
        style={[styles.bizCard, { backgroundColor: t.surface, borderColor: t.border }]}
        onPress={() => handleCall(biz.name, biz.phone)}
      >
        <View style={styles.bizTop}>
          <View style={[styles.bizIconWrap, { backgroundColor: catColor + '15' }]}>
            <CatIcon size={20} color={catColor} />
          </View>
          <View style={styles.bizInfo}>
            <View style={styles.bizNameRow}>
              <Text style={[styles.bizName, { color: t.text }]} numberOfLines={1}>{biz.name}</Text>
              <BadgeCheck size={14} color={t.green} />
            </View>
            <Text style={[styles.bizCategory, { color: catColor }]}>{biz.category}</Text>
          </View>
        </View>

        <View style={styles.bizDetails}>
          <View style={styles.bizDetailRow}>
            <Phone size={12} color={t.textSecondary} />
            <Text style={[styles.bizDetailText, { color: t.textSecondary }]}>{biz.phone}</Text>
          </View>
          <View style={styles.bizDetailRow}>
            <MapPin size={12} color={t.textMuted} />
            <Text style={[styles.bizDetailText, { color: t.textMuted }]}>{biz.address}</Text>
          </View>
          {biz.verifiedDate && (
            <View style={styles.bizDetailRow}>
              <Clock size={12} color={t.textMuted} />
              <Text style={[styles.bizDetailText, { color: t.textMuted }]}>
                Verified {new Date(biz.verifiedDate).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.callStrip, { backgroundColor: t.greenDim }]}>
          <Phone size={14} color={t.green} />
          <Text style={[styles.callStripText, { color: t.green }]}>Tap to call</Text>
        </View>
      </Pressable>
    );
  }, [t, handleCall, getCategoryColor]);

  const keyExtractor = useCallback((item: Business) => item.id, []);

  const ListHeader = useMemo(() => (
    <>
      <View style={[styles.trustBanner, { backgroundColor: t.greenDim, borderColor: t.green + '20' }]}>
        <ShieldCheck size={16} color={t.green} />
        <Text style={[styles.trustText, { color: t.green }]}>
          All numbers human-verified · No ads · No paid placements · NZ only
        </Text>
      </View>
      <Text style={[styles.resultCount, { color: t.textMuted }]}>
        {filteredBusinesses.length} verified service{filteredBusinesses.length !== 1 ? 's' : ''}
      </Text>
    </>
  ), [t, filteredBusinesses.length]);

  const ListFooter = useMemo(() => (
    <View style={[styles.infoCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <ShieldCheck size={16} color={t.accent} />
      <Text style={[styles.infoText, { color: t.textSecondary }]}>
        This directory contains only human-verified New Zealand essential service numbers. No business can pay to be listed. No ranking is manipulated. Scams often begin with fake search results — presenceOS removes that vector entirely.
      </Text>
    </View>
  ), [t]);

  const ListEmpty = useMemo(() => (
    <View style={styles.emptyState}>
      <Search size={32} color={t.textMuted} />
      <Text style={[styles.emptyTitle, { color: t.textMuted }]}>No results</Text>
      <Text style={[styles.emptyBody, { color: t.textMuted }]}>
        Try a different search or category
      </Text>
    </View>
  ), [t]);

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Verified Directory</Text>
        <View style={{ width: 32 }} />
      </View>

      <PhilosophyBanner screen="directory" />

      <View style={[styles.searchWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Search size={16} color={t.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search verified NZ services..."
          placeholderTextColor={t.textMuted}
        />
      </View>

      <View style={styles.categoryScrollOuter}>
        <FlatList
          horizontal
          data={BUSINESS_CATEGORIES}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          renderItem={({ item: cat }) => {
            const active = selectedCategory === cat;
            const color = cat === 'All' ? t.accent : getCategoryColor(cat);
            return (
              <Pressable
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? color + '20' : t.surface,
                    borderColor: active ? color + '50' : t.border,
                  },
                ]}
                onPress={() => { haptic(); setSelectedCategory(cat); }}
              >
                <Text style={[
                  styles.categoryText,
                  { color: active ? color : t.textMuted },
                ]}>
                  {cat}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        data={filteredBusinesses}
        keyExtractor={keyExtractor}
        renderItem={renderBusiness}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  categoryScrollOuter: {
    marginTop: 12,
    marginBottom: 4,
  },
  categoryRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500' as const,
    flex: 1,
  },
  resultCount: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  bizCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  bizTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingBottom: 10,
  },
  bizIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizInfo: {
    flex: 1,
  },
  bizNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bizName: {
    fontSize: 15,
    fontWeight: '600' as const,
    flexShrink: 1,
  },
  bizCategory: {
    fontSize: 11,
    fontWeight: '500' as const,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  bizDetails: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 5,
  },
  bizDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bizDetailText: {
    fontSize: 12,
  },
  callStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  callStripText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  emptyBody: {
    fontSize: 13,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});

