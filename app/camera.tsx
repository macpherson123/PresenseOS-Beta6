import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, Alert, FlatList, Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, Camera as CameraIcon, X, Grid3x3, Aperture,
  SwitchCamera, Zap, ZapOff, Video, Film,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let CameraView: React.ComponentType<any> | null = null;
let useCameraPermissions: (() => [any, () => Promise<any>]) | null = null;
let useMicrophonePermissions: (() => [any, () => Promise<any>]) | null = null;

if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
    // Microphone permission is required for video recording on Android 13+
    useMicrophonePermissions = cam.useMicrophonePermissions;
  } catch (e) {
    console.log('[Camera] expo-camera not available');
  }
}

const ALBUM_NAME = 'presenseCamera';

async function saveToDeviceAlbum(uri: string): Promise<string> {
  const asset = await MediaLibrary.createAssetAsync(uri);
  const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (album) {
    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
  } else {
    await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
  }
  return asset.uri;
}
const PHOTOS_KEY = 'presence_photos';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_COLS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - (GRID_COLS + 1) * GRID_GAP) / GRID_COLS;

interface StoredPhoto {
  id: string;
  uri: string;
  timestamp: string;
}

function CameraPermissionGate({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web' || !useCameraPermissions) {
    return <>{children}</>;
  }

  const [permission, requestPermission] = useCameraPermissions!();

  if (!permission) {
    return <View style={styles.permissionContainer}><Text style={styles.permissionText}>Loading...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Aperture size={48} color="#E8A838" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>presenceOS needs camera access to take photos. Photos stay on your device only.</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

export default function CameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t } = useSettings();
  const queryClient = useQueryClient();
  const [showViewfinder, setShowViewfinder] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState(false);
  const cameraRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState<'photo'|'video'>('photo');

  const photosQuery = useQuery({
    queryKey: ['local-photos'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(PHOTOS_KEY);
      return stored ? (JSON.parse(stored) as StoredPhoto[]) : [];
    },
  });

  const savePhotoMutation = useMutation({
    mutationFn: async (newPhoto: StoredPhoto) => {
      const existing = photosQuery.data || [];
      const updated = [newPhoto, ...existing];
      await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['local-photos'], data);
      console.log('[Camera] Photo saved, total:', data.length);
    },
  });


  useFocusEffect(useCallback(() => {
    const pruneDeleted = async () => {
      const stored = await AsyncStorage.getItem(PHOTOS_KEY);
      if (!stored) return;
      const photos: StoredPhoto[] = JSON.parse(stored);
      const alive = await Promise.all(photos.map(async p => {
        try { const info = await FileSystem.getInfoAsync(p.uri); return info.exists ? p : null; }
        catch { return null; }
      }));
      const valid = alive.filter(Boolean) as StoredPhoto[];
      if (valid.length !== photos.length) {
        await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(valid));
        queryClient.setQueryData(['local-photos'], valid);
      }
    };
    pruneDeleted();
  }, [queryClient]));

  const takePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (cameraRef.current && Platform.OS !== 'web') {
      try {
        const result = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
        if (result?.uri) {
          const finalUri = await saveToDeviceAlbum(result.uri).catch(() => result.uri);
          const photo: StoredPhoto = {
            id: `photo_${Date.now()}`,
            uri: finalUri,
            timestamp: new Date().toISOString(),
          };
          savePhotoMutation.mutate(photo);
          setShowViewfinder(false);
          return;
        }
      } catch (e) {
        console.warn('[Camera] CameraView capture error:', e);
      }
    }

    try {
      const ImagePicker = require('expo-image-picker');
      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (!pickerResult.canceled && pickerResult.assets[0]) {
        const rawUri = pickerResult.assets[0].uri;
        const finalUri = await saveToDeviceAlbum(rawUri).catch(() => rawUri);
        const photo: StoredPhoto = {
          id: `photo_${Date.now()}`,
          uri: finalUri,
          timestamp: new Date().toISOString(),
        };
        savePhotoMutation.mutate(photo);
        setShowViewfinder(false);
      }
    } catch (error) {
      console.warn('[Camera] Error taking photo:', error);
      Alert.alert('Camera Error', 'Could not take photo. Please try again.');
    }
  }, [savePhotoMutation]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || Platform.OS === 'web') return;
    // Request microphone permission on-demand. expo-camera will silently fail
    // recordAsync() if mic permission hasn't been granted on Android 13+,
    // and the error bubbles up as an immediate promise rejection.
    if (useMicrophonePermissions) {
      try {
        // Invoke statically — we can't call a hook here, so use the imperative API
        const { Camera } = require('expo-camera');
        if (Camera?.requestMicrophonePermissionsAsync) {
          const micPerm = await Camera.requestMicrophonePermissionsAsync();
          if (!micPerm?.granted) {
            Alert.alert(
              'Microphone Required',
              'Grant microphone access to record video with sound.',
            );
            return; // stay on viewfinder — do NOT dismiss
          }
        }
      } catch {}
    }
    try {
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const result = await cameraRef.current.recordAsync({ maxDuration: 60, quality: '720p' });
      if (result?.uri) {
        const finalUri = await saveToDeviceAlbum(result.uri).catch(() => result.uri);
        const video: StoredPhoto = {
          id: `video_${Date.now()}`,
          uri: finalUri,
          timestamp: new Date().toISOString(),
        };
        savePhotoMutation.mutate(video);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Only on successful completion: close viewfinder so user sees the new video in grid
      setShowViewfinder(false);
    } catch (e: any) {
      console.warn('[Camera] Recording error:', e);
      Alert.alert('Recording Failed', e?.message ?? 'Could not start video recording.');
      // Stay on viewfinder — user can retry or close manually
    } finally {
      setIsRecording(false);
    }
  }, [savePhotoMutation]);

  const stopRecording = useCallback(() => {
    if (!cameraRef.current || !isRecording) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cameraRef.current.stopRecording();
  }, [isRecording]);

  const handleShutterPress = useCallback(() => {
    if (mode === 'video') {
      if (isRecording) { stopRecording(); }
      else { startRecording(); }
    } else {
      takePhoto();
    }
  }, [mode, isRecording, stopRecording, startRecording, takePhoto]);


  const openViewer = useCallback((startIndex: number) => {
    const allPhotos = photosQuery.data || [];
    const items = allPhotos.map(p => ({
      uri: p.uri,
      name: p.uri.split('/').pop() ?? p.id,
    }));
    router.push(`/media-viewer?uris=${encodeURIComponent(JSON.stringify(items))}&index=${startIndex}` as never);
  }, [photosQuery.data, router]);


  const photos = photosQuery.data || [];

  if (showViewfinder && Platform.OS !== 'web' && CameraView) {
    return (
      <CameraPermissionGate>
        <View style={[styles.container, { backgroundColor: '#000' }]}>
          <CameraView
            ref={cameraRef}
            style={styles.viewfinder}
            facing={facing}
            enableTorch={flash}
            mode={mode}
          />

          {/* ── Top bar: close + flash ── */}
          <View style={[styles.vfHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => {
              if (isRecording) stopRecording();
              setShowViewfinder(false);
            }} style={styles.vfBtn}>
              <X size={24} color="#fff" />
            </Pressable>
            {/* Recording indicator */}
            {isRecording && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>REC</Text>
              </View>
            )}
            <Pressable onPress={() => setFlash(prev => !prev)} style={styles.vfBtn}>
              {flash ? <Zap size={22} color="#F97316" /> : <ZapOff size={22} color="rgba(255,255,255,0.7)" />}
            </Pressable>
          </View>

          {/* ── Mode toggle: PHOTO / VIDEO ── */}
          {!isRecording && (
            <View style={{
              position: 'absolute', bottom: insets.bottom + 120, left: 0, right: 0,
              flexDirection: 'row', justifyContent: 'center', gap: 0,
            }}>
              {(['photo', 'video'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMode(m); }}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 6,
                    borderBottomWidth: 2,
                    borderBottomColor: mode === m ? '#fff' : 'transparent',
                  }}
                >
                  <Text style={{
                    color: mode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: 13, fontWeight: '600', letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}>{m}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Bottom controls ── */}
          <View style={[styles.vfControls, { paddingBottom: insets.bottom + 20 }]}>
            <Pressable
              style={styles.vfFlipBtn}
              onPress={() => {
                if (isRecording) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFacing(prev => prev === 'back' ? 'front' : 'back');
              }}
            >
              <SwitchCamera size={24} color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'} />
            </Pressable>

            {/* Shutter — white circle for photo, red square for recording */}
            <Pressable style={styles.shutterBtn} onPress={handleShutterPress}>
              <View style={styles.shutterOuter}>
                {mode === 'video'
                  ? <View style={[styles.shutterInner, isRecording && {
                      backgroundColor: '#ef4444',
                      borderRadius: 6,
                      width: 28, height: 28,
                    }]} />
                  : <View style={styles.shutterInner} />
                }
              </View>
            </Pressable>

            <View style={{ width: 48 }} />
          </View>
        </View>
      </CameraPermissionGate>
    );
  }


  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Camera</Text>
        <View style={{ width: 32 }} />
      </View>

      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Aperture size={40} color={t.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: t.text }]}>No photos yet</Text>
          <Text style={[styles.emptyBody, { color: t.textMuted }]}>
            Photos taken with presenceOS stay on your device only. They are never uploaded, shared, or synced anywhere.
          </Text>
          <Pressable
            style={[styles.takePhotoBtn, { backgroundColor: t.accent }]}
            onPress={() => {
              if (Platform.OS !== 'web' && CameraView) {
                setShowViewfinder(true);
              } else {
                takePhoto();
              }
            }}
          >
            <CameraIcon size={20} color={t.bg} />
            <Text style={[styles.takePhotoBtnText, { color: t.bg }]}>Open Camera</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.galleryHeader, { borderBottomColor: t.border }]}>
            <Grid3x3 size={14} color={t.textMuted} />
            <Text style={[styles.galleryCount, { color: t.textMuted }]}>
              {photos.length} photo{photos.length !== 1 ? 's' : ''} · local only
            </Text>
          </View>

          <FlatList
            data={photos}
            keyExtractor={(item) => item.id}
            numColumns={GRID_COLS}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item, index }) => {
              const isVid = /\.(mp4|mkv|avi|mov|webm|3gp)$/i.test(item.uri);
              return (
                <Pressable
                  style={styles.gridItem}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openViewer(index); }}
                >
                  <Image source={{ uri: item.uri }} style={styles.gridImage} />
                  {isVid && (
                    <View style={styles.videoThumbBadge}>
                      <Film size={14} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </>
      )}

      {photos.length > 0 && (
        <View style={[styles.cameraBar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.cameraBarContent}>
            {photos[0] && (
              <Pressable
                style={[styles.lastPhoto, { borderColor: t.border }]}
                onPress={() => openViewer(0)}
              >
                <Image source={{ uri: photos[0].uri }} style={styles.lastPhotoImage} />
              </Pressable>
            )}
            <Pressable
              style={[styles.mainShutterBtn, { borderColor: t.accent }]}
              onPress={() => {
                if (Platform.OS !== 'web' && CameraView) {
                  setShowViewfinder(true);
                } else {
                  takePhoto();
                }
              }}
            >
              <View style={[styles.mainShutterInner, { backgroundColor: t.accent }]}>
                <CameraIcon size={24} color={t.bg} />
              </View>
            </Pressable>
            <View style={{ width: 48 }} />
          </View>
        </View>
      )}
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  viewfinder: { flex: 1 },
  vfHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row',
    justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 10,
  },
  vfBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  vfControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  vfFlipBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterBtn: { alignItems: 'center', justifyContent: 'center' },
  shutterOuter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  shutterInner: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff',
  },
  permissionContainer: {
    flex: 1, backgroundColor: '#0A0A0C', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 16,
  },
  permissionTitle: { fontSize: 20, fontWeight: '600' as const, color: '#F0EDE8' },
  permissionText: { fontSize: 14, color: '#9A968F', textAlign: 'center' as const, lineHeight: 22 },
  permissionBtn: {
    backgroundColor: '#E8A838', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
    marginTop: 8,
  },
  permissionBtnText: { fontSize: 16, fontWeight: '600' as const, color: '#0A0A0C' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, borderWidth: 1,
  },
  emptyTitle: { fontSize: 20, fontWeight: '600' as const, marginBottom: 10 },
  emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center' as const, marginBottom: 32 },
  takePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28,
    paddingVertical: 16, borderRadius: 16,
  },
  takePhotoBtnText: { fontSize: 16, fontWeight: '600' as const },
  galleryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  galleryCount: { fontSize: 12, letterSpacing: 0.5 },
  gridContent: { paddingTop: GRID_GAP },
  gridRow: { gap: GRID_GAP, paddingHorizontal: GRID_GAP, marginBottom: GRID_GAP },
  gridItem: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 4, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  videoThumbBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: 3 },
  cameraBar: { paddingTop: 12, borderTopWidth: 1 },
  cameraBarContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32,
  },
  lastPhoto: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', borderWidth: 2 },
  lastPhotoImage: { width: '100%', height: '100%' },
  mainShutterBtn: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  mainShutterInner: {
    width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
  },
});

