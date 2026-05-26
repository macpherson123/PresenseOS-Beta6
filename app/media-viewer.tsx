/**
 * Media Viewer — swipeable photo / video viewer launched from Files.
 * Params:
 *   uris  — JSON array of { uri, name } objects
 *   index — starting index (default 0)
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, Alert,
  FlatList, StatusBar, ActivityIndicator, NativeModules, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import {
  ChevronLeft, Trash2, Share2, Play, Pause,
  Volume2, VolumeX,
} from 'lucide-react-native';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';

const { PresenceDeviceControl } = NativeModules;

const { width: SW, height: SH } = Dimensions.get('window');

interface MediaItem { uri: string; name: string }

function isVideo(name: string) {
  return /\.(mp4|mkv|avi|mov|webm|3gp)$/i.test(name);
}

function MediaSlide({ item, active }: { item: MediaItem; active: boolean }) {
  const videoRef = useRef<Video>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      videoRef.current?.pauseAsync().catch(() => {});
      setPlaying(false);
    }
  }, [active]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowControls(true);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (isVideo(item.name) && active) scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [active, item.name, scheduleHide]);

  const togglePlay = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing) {
      await videoRef.current?.pauseAsync();
      setPlaying(false);
    } else {
      await videoRef.current?.playAsync();
      setPlaying(true);
    }
    scheduleHide();
  }, [playing, scheduleHide]);

  const onPlaybackUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setLoaded(true);
    setPlaying(status.isPlaying ?? false);
    setPosition(status.positionMillis ?? 0);
    setDuration(status.durationMillis ?? 0);
    if (status.didJustFinish) { setPlaying(false); setShowControls(true); }
  }, []);

  const seek = useCallback((frac: number) => {
    if (duration > 0) videoRef.current?.setPositionAsync(frac * duration).catch(() => {});
    scheduleHide();
  }, [duration, scheduleHide]);

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  if (isVideo(item.name)) {
    const progress = duration > 0 ? position / duration : 0;
    return (
      <Pressable style={MV.slide} onPress={() => { scheduleHide(); }}>
        <Video
          ref={videoRef}
          source={{ uri: item.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          isMuted={muted}
          onPlaybackStatusUpdate={onPlaybackUpdate}
          shouldPlay={false}
        />
        {!loaded && (
          <View style={MV.loadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
        {showControls && (
          <View style={MV.videoControls}>
            {/* Progress bar */}
            <Pressable
              style={MV.progressBar}
              onPress={(e) => seek(e.nativeEvent.locationX / (SW - 48))}
            >
              <View style={[MV.progressFill, { width: `${progress * 100}%` as any }]} />
            </Pressable>
            <View style={MV.videoRow}>
              <Text style={MV.timeText}>{fmtMs(position)}</Text>
              <Pressable hitSlop={16} onPress={togglePlay} style={MV.playBtn}>
                {playing
                  ? <Pause size={28} color="#fff" />
                  : <Play size={28} color="#fff" style={{ marginLeft: 3 }} />}
              </Pressable>
              <Text style={MV.timeText}>{fmtMs(duration)}</Text>
              <Pressable hitSlop={16} onPress={() => { setMuted(m => !m); scheduleHide(); }}>
                {muted ? <VolumeX size={18} color="#aaa" /> : <Volume2 size={18} color="#aaa" />}
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={MV.slide}>
      <Image
        source={{ uri: item.uri }}
        style={MV.photo}
        contentFit="contain"
        transition={120}
      />
    </View>
  );
}

export default function MediaViewerScreen() {
  const { uris: urisParam, index: indexParam } = useLocalSearchParams<{ uris: string; index: string }>();
  const router = useRouter();
  const { activeTheme: t } = useSettings();

  const items: MediaItem[] = (() => {
    try { return JSON.parse(urisParam ?? '[]'); } catch { return []; }
  })();
  const startIndex = parseInt(indexParam ?? '0', 10) || 0;

  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    return () => StatusBar.setHidden(false, 'fade');
  }, []);

  useEffect(() => {
    if (listRef.current && startIndex > 0) {
      listRef.current.scrollToIndex({ index: startIndex, animated: false });
    }
  }, [startIndex]);

  const onViewableChange = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setCurrentIndex(viewableItems[0].index ?? 0);
  }, []);

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const deleteItem = useCallback(async () => {
    const item = items[currentIndex];
    if (!item) return;
    Alert.alert('Delete', `Delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            if (PresenceDeviceControl?.deleteFile) {
              await PresenceDeviceControl.deleteFile(item.uri.replace('file://', ''));
            } else {
              await FileSystem.deleteAsync(item.uri, { idempotent: true });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (items.length <= 1) { router.back(); return; }
            // Navigate away from deleted item
            const newIdx = currentIndex > 0 ? currentIndex - 1 : 0;
            listRef.current?.scrollToIndex({ index: newIdx, animated: true });
            setCurrentIndex(newIdx);
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete');
          }
        },
      },
    ]);
  }, [items, currentIndex, router]);

  const shareItem = useCallback(async () => {
    const item = items[currentIndex];
    if (!item) return;
    try { await Share.share({ url: item.uri, title: item.name }); } catch {}
  }, [items, currentIndex]);

  const current = items[currentIndex];

  return (
    <View style={[MV.root, { backgroundColor: '#000' }]}>
      {/* Header */}
      <View style={MV.header}>
        
        <Text style={MV.headerTitle} numberOfLines={1}>{current?.name ?? ''}</Text>
        <View style={MV.headerRight}>
          <Pressable hitSlop={16} onPress={shareItem}>
            <Share2 size={20} color="#aaa" />
          </Pressable>
          <Pressable hitSlop={16} onPress={deleteItem}>
            <Trash2 size={20} color="#ff4444" />
          </Pressable>
        </View>
      </View>

      {/* Media slides */}
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
        onViewableItemsChanged={onViewableChange}
        viewabilityConfig={viewConfig}
        renderItem={({ item, index }) => (
          <MediaSlide item={item} active={index === currentIndex} />
        )}
        style={{ flex: 1 }}
      />

      {/* Counter */}
      {items.length > 1 && (
        <View style={MV.counter}>
          <Text style={MV.counterText}>{currentIndex + 1} / {items.length}</Text>
        </View>
      )}
    <BottomBackBar />
    </View>
  );
}

const MV = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#000' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.7)' },
  headerTitle:  { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' as const },
  headerRight:  { flexDirection: 'row', gap: 18 },
  slide:        { width: SW, height: SH, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  photo:        { width: SW, height: SH },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  videoControls: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12, gap: 8 },
  progressBar:  { height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  videoRow:     { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playBtn:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timeText:     { color: '#ccc', fontSize: 12, minWidth: 40 },
  counter:      { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  counterText:  { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
