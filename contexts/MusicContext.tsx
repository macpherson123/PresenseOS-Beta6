import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import * as MediaLibrary from 'expo-media-library';
import { Audio, AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { NativeModules, Platform } from 'react-native';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork?: string;
  uri: string;
  source: 'local' | 'spotify' | 'deezer';
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  color: string;
}

export interface PlaybackState {
  currentTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  queue: string[];
  queueIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  isShuffle: boolean;
}

const MUSIC_KEY = 'presence_music_library';
const PLAYLISTS_KEY = 'presence_playlists';
const PLAYBACK_KEY = 'presence_playback_state';

// ---- Module-level audio state (persists across renders and screen navigation) ----
let globalSound: Audio.Sound | null = null;
let audioConfigured = false;
let loadGeneration = 0; // Guards against rapid track-change races

export const [MusicProvider, useMusic] = createContextHook(() => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    currentTrackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: -1,
    repeatMode: 'off',
    isShuffle: false,
  });

  // Refs so callbacks (especially the playback-status listener) always see the
  // latest values without needing to re-create the listener every render.
  const playbackRef = useRef(playbackState);
  const tracksRef = useRef(tracks);
  const isSeekingRef = useRef(false);
  const autoAdvanceRef = useRef<() => void>(() => {});

  useEffect(() => { playbackRef.current = playbackState; }, [playbackState]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // ---- Configure audio mode (once, on first mount) ----
  useEffect(() => {
    if (!audioConfigured) {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      }).catch(console.error);
      audioConfigured = true;
    }
  }, []);

  // ---- Android foreground service — keeps audio alive when app is in the background ----
  // Starts a sticky foreground notification whenever a track is playing so Android won't
  // suspend the process. Stops as soon as playback is paused or stopped.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const { PresenceDeviceControl } = NativeModules;
    if (!PresenceDeviceControl) return;

    if (playbackState.isPlaying && playbackState.currentTrackId) {
      const track = tracksRef.current.find(t => t.id === playbackState.currentTrackId);
      PresenceDeviceControl.startMusicForeground(
        track?.title ?? 'Now Playing',
        track?.artist ?? '',
      ).catch(console.warn);
    } else {
      PresenceDeviceControl.stopMusicForeground().catch(console.warn);
    }
  }, [playbackState.isPlaying, playbackState.currentTrackId]);

  // ---- Persistence: load from storage ----
  const libraryQuery = useQuery({
    queryKey: ['music-library'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(MUSIC_KEY);
      return stored ? JSON.parse(stored) : [];
    },
  });

  const playlistsQuery = useQuery({
    queryKey: ['music-playlists'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(PLAYLISTS_KEY);
      return stored ? JSON.parse(stored) : [];
    },
  });

  const playbackQuery = useQuery({
    queryKey: ['playback-state'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(PLAYBACK_KEY);
      return stored ? JSON.parse(stored) : null;
    },
  });

  useEffect(() => {
    if (libraryQuery.data) setTracks(libraryQuery.data);
  }, [libraryQuery.data]);

  useEffect(() => {
    if (playlistsQuery.data) setPlaylists(playlistsQuery.data);
  }, [playlistsQuery.data]);

  useEffect(() => {
    if (playbackQuery.data) {
      // Restore state but never auto-play on cold launch
      setPlaybackState({ ...playbackQuery.data, isPlaying: false, currentTime: 0 });
    }
  }, [playbackQuery.data]);

  // ---- Persistence: save helpers ----
  const saveLibraryMutation = useMutation({
    mutationFn: async (updatedTracks: Track[]) => {
      await AsyncStorage.setItem(MUSIC_KEY, JSON.stringify(updatedTracks));
      return updatedTracks;
    },
  });

  const savePlaylistsMutation = useMutation({
    mutationFn: async (updatedPlaylists: Playlist[]) => {
      await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(updatedPlaylists));
      return updatedPlaylists;
    },
  });

  // Fire-and-forget save for playback state (called frequently)
  const persistPlayback = useCallback((state: PlaybackState) => {
    AsyncStorage.setItem(PLAYBACK_KEY, JSON.stringify(state)).catch(console.error);
  }, []);

  // ---- Internal: load audio file and wire up status listener ----
  const loadAndPlayTrack = useCallback(async (uri: string, shouldPlay: boolean = true) => {
    loadGeneration++;
    const thisGen = loadGeneration;

    try {
      // Unload any previous sound
      if (globalSound) {
        try { await globalSound.unloadAsync(); } catch { /* ignore */ }
        globalSound = null;
      }

      // Bail out if a newer load was initiated while we were unloading
      if (thisGen !== loadGeneration) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay, progressUpdateIntervalMillis: 500 },
      );

      // Another load may have started while we awaited createAsync
      if (thisGen !== loadGeneration) {
        await sound.unloadAsync();
        return;
      }

      globalSound = sound;

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;

        // Update position (skip while user is dragging the seek bar)
        if (!isSeekingRef.current) {
          setPlaybackState(prev => ({
            ...prev,
            currentTime: Math.floor(status.positionMillis / 1000),
            duration: Math.floor((status.durationMillis ?? 0) / 1000),
            isPlaying: status.isPlaying,
          }));
        } else if (status.durationMillis) {
          // Always keep duration up-to-date
          setPlaybackState(prev => ({
            ...prev,
            duration: Math.floor(status.durationMillis! / 1000),
          }));
        }

        // Auto-advance when the track finishes
        if (status.didJustFinish && !status.isLooping) {
          autoAdvanceRef.current();
        }
      });

      console.log('[Music] Now playing:', uri);
    } catch (error) {
      console.error('[Music] Failed to load track:', error);
    }
  }, []); // Stable: uses only module-scope vars, refs, and setState

  // ---- Auto-advance logic (kept up-to-date via ref) ----
  // We assign to the ref on every render so the playback-status callback
  // always invokes the latest closure (which sees the latest state via refs).
  autoAdvanceRef.current = () => {
    const state = playbackRef.current;
    const allTracks = tracksRef.current;

    // Repeat-one: replay the same track
    if (state.repeatMode === 'one') {
      if (globalSound) {
        globalSound.replayAsync().catch(console.error);
      }
      return;
    }

    if (state.queue.length === 0) return;

    let nextIdx: number;
    if (state.isShuffle) {
      if (state.queue.length === 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * state.queue.length);
        } while (nextIdx === state.queueIndex);
      }
    } else {
      nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeatMode === 'all') {
          nextIdx = 0;
        } else {
          // Reached end of queue -- stop
          setPlaybackState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
          return;
        }
      }
    }

    const nextTrackId = state.queue[nextIdx];
    const track = allTracks.find(t => t.id === nextTrackId);
    if (track) {
      const newState: PlaybackState = {
        ...state,
        queueIndex: nextIdx,
        currentTrackId: nextTrackId,
        currentTime: 0,
        isPlaying: true,
      };
      setPlaybackState(newState);
      persistPlayback(newState);
      loadAndPlayTrack(track.uri, true);
    }
  };

  // ---- Scan device for local music ----
  const scanLocalMusic = useCallback(async () => {
    try {
      // Request media library permission
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          // User permanently denied — send them to settings
          const { Alert: A, Linking: L } = require('react-native');
          A.alert(
            'Music Permission Required',
            'PresenceOS needs access to your music library. Go to Settings → Apps → PresenceOS → Permissions → Media and enable Music.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Open Settings', onPress: () => L.openSettings() },
            ]
          );
        }
        console.warn('[Music] Media library permission denied');
        return;
      }

      // Fetch all audio assets — up to 2000
      let allAssets: MediaLibrary.Asset[] = [];
      let after: string | undefined;
      while (true) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.audio,
          first: 500,
          after,
        });
        allAssets = [...allAssets, ...page.assets];
        if (!page.hasNextPage) break;
        after = page.endCursor;
      }

      // If MediaType.audio returns nothing, fall back to all assets and filter by extension
      if (allAssets.length === 0) {
        const all = await MediaLibrary.getAssetsAsync({ first: 2000 });
        allAssets = all.assets.filter(a =>
          /\.(mp3|flac|ogg|wav|aac|m4a|opus|wma)$/i.test(a.filename)
        );
      }

      // Final fallback: direct filesystem scan (needed on de-Googled devices where
      // MediaStore is empty because no media scanner is running)
      let localTracks: Track[];
      if (allAssets.length === 0) {
        console.log('[Music] MediaStore empty — falling back to filesystem scan');
        const { default: FS } = await import('expo-file-system');
        const audioPaths: string[] = [];

        const scanDir = async (dir: string, depth = 0) => {
          if (depth > 6) return;
          try {
            const entries = await FS.readDirectoryAsync(dir);
            for (const entry of entries) {
              if (entry.startsWith('.')) continue;
              const full = dir + entry;
              if (/\.(mp3|flac|ogg|wav|aac|m4a|opus|wma|ape|alac)$/i.test(entry)) {
                audioPaths.push(full);
              } else {
                try {
                  const info = await FS.getInfoAsync(full);
                  if (info.isDirectory) await scanDir(full + '/', depth + 1);
                } catch {}
              }
            }
          } catch {}
        };

        // Discover external SD cards mounted under /storage/
        let extraRoots: string[] = [];
        try {
          const storageEntries = await FS.readDirectoryAsync('file:///storage/');
          for (const e of storageEntries) {
            if (e !== 'emulated' && e !== 'self') {
              extraRoots.push(`file:///storage/${e}/`);
            }
          }
        } catch {}

        const roots = [
          'file:///storage/emulated/0/Music/',
          'file:///storage/emulated/0/Download/',
          'file:///storage/emulated/0/Podcasts/',
          'file:///storage/emulated/0/Audiobooks/',
          'file:///storage/emulated/0/DCIM/',
          'file:///storage/emulated/0/',
          'file:///sdcard/Music/',
          'file:///sdcard/',
          ...extraRoots,
        ];
        // Deduplicate and scan
        const seen = new Set<string>();
        for (const root of roots) {
          if (!seen.has(root)) { seen.add(root); await scanDir(root); }
        }

        localTracks = [...new Set(audioPaths)].map(uri => ({
          id: uri,
          title: uri.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'Unknown',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          uri,
          source: 'local' as const,
        }));
      } else {
      const localTracks: Track[] = await Promise.all(
        allAssets.map(async asset => {
          let artist = 'Unknown Artist';
          let album = 'Unknown Album';
          let artwork: string | undefined;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false });
            artist = (info as any).artist || (info as any).albumTitle || 'Unknown Artist';
            album  = (info as any).album  || (info as any).albumTitle || 'Unknown Album';
            artwork = (info as any).artwork || (info as any).thumbnailUri || undefined;
          } catch { /* use defaults */ }
          return {
            id: asset.id,
            title: asset.filename.replace(/\.[^/.]+$/, ''),
            artist,
            album,
            duration: Math.floor(asset.duration || 0),
            uri: asset.uri,
            artwork,
            source: 'local' as const,
          };
        })
      );
      setTracks(localTracks);
      saveLibraryMutation.mutate(localTracks);
      console.log(`[Music] Scanned ${localTracks.length} local tracks`);
      return; // already set
      }

      setTracks(localTracks);
      saveLibraryMutation.mutate(localTracks);
      console.log(`[Music] Filesystem scan found ${localTracks.length} tracks`);
    } catch (error) {
      console.error('[Music] Scan failed:', error);
    }
  }, [saveLibraryMutation]);

  // ---- Playlist management ----
  const createPlaylist = useCallback(
    (name: string, trackIds: string[] = [], color: string = '#E85490') => {
      const newPlaylist: Playlist = {
        id: `pl_${Date.now()}`,
        name,
        trackIds,
        createdAt: Date.now(),
        color,
      };
      setPlaylists(prev => {
        const updated = [...prev, newPlaylist];
        savePlaylistsMutation.mutate(updated);
        return updated;
      });
      return newPlaylist;
    },
    [savePlaylistsMutation],
  );

  const addTrackToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      setPlaylists(prev => {
        const updated = prev.map(p =>
          p.id === playlistId && !p.trackIds.includes(trackId)
            ? { ...p, trackIds: [...p.trackIds, trackId] }
            : p,
        );
        savePlaylistsMutation.mutate(updated);
        return updated;
      });
    },
    [savePlaylistsMutation],
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      setPlaylists(prev => {
        const updated = prev.map(p =>
          p.id === playlistId
            ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) }
            : p,
        );
        savePlaylistsMutation.mutate(updated);
        return updated;
      });
    },
    [savePlaylistsMutation],
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists(prev => {
        const updated = prev.filter(p => p.id !== playlistId);
        savePlaylistsMutation.mutate(updated);
        return updated;
      });
    },
    [savePlaylistsMutation],
  );

  const getPlaylistTracks = useCallback(
    (playlistId: string) => {
      const playlist = playlists.find(p => p.id === playlistId);
      if (!playlist) return [];
      return tracks.filter(t => playlist.trackIds.includes(t.id));
    },
    [playlists, tracks],
  );

  // ---- Playback controls ----

  /** Start playing a track. Optionally set the queue. */
  const setCurrentTrack = useCallback(
    (trackId: string, queue: string[] = []) => {
      const track = tracksRef.current.find(t => t.id === trackId);
      if (!track) return;

      const newQueue = queue.length > 0 ? queue : [trackId];
      const queueIndex = Math.max(newQueue.indexOf(trackId), 0);

      const newState: PlaybackState = {
        ...playbackRef.current,
        currentTrackId: trackId,
        queue: newQueue,
        queueIndex,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
      };
      setPlaybackState(newState);
      persistPlayback(newState);
      loadAndPlayTrack(track.uri, true);
    },
    [loadAndPlayTrack, persistPlayback],
  );

  /** Toggle play / pause. If no sound is loaded, reload the current track. */
  const togglePlayPause = useCallback(async () => {
    if (!globalSound) {
      const state = playbackRef.current;
      const track = tracksRef.current.find(t => t.id === state.currentTrackId);
      if (track) {
        setPlaybackState(prev => ({ ...prev, isPlaying: true }));
        await loadAndPlayTrack(track.uri, true);
      }
      return;
    }

    try {
      const status = await globalSound.getStatusAsync();
      if (!status.isLoaded) return;

      if (status.isPlaying) {
        await globalSound.pauseAsync();
        setPlaybackState(prev => {
          const ns = { ...prev, isPlaying: false };
          persistPlayback(ns);
          return ns;
        });
      } else {
        await globalSound.playAsync();
        setPlaybackState(prev => {
          const ns = { ...prev, isPlaying: true };
          persistPlayback(ns);
          return ns;
        });
      }
    } catch (error) {
      console.error('[Music] Toggle play/pause failed:', error);
    }
  }, [loadAndPlayTrack, persistPlayback]);

  /** Seek to a position in seconds. */
  const seekTo = useCallback(async (seconds: number) => {
    if (!globalSound) return;
    try {
      isSeekingRef.current = true;
      await globalSound.setPositionAsync(Math.floor(seconds * 1000));
      setPlaybackState(prev => ({ ...prev, currentTime: Math.floor(seconds) }));
      // Brief delay before re-enabling status-driven position updates so the
      // slider doesn't snap back to the old position.
      setTimeout(() => { isSeekingRef.current = false; }, 300);
    } catch (error) {
      console.error('[Music] Seek failed:', error);
      isSeekingRef.current = false;
    }
  }, []);

  /** Advance to the next track. */
  const nextTrack = useCallback(() => {
    const state = playbackRef.current;
    if (state.queue.length === 0) return;

    let nextIdx: number;
    if (state.isShuffle) {
      if (state.queue.length === 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * state.queue.length);
        } while (nextIdx === state.queueIndex);
      }
    } else {
      nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeatMode === 'all') {
          nextIdx = 0;
        } else {
          return; // nothing to play
        }
      }
    }

    const nextTrackId = state.queue[nextIdx];
    const track = tracksRef.current.find(t => t.id === nextTrackId);
    if (track) {
      const newState: PlaybackState = {
        ...state,
        queueIndex: nextIdx,
        currentTrackId: nextTrackId,
        currentTime: 0,
        isPlaying: true,
      };
      setPlaybackState(newState);
      persistPlayback(newState);
      loadAndPlayTrack(track.uri, true);
    }
  }, [loadAndPlayTrack, persistPlayback]);

  /** Go to the previous track (or restart current if >3 s in). */
  const previousTrack = useCallback(() => {
    const state = playbackRef.current;
    if (state.queue.length === 0) return;

    // If more than 3 seconds into the track, restart it instead
    if (state.currentTime > 3) {
      seekTo(0);
      return;
    }

    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) {
      if (state.repeatMode === 'all') {
        prevIdx = state.queue.length - 1;
      } else {
        seekTo(0);
        return;
      }
    }

    const prevTrackId = state.queue[prevIdx];
    const track = tracksRef.current.find(t => t.id === prevTrackId);
    if (track) {
      const newState: PlaybackState = {
        ...state,
        queueIndex: prevIdx,
        currentTrackId: prevTrackId,
        currentTime: 0,
        isPlaying: true,
      };
      setPlaybackState(newState);
      persistPlayback(newState);
      loadAndPlayTrack(track.uri, true);
    }
  }, [loadAndPlayTrack, seekTo, persistPlayback]);

  const setRepeatMode = useCallback(
    (mode: 'off' | 'one' | 'all') => {
      setPlaybackState(prev => {
        const ns = { ...prev, repeatMode: mode };
        persistPlayback(ns);
        return ns;
      });
    },
    [persistPlayback],
  );

  const toggleShuffle = useCallback(() => {
    setPlaybackState(prev => {
      const ns = { ...prev, isShuffle: !prev.isShuffle };
      persistPlayback(ns);
      return ns;
    });
  }, [persistPlayback]);

  const getCurrentTrack = useCallback(() => {
    return tracks.find(t => t.id === playbackState.currentTrackId) || null;
  }, [tracks, playbackState.currentTrackId]);

  return useMemo(() => ({
    // Library
    tracks,
    playlists,
    scanLocalMusic,
    isLoadingLibrary: libraryQuery.isLoading,

    // Playlist management
    createPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    deletePlaylist,
    getPlaylistTracks,

    // Playback
    playbackState,
    getCurrentTrack,
    setCurrentTrack,
    togglePlayPause,
    seekTo,
    nextTrack,
    previousTrack,
    setRepeatMode,
    toggleShuffle,
  }), [ // eslint-disable-line react-hooks/exhaustive-deps
    tracks, playlists, scanLocalMusic, libraryQuery.isLoading,
    createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist, deletePlaylist, getPlaylistTracks,
    playbackState, getCurrentTrack, setCurrentTrack, togglePlayPause, seekTo,
    nextTrack, previousTrack, setRepeatMode, toggleShuffle,
  ]);
});
