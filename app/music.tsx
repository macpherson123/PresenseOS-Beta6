import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
  TextInput, Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import PhilosophyBanner from '@/components/PhilosophyBanner';
import { useUser } from '@/contexts/UserContext';
import { useMusic } from '@/contexts/MusicContext';
import {
  ChevronLeft, Play, Pause, SkipBack, SkipForward, Shuffle,
  Repeat, Music2, ListMusic, Heart, Search, Plus, X, LogIn, LogOut,
  List, RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LIKED_PLAYLIST_NAME = 'Liked Music';
const LIKED_PLAYLIST_COLOR = '#E85490';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function MusicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useUser();
  const { activeTheme: t } = useSettings();
  const {
    tracks: localTracks,
    playlists,
    playbackState,
    getCurrentTrack,
    setCurrentTrack,
    togglePlayPause,
    nextTrack,
    previousTrack,
    setRepeatMode,
    toggleShuffle,
    createPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    scanLocalMusic,
  } = useMusic();

  const [showPlayer, setShowPlayer] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isStreamingConnected, setIsStreamingConnected] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ id: string; name: string; trackIds: string[]; color: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const hasScanned = useRef(false);
  useEffect(() => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    let mounted = true;
    const doScan = async () => {
      setScanning(true);
      await scanLocalMusic();
      if (mounted) setScanning(false);
    };
    doScan();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-scan when returning from settings (user may have granted permission)
  useEffect(() => {
    const { AppState } = require('react-native');
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active' && localTracks.length === 0) {
        const rescan = async () => {
          setScanning(true);
          await scanLocalMusic();
          setScanning(false);
        };
        rescan();
      }
    });
    return () => sub.remove();
  }, [localTracks.length, scanLocalMusic]);

  const tracks = localTracks; // presenceOS uses local files only
  const currentTrack = getCurrentTrack() || (tracks[0] ?? null);

  const likedPlaylist = playlists.find(p => p.name === LIKED_PLAYLIST_NAME);

  const isLiked = useCallback((trackId: string) => {
    return likedPlaylist ? likedPlaylist.trackIds.includes(trackId) : false;
  }, [likedPlaylist]);

  const toggleLike = useCallback((trackId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!likedPlaylist) {
      createPlaylist(LIKED_PLAYLIST_NAME, [trackId], LIKED_PLAYLIST_COLOR);
    } else if (isLiked(trackId)) {
      removeTrackFromPlaylist(likedPlaylist.id, trackId);
    } else {
      addTrackToPlaylist(likedPlaylist.id, trackId);
    }
  }, [likedPlaylist, isLiked, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist]);

  const selectTrack = useCallback((track: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (user.musicService === 'local' && track.uri) {
      const queue = tracks.map((t: any) => t.id);
      setCurrentTrack(track.id, queue);
    }
    setShowPlayer(true);
  }, [tracks, user.musicService, setCurrentTrack]);

  const handleStreamingConnect = useCallback(() => {
    const service = user.musicService === 'spotify' ? 'Spotify' : 'Deezer';
    if (isStreamingConnected) {
      Alert.alert(`Disconnect ${service}`, `Disconnect your ${service} account?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => { setIsStreamingConnected(false); } },
      ]);
    } else {
      Alert.alert(`Connect ${service}`, `${service} OAuth integration is planned for a future release.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Connect (stub)', onPress: () => setIsStreamingConnected(true) },
      ]);
    }
  }, [user.musicService, isStreamingConnected]);

  const filteredTracks = searchQuery
    ? tracks.filter((track: any) =>
        track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        track.artist.toLowerCase().includes(searchQuery.toLowerCase()))
    : tracks;

  const progressPercent = playbackState.duration > 0
    ? Math.min((playbackState.currentTime / playbackState.duration) * 100, 100)
    : 0;

  // ─── Playlist Detail View ────────────────────────────────────────────────
  if (selectedPlaylist) {
    const playlistTracks = selectedPlaylist.trackIds
      .map((id) => tracks.find((tr: any) => tr.id === id))
      .filter(Boolean) as any[];
    const isLikedPl = selectedPlaylist.name === LIKED_PLAYLIST_NAME;
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <OSStatusBar />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>{selectedPlaylist.name}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.playlistDetailHero, { backgroundColor: selectedPlaylist.color + '18' }]}>
            <View style={[styles.playlistDetailIcon, { backgroundColor: selectedPlaylist.color + '30' }]}>
              {isLikedPl
                ? <Heart size={32} color={LIKED_PLAYLIST_COLOR} fill={LIKED_PLAYLIST_COLOR} />
                : <ListMusic size={32} color={selectedPlaylist.color} />}
            </View>
            <Text style={[styles.playlistDetailName, { color: t.text }]}>{selectedPlaylist.name}</Text>
            <Text style={[styles.playlistDetailCount, { color: t.textMuted }]}>{playlistTracks.length} tracks</Text>
            {playlistTracks.length > 0 && (
              <Pressable
                style={[styles.playAllBtn, { backgroundColor: selectedPlaylist.color }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const queue = playlistTracks.map((tr: any) => tr.id);
                  setCurrentTrack(playlistTracks[0].id, queue);
                  setShowPlayer(true);
                }}
              >
                <Play size={18} color="#fff" style={{ marginLeft: 2 }} />
                <Text style={styles.playAllBtnText}>Play All</Text>
              </Pressable>
            )}
          </View>
          {playlistTracks.length === 0 && (
            <View style={styles.noResults}>
              <Music2 size={28} color={t.textMuted} />
              <Text style={[styles.noResultsText, { color: t.textMuted }]}>No tracks in this playlist yet.</Text>
            </View>
          )}
          {playlistTracks.map((track: any) => {
            const isCurrent = playbackState.currentTrackId === track.id;
            return (
              <Pressable
                key={track.id}
                style={[
                  styles.trackRow, { borderBottomColor: (t as any).borderLight },
                  isCurrent && { backgroundColor: t.accentDim, borderBottomWidth: 0, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 10 },
                ]}
                onPress={() => {
                  const queue = playlistTracks.map((tr: any) => tr.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCurrentTrack(track.id, queue);
                  setShowPlayer(true);
                }}
              >
                <Image source={{ uri: track.artwork }} style={styles.trackThumb} />
                <View style={styles.trackMeta}>
                  <Text style={[styles.trackName, { color: t.text }, isCurrent && { color: t.accent }]}>{track.title}</Text>
                  <Text style={[styles.trackSubtitle, { color: t.textMuted }]}>{track.artist}</Text>
                </View>
                <Pressable onPress={() => toggleLike(track.id)} hitSlop={8} style={styles.trackLikeBtn}>
                  <Heart size={16} color={isLiked(track.id) ? t.red : t.border} fill={isLiked(track.id) ? t.red : 'transparent'} />
                </Pressable>
                <Text style={[styles.trackDuration, { color: t.textMuted }]}>{formatDuration(track.duration)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <BottomBackBar onBack={() => setSelectedPlaylist(null)} />
      </View>
    );
  }

  // ─── Now Playing Screen ──────────────────────────────────────────────────
  if (showPlayer && currentTrack) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <OSStatusBar />
        <View style={styles.header}>
          <View style={{ width: 32 }} />
          <Text style={[styles.headerTitle, { color: t.text }]}>Now Playing</Text>
          <Pressable onPress={() => setShowAddToPlaylist(v => !v)} hitSlop={12}>
            <List size={20} color={t.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.playerContent}>
          <View style={styles.artworkContainer}>
            <Image source={{ uri: currentTrack.artwork }} style={styles.artwork} />
            <View style={styles.artworkOverlay} />
          </View>

          <View style={styles.trackInfo}>
            <Text style={[styles.trackTitle, { color: t.text }]}>{currentTrack.title}</Text>
            <Text style={[styles.trackArtist, { color: t.textSecondary }]}>{currentTrack.artist}</Text>
            <Text style={[styles.trackAlbum, { color: t.textMuted }]}>{(currentTrack as any).album}</Text>
          </View>

          <View style={styles.progressWrap}>
            <View style={[styles.progressBar, { backgroundColor: t.border }]}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` as any, backgroundColor: t.accent }]} />
            </View>
            <View style={styles.progressTimes}>
              <Text style={[styles.timeText, { color: t.textMuted }]}>
                {formatDuration(Math.floor(playbackState.currentTime))}
              </Text>
              <Text style={[styles.timeText, { color: t.textMuted }]}>
                {formatDuration(Math.floor(playbackState.duration || currentTrack.duration || 0))}
              </Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              style={styles.controlBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleShuffle(); }}
            >
              <Shuffle size={20} color={playbackState.isShuffle ? t.accent : t.textMuted} />
            </Pressable>
            <Pressable style={styles.controlBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); previousTrack(); }}>
              <SkipBack size={28} color={t.text} />
            </Pressable>
            <Pressable style={[styles.playBtn, { backgroundColor: t.accent }]} onPress={togglePlayPause}>
              {playbackState.isPlaying
                ? <Pause size={30} color={t.bg} />
                : <Play size={30} color={t.bg} style={{ marginLeft: 3 }} />}
            </Pressable>
            <Pressable style={styles.controlBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); nextTrack(); }}>
              <SkipForward size={28} color={t.text} />
            </Pressable>
            <Pressable
              style={styles.controlBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const modes = ['off', 'all', 'one'] as const;
                const next = modes[(modes.indexOf(playbackState.repeatMode) + 1) % modes.length];
                setRepeatMode(next);
              }}
            >
              <Repeat size={20} color={playbackState.repeatMode !== 'off' ? t.accent : t.textMuted} />
            </Pressable>
          </View>

          <Pressable style={styles.likeBtn} onPress={() => toggleLike(currentTrack.id)}>
            <Heart
              size={22}
              color={isLiked(currentTrack.id) ? t.red : t.textMuted}
              fill={isLiked(currentTrack.id) ? t.red : 'transparent'}
            />
          </Pressable>
        </View>

        {showAddToPlaylist && (
          <View style={[styles.addToPlaylistModal, { backgroundColor: t.bg, borderTopColor: t.border }]}>
            <View style={styles.addToPlaylistHeader}>
              <Text style={[styles.addToPlaylistTitle, { color: t.text }]}>Add to Playlist</Text>
              <Pressable onPress={() => setShowAddToPlaylist(false)} hitSlop={8}>
                <X size={20} color={t.textMuted} />
              </Pressable>
            </View>
            <ScrollView>
              {playlists.filter(p => p.name !== LIKED_PLAYLIST_NAME).map(pl => (
                <Pressable
                  key={pl.id}
                  style={[styles.addToPlaylistRow, { borderBottomColor: t.border }]}
                  onPress={() => {
                    addTrackToPlaylist(pl.id, currentTrack.id);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setShowAddToPlaylist(false);
                    Alert.alert('Added', `"${currentTrack.title}" added to ${pl.name}`);
                  }}
                >
                  <View style={[styles.addToPlaylistIcon, { backgroundColor: pl.color + '20' }]}>
                    <ListMusic size={16} color={pl.color} />
                  </View>
                  <Text style={[styles.addToPlaylistName, { color: t.text }]}>{pl.name}</Text>
                </Pressable>
              ))}
              {playlists.filter(p => p.name !== LIKED_PLAYLIST_NAME).length === 0 && (
                <Text style={[styles.emptyText, { color: t.textMuted }]}>
                  No playlists yet. Create one from the library.
                </Text>
              )}
            </ScrollView>
          </View>
        )}
        <BottomBackBar onBack={() => setShowPlayer(false)} />
      </View>
    );
  }

  // ─── Library Screen ──────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: t.text }]}>Music</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable hitSlop={12} onPress={async () => { setScanning(true); await scanLocalMusic(); setScanning(false); }}>
            <RefreshCw size={18} color={scanning ? t.accent : t.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setShowSearch(!showSearch)} hitSlop={12}>
            {showSearch ? <X size={20} color={t.text} /> : <Search size={20} color={t.textSecondary} />}
          </Pressable>
        </View>
      </View>

      <PhilosophyBanner screen="music" />

      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Search size={16} color={t.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: t.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search songs, artists..."
            placeholderTextColor={t.textMuted}
            autoFocus
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={t.textMuted} /></Pressable>
          ) : null}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.sourceSection}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>SOURCE</Text>
          <View style={styles.sourceRow}>
            {(['local', 'spotify', 'deezer'] as const).map((svc) => (
              <Pressable
                key={svc}
                style={[
                  styles.sourceBtn,
                  { backgroundColor: t.surface, borderColor: t.border },
                  user.musicService === svc && { borderColor: t.accent, backgroundColor: t.accentDim },
                ]}
                onPress={() => { updateUser({ musicService: svc }); if (svc !== 'local') setIsStreamingConnected(false); }}
              >
                <Music2 size={16} color={user.musicService === svc ? t.accent : t.textMuted} />
                <Text style={[styles.sourceBtnText, { color: t.textMuted }, user.musicService === svc && { color: t.accent }]}>
                  {svc === 'local' ? 'Local' : svc.charAt(0).toUpperCase() + svc.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {user.musicService !== 'local' && (
          <View style={[styles.connectCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.connectInfo}>
              <Music2 size={18} color={isStreamingConnected ? t.green : t.textMuted} />
              <View style={styles.connectTextWrap}>
                <Text style={[styles.connectTitle, { color: t.text }]}>
                  {user.musicService === 'spotify' ? 'Spotify' : 'Deezer'}
                </Text>
                <Text style={[styles.connectStatus, { color: isStreamingConnected ? t.green : t.textMuted }]}>
                  {isStreamingConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.connectBtn, { backgroundColor: isStreamingConnected ? t.redDim : t.accentDim }]}
              onPress={handleStreamingConnect}
            >
              {isStreamingConnected ? <LogOut size={16} color={t.red} /> : <LogIn size={16} color={t.accent} />}
              <Text style={[styles.connectBtnText, { color: isStreamingConnected ? t.red : t.accent }]}>
                {isStreamingConnected ? 'Disconnect' : 'Connect'}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>PLAYLISTS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playlistScroll}>
          <Pressable
            style={[styles.playlistCard, styles.addPlaylistCard, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              createPlaylist('My Playlist ' + (playlists.length + 1), [], t.accent);
              Alert.alert('Playlist Created', 'New playlist added. Open a track and tap the list icon to add songs.');
            }}
          >
            <View style={[styles.playlistIcon, { backgroundColor: t.accentDim }]}>
              <Plus size={22} color={t.accent} />
            </View>
            <Text style={[styles.playlistName, { color: t.textMuted }]}>New</Text>
          </Pressable>

          {likedPlaylist && likedPlaylist.trackIds.length > 0 && (
            <Pressable
              key={likedPlaylist.id}
              style={[styles.playlistCard, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPlaylist(likedPlaylist); }}
            >
              <View style={[styles.playlistIcon, { backgroundColor: '#E8549020' }]}>
                <Heart size={22} color={LIKED_PLAYLIST_COLOR} fill={LIKED_PLAYLIST_COLOR} />
              </View>
              <Text style={[styles.playlistName, { color: t.text }]}>{likedPlaylist.name}</Text>
              <Text style={[styles.playlistCount, { color: t.textMuted }]}>{likedPlaylist.trackIds.length} tracks</Text>
            </Pressable>
          )}

          {playlists.filter(p => p.name !== LIKED_PLAYLIST_NAME).map((pl) => (
            <Pressable
              key={pl.id}
              style={[styles.playlistCard, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPlaylist(pl); }}
            >
              <View style={[styles.playlistIcon, { backgroundColor: pl.color + '20' }]}>
                <ListMusic size={22} color={pl.color} />
              </View>
              <Text style={[styles.playlistName, { color: t.text }]}>{pl.name}</Text>
              <Text style={[styles.playlistCount, { color: t.textMuted }]}>{pl.trackIds.length} tracks</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>
          {searchQuery ? `RESULTS (${filteredTracks.length})` : 'ALL TRACKS'}
        </Text>
        {scanning && (
          <View style={{ alignItems: 'center', padding: 24, gap: 10 }}>
            <ActivityIndicator color={t.accent} size="large" />
            <Text style={{ color: t.textMuted, fontSize: 13 }}>Scanning for music…</Text>
          </View>
        )}
        {!scanning && tracks.length === 0 && (
          <View style={{ alignItems: 'center', padding: 32, gap: 14 }}>
            <Music2 size={44} color={t.textMuted} style={{ opacity: 0.5 }} />
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>No music found</Text>
 <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
  Add .mp3, .flac or .m4a files to your device storage.{'\n\n'}
  If files exist but don't appear, grant Media Audio permission:{'\n'}
  Settings → Apps → PresenceOS → Permissions → Media
</Text>
            <Pressable
              style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: t.accentDim, borderWidth: 1, borderColor: t.accent + '40' }}
              onPress={async () => { setScanning(true); await scanLocalMusic(); setScanning(false); }}
            >
              <Text style={{ color: t.accent, fontWeight: '600' }}>Scan Again</Text>
            </Pressable>
          </View>
        )}
        {filteredTracks.map((track: any) => {
          const isCurrent = playbackState.currentTrackId === track.id;
          return (
            <Pressable
              key={track.id}
              style={[
                styles.trackRow, { borderBottomColor: (t as any).borderLight },
                isCurrent && { backgroundColor: t.accentDim, borderBottomWidth: 0, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 10 },
              ]}
              onPress={() => selectTrack(track)}
            >
              <Image source={{ uri: track.artwork }} style={styles.trackThumb} />
              <View style={styles.trackMeta}>
                <Text style={[styles.trackName, { color: t.text }, isCurrent && { color: t.accent }]}>{track.title}</Text>
                <Text style={[styles.trackSubtitle, { color: t.textMuted }]}>{track.artist}</Text>
              </View>
              <Pressable onPress={() => toggleLike(track.id)} hitSlop={8} style={styles.trackLikeBtn}>
                <Heart size={16} color={isLiked(track.id) ? t.red : t.border} fill={isLiked(track.id) ? t.red : 'transparent'} />
              </Pressable>
              <Text style={[styles.trackDuration, { color: t.textMuted }]}>{formatDuration(track.duration)}</Text>
            </Pressable>
          );
        })}

        {filteredTracks.length === 0 && searchQuery && (
          <View style={styles.noResults}>
            <Search size={24} color={t.textMuted} />
            <Text style={[styles.noResultsText, { color: t.textMuted }]}>No tracks found for "{searchQuery}"</Text>
          </View>
        )}
        {filteredTracks.length === 0 && !searchQuery && (
          <View style={styles.noResults}>
            <Music2 size={40} color={t.textMuted + '60'} />
            <Text style={[styles.noResultsText, { color: t.textMuted }]}>
              {scanning
                ? 'Scanning your music library…'
                : 'No audio files found on this device.'}
            </Text>
            {!scanning && (
              <>
                <Text style={[styles.noResultsHint, { color: t.textMuted }]}>
                  Make sure PresenceOS has Music / Media permission in your device settings.
                </Text>
                <Pressable
                  style={[styles.scanBtn, { backgroundColor: t.accent }]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setScanning(true);
                    await scanLocalMusic();
                    setScanning(false);
                  }}
                >
                  <Text style={[styles.scanBtnText, { color: t.bg }]}>
                    {scanning ? 'Scanning…' : 'Scan Music Library'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.scanBtn, { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, marginTop: 8 }]}
                  onPress={() => { const { Linking: L } = require('react-native'); L.openSettings(); }}
                >
                  <Text style={[styles.scanBtnText, { color: t.textSecondary }]}>Open Permissions Settings</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {currentTrack && playbackState.currentTrackId && (
        <Pressable
          style={[styles.miniPlayer, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 8) }]}
          onPress={() => setShowPlayer(true)}
        >
          <Image source={{ uri: currentTrack.artwork }} style={styles.miniArt} />
          <View style={styles.miniInfo}>
            <Text style={[styles.miniTitle, { color: t.text }]} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={[styles.miniArtist, { color: t.textMuted }]} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>
          <Pressable onPress={togglePlayPause} hitSlop={12}>
            {playbackState.isPlaying ? <Pause size={22} color={t.text} /> : <Play size={22} color={t.text} />}
          </Pressable>
        </Pressable>
      )}
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: 0.5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionLabel: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 2, marginTop: 20, marginBottom: 12 },
  sourceSection: { marginBottom: 8 },
  sourceRow: { flexDirection: 'row', gap: 10 },
  sourceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, borderWidth: 1 },
  sourceBtnText: { fontSize: 13, fontWeight: '500' as const },
  connectCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 14, borderWidth: 1, marginTop: 8 },
  connectInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  connectTextWrap: { flex: 1 },
  connectTitle: { fontSize: 14, fontWeight: '600' as const },
  connectStatus: { fontSize: 11, marginTop: 2 },
  connectBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  connectBtnText: { fontSize: 12, fontWeight: '600' as const },
  playlistScroll: { marginBottom: 8, marginHorizontal: -20, paddingHorizontal: 20 },
  playlistCard: { borderRadius: 14, padding: 16, marginRight: 12, width: 130, borderWidth: 1 },
  addPlaylistCard: { justifyContent: 'center', alignItems: 'center' },
  playlistIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  playlistName: { fontSize: 13, fontWeight: '600' as const, marginBottom: 2 },
  playlistCount: { fontSize: 11 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  trackThumb: { width: 44, height: 44, borderRadius: 8 },
  trackMeta: { flex: 1 },
  trackName: { fontSize: 14, fontWeight: '500' as const },
  trackSubtitle: { fontSize: 12, marginTop: 1 },
  trackLikeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trackDuration: { fontSize: 12 },
  noResults: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  noResultsText: { fontSize: 14, textAlign: 'center' as const, maxWidth: 260 },
  noResultsHint: { fontSize: 12, textAlign: 'center' as const, maxWidth: 280, lineHeight: 18 },
  scanBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  scanBtnText: { fontSize: 13, fontWeight: '600' as const },
  miniPlayer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  miniArt: { width: 40, height: 40, borderRadius: 8 },
  miniInfo: { flex: 1 },
  miniTitle: { fontSize: 13, fontWeight: '500' as const },
  miniArtist: { fontSize: 11 },
  playerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  artworkContainer: { marginBottom: 36, borderRadius: 20, overflow: 'hidden' },
  artwork: { width: 280, height: 280, borderRadius: 20 },
  artworkOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  trackInfo: { alignItems: 'center', marginBottom: 28 },
  trackTitle: { fontSize: 22, fontWeight: '600' as const, marginBottom: 4 },
  trackArtist: { fontSize: 15, marginBottom: 2 },
  trackAlbum: { fontSize: 12 },
  progressWrap: { width: '100%', marginBottom: 28 },
  progressBar: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressTimes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeText: { fontSize: 11 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 20 },
  controlBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  likeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addToPlaylistModal: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '50%' },
  addToPlaylistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  addToPlaylistTitle: { fontSize: 16, fontWeight: '600' as const },
  addToPlaylistRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  addToPlaylistIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addToPlaylistName: { fontSize: 14, fontWeight: '500' as const },
  emptyText: { fontSize: 13, textAlign: 'center' as const, paddingVertical: 20 },
  playlistDetailHero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, marginBottom: 8, borderRadius: 16, marginHorizontal: 0 },
  playlistDetailIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  playlistDetailName: { fontSize: 20, fontWeight: '700' as const, marginBottom: 4 },
  playlistDetailCount: { fontSize: 13, marginBottom: 16 },
  playAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 10 },
  playAllBtnText: { fontSize: 15, fontWeight: '600' as const, color: '#fff' },
});
