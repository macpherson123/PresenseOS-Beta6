/**
 * presenceOS — Files
 * Full file manager. Opens directly to Internal Storage.
 * Handles Android API 30+ MANAGE_EXTERNAL_STORAGE requirement.
 * Uses only expo-file-system + RN Share (no expo-sharing / DocumentPicker).
 * Long-press to select; Copy / Cut / Paste; Create / Rename / Delete folders.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Alert, Modal, ActivityIndicator, Share, Platform,
  NativeModules, PermissionsAndroid, Animated,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, ChevronRight, Folder, FileText, Image as ImageIcon,
  Film, Music, Archive, File as FileIcon, Trash2, Share2, Plus,
  Home, Search, X, Copy, Scissors, FolderPlus,
  RefreshCw, Check, MoreVertical, HardDrive,
} from 'lucide-react-native';

const { PresenceDeviceControl } = NativeModules;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FSItem {
  name:    string;
  uri:     string;
  isDir:   boolean;
  size:    number;
  modTime: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (!b || b <= 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function getIcon(item: FSItem) {
  if (item.isDir) return Folder;
  const n = item.name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/.test(n)) return ImageIcon;
  if (/\.(mp4|mkv|avi|mov|webm)$/.test(n))      return Film;
  if (/\.(mp3|flac|ogg|wav|aac)$/.test(n))      return Music;
  if (/\.(zip|rar|tar|gz|7z)$/.test(n))         return Archive;
  if (/\.(txt|md|json|xml|html|htm|csv|log)$/.test(n)) return FileText;
  return FileIcon;
}

function getIconColor(item: FSItem, accent: string) {
  if (item.isDir) return '#FFA726';
  const n = item.name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/.test(n)) return '#26C6DA';
  if (/\.(mp4|mkv|avi|mov|webm)$/.test(n))      return '#EC407A';
  if (/\.(mp3|flac|ogg|wav|aac)$/.test(n))      return '#AB47BC';
  if (/\.(zip|rar|tar|gz|7z)$/.test(n))         return '#FF7043';
  if (/\.(txt|md|json|xml|html?)$/.test(n))     return '#42A5F5';
  return accent;
}

// Root directories for the sidebar
const ROOT_DIRS = [
  { label: 'Internal',   icon: HardDrive, uri: 'file:///storage/emulated/0/' },
  { label: 'Downloads',  icon: FileText,  uri: 'file:///storage/emulated/0/Download/' },
  { label: 'Pictures',   icon: ImageIcon, uri: 'file:///storage/emulated/0/Pictures/' },
  { label: 'DCIM',       icon: Film,      uri: 'file:///storage/emulated/0/DCIM/' },
  { label: 'Documents',  icon: FileText,  uri: 'file:///storage/emulated/0/Documents/' },
  { label: 'Music',      icon: Music,     uri: 'file:///storage/emulated/0/Music/' },
  { label: 'SD Card',    icon: HardDrive, uri: 'file:///storage/sdcard1/' },
  { label: 'USB',        icon: HardDrive, uri: 'file:///storage/usb/' },
  { label: 'App Data',   icon: Folder,    uri: FileSystem.documentDirectory ?? '' },
];

// Start directly in Internal Storage
const INTERNAL = 'file:///storage/emulated/0/';
const FALLBACK = FileSystem.documentDirectory ?? 'file:///data/';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FilesScreen() {
  const router = useRouter();
  const { activeTheme: t, settings, uiTokens: s } = useSettings();
  const fadeIn = useRef(new Animated.Value(0)).current;

  const [currentUri, setCurrentUri]       = useState(INTERNAL);
  const [breadcrumbs, setBreadcrumbs]     = useState<{ label: string; uri: string }[]>([
    { label: 'Internal', uri: INTERNAL },
  ]);
  const [items, setItems]                 = useState<FSItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [permOk, setPermOk]               = useState(false);

  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode]       = useState(false);
  const [clipboard, setClipboard]         = useState<{ uris: string[]; mode: 'copy' | 'cut' } | null>(null);

  const [search, setSearch]               = useState('');
  const [showSearch, setShowSearch]       = useState(false);

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRename, setShowRename]       = useState<FSItem | null>(null);
  const [renameTo, setRenameTo]           = useState('');
  const [previewText, setPreviewText]     = useState<{ name: string; text: string } | null>(null);

  // ── Permissions ───────────────────────────────────────────────────────────
  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') { setPermOk(true); return true; }
    try {
      const apiLevel = parseInt(Platform.Version as string, 10);

      if (apiLevel >= 30) {
        // Android 11+ — request MANAGE_EXTERNAL_STORAGE via native module if available
        if (PresenceDeviceControl?.hasManageStoragePermission) {
          try {
            const has = await PresenceDeviceControl.hasManageStoragePermission();
            if (!has) {
              if (PresenceDeviceControl?.requestManageStoragePermission) {
                await PresenceDeviceControl.requestManageStoragePermission();
              } else if (PresenceDeviceControl?.openSpecialAccess) {
                // Open "All Files Access" settings page
                await PresenceDeviceControl.openSpecialAccess();
              } else {
                // Fallback: open app settings
                const { Linking: L } = require('react-native');
                L.openSettings();
              }
              // Re-check after the user returns
              const hasNow = await PresenceDeviceControl.hasManageStoragePermission().catch(() => true);
              setPermOk(hasNow);
              return hasNow;
            }
          } catch { /* native module not available — proceed optimistically */ }
        }
        // Optimistically proceed — actual errors handled in loadDir
        setPermOk(true);
        return true;
      }

      // API < 30 — request legacy storage permissions
      const { PermissionsAndroid: PA } = require('react-native');
      const granted = await PA.requestMultiple([
        PA.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PA.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);
      const ok = Object.values(granted).every((v: any) => v === PA.RESULTS.GRANTED);
      setPermOk(ok);
      if (!ok) {
        Alert.alert(
          'Storage Permission',
          'PresenceOS needs storage access to browse files.',
          [
            { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
            { text: 'Open Settings', onPress: () => { const { Linking: L } = require('react-native'); L.openSettings(); } },
          ]
        );
      }
      return ok;
    } catch {
      setPermOk(true); // best-effort
      return true;
    }
  }, [router]);

  // ── Load directory ────────────────────────────────────────────────────────
  const loadDir = useCallback(async (uri: string, isRetry = false) => {
    setLoading(true);
    setSelected(new Set());
    setSelectMode(false);
    setSearch('');
    setShowSearch(false);
    try {
      // Rich entries come from the updated native listDirectory which returns
      // {name, isDir, size, modTime}[]. If that method returns strings (old
      // native build) or isn't present, we fall through and resolve metadata
      // per-entry via expo-file-system.
      let richEntries: Array<{ name: string; isDir?: boolean; size?: number; modTime?: number }> | null = null;
      let entries: string[] = [];

      if (PresenceDeviceControl?.listDirectory) {
        try {
          const rawPath = uri.replace('file://', '');
          const result: any = await PresenceDeviceControl.listDirectory(rawPath);
          setPermOk(true);
          if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
            richEntries = result;
          } else if (Array.isArray(result)) {
            entries = result;
          }
        } catch (nativeErr: any) {
          const code = nativeErr?.code ?? '';
          const msg  = nativeErr?.message ?? '';
          if (code === 'E_ACCESS' || msg.includes('Permission') || msg.includes('EACCES') || msg.includes('denied')) {
            setPermOk(false);
            if (!isRetry) {
              if (PresenceDeviceControl?.requestManageStoragePermission) {
                await PresenceDeviceControl.requestManageStoragePermission().catch(() => {});
              } else if (PresenceDeviceControl?.openSpecialAccess) {
                await PresenceDeviceControl.openSpecialAccess('all_files').catch(() => {});
              }
              setLoading(false);
              setTimeout(() => loadDir(uri, true), 1500);
              return;
            }
            setItems([]); setLoading(false); return;
          }
          if (code === 'E_NOT_FOUND' || code === 'E_NOT_DIR') {
            setItems([]); setLoading(false); return;
          }
          // Non-permission error — fall through to expo-file-system
          entries = [];
        }
      }

      // Fallback: expo-file-system (works for app sandbox + sometimes external)
      if (!richEntries && entries.length === 0 && !PresenceDeviceControl?.listDirectory) {
        try {
          entries = await FileSystem.readDirectoryAsync(uri);
          setPermOk(true);
        } catch (readErr: any) {
          const msg = readErr?.message ?? '';
          if ((msg.includes('Permission') || msg.includes('EACCES')) && !isRetry) {
            const fallback = FileSystem.documentDirectory ?? 'file:///data/';
            setCurrentUri(fallback);
            setBreadcrumbs([{ label: 'App Data', uri: fallback }]);
            setLoading(false);
            loadDir(fallback, true);
            return;
          }
          setItems([]); setLoading(false); return;
        }
      }

      // Build final item list — rich path avoids N+1 getInfoAsync calls.
      let resolved: FSItem[];
      if (richEntries) {
        resolved = richEntries.map(e => ({
          name:    e.name,
          uri:     uri.endsWith('/') ? uri + e.name : uri + '/' + e.name,
          isDir:   !!e.isDir,
          size:    e.size ?? 0,
          modTime: e.modTime ? new Date(e.modTime).toLocaleDateString() : null,
        }));
      } else {
        resolved = await Promise.all(
          entries.map(async name => {
            const fullUri = uri.endsWith('/') ? uri + name : uri + '/' + name;
            try {
              const info = await FileSystem.getInfoAsync(fullUri, { size: true });
              return {
                name,
                uri: fullUri,
                isDir: info.isDirectory ?? false,
                size: (info as any).size ?? 0,
                modTime: (info as any).modificationTime
                  ? new Date((info as any).modificationTime * 1000).toLocaleDateString()
                  : null,
              };
            } catch {
              return { name, uri: fullUri, isDir: false, size: 0, modTime: null };
            }
          }),
        );
      }

      // Sort: folders first, then alphabetical
      resolved.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setItems(resolved);
    } catch (e: any) {
      if (e?.message?.includes('Permission')) {
        setPermOk(false);
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions().then(ok => {
      if (ok) loadDir(INTERNAL);
    });
    Animated.timing(fadeIn, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []); // eslint-disable-line

  // Re-check permissions when returning from settings
  useEffect(() => {
    const sub = require('react-native').AppState.addEventListener('change', (state: string) => {
      if (state === 'active' && !permOk) {
        checkPermissions().then(ok => {
          if (ok) loadDir(currentUri);
        });
      }
    });
    return () => sub.remove();
  }, [permOk, currentUri, checkPermissions, loadDir]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((item: FSItem) => {
    if (!item.isDir) {
      openFile(item);
      return;
    }
    const newCrumbs = [...breadcrumbs, { label: item.name, uri: item.uri }];
    setBreadcrumbs(newCrumbs);
    setCurrentUri(item.uri);
    loadDir(item.uri);
  }, [breadcrumbs, loadDir]);

  const navigateToCrumb = useCallback((idx: number) => {
    const crumb = breadcrumbs[idx];
    setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
    setCurrentUri(crumb.uri);
    loadDir(crumb.uri);
  }, [breadcrumbs, loadDir]);

  const goHome = useCallback(() => {
    setBreadcrumbs([{ label: 'Internal', uri: INTERNAL }]);
    setCurrentUri(INTERNAL);
    loadDir(INTERNAL);
  }, [loadDir]);

  const navigateToRoot = useCallback((root: typeof ROOT_DIRS[number]) => {
    setBreadcrumbs([{ label: root.label, uri: root.uri }]);
    setCurrentUri(root.uri);
    loadDir(root.uri);
  }, [loadDir]);

  // ── File actions ──────────────────────────────────────────────────────────
  const openFile = useCallback(async (item: FSItem) => {
    const n = item.name.toLowerCase();
    // Media viewer for images and videos
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/.test(n) || /\.(mp4|mkv|avi|mov|webm|3gp)$/.test(n)) {
      // Gather all media files in current dir for swiping
      const mediaItems = items.filter(i => {
        const in_ = i.name.toLowerCase();
        return /\.(jpg|jpeg|png|gif|webp|bmp|mp4|mkv|avi|mov|webm|3gp)$/.test(in_);
      });
      const startIdx = mediaItems.findIndex(i => i.uri === item.uri);
      router.push(`/media-viewer?uris=${encodeURIComponent(JSON.stringify(mediaItems.map(i => ({ uri: i.uri, name: i.name }))))}&index=${Math.max(0, startIdx)}` as never);
      return;
    }
    // Text preview
    if (/\.(txt|md|json|xml|html|htm|csv|log|js|ts|py)$/.test(n)) {
      try {
        const text = await FileSystem.readAsStringAsync(item.uri, { encoding: FileSystem.EncodingType.UTF8 });
        setPreviewText({ name: item.name, text: text.slice(0, 4000) });
      } catch {
        Alert.alert('Cannot preview', 'File cannot be read as text.');
      }
      return;
    }
    // Share / open
    try {
      await Share.share({ url: item.uri, title: item.name });
    } catch {
      Alert.alert('Cannot open', 'No app available to open this file.');
    }
  }, [items, router]);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const newUri = currentUri.endsWith('/') ? currentUri + name : currentUri + '/' + name;
    try {
      // Prefer native module which has MANAGE_EXTERNAL_STORAGE access
      if (PresenceDeviceControl?.createDirectory) {
        await PresenceDeviceControl.createDirectory(newUri.replace('file://', ''));
      } else {
        await FileSystem.makeDirectoryAsync(newUri, { intermediates: false });
      }
      setShowNewFolder(false);
      setNewFolderName('');
      loadDir(currentUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      // If expo-file-system fails on external storage, try via native module shell
      if (PresenceDeviceControl?.executeShellCommand) {
        try {
          await PresenceDeviceControl.executeShellCommand(`mkdir -p "${newUri.replace('file://', '')}"`);
          setShowNewFolder(false);
          setNewFolderName('');
          loadDir(currentUri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        } catch {}
      }
      Alert.alert('Error', `Could not create folder${e?.message ? ': ' + e.message : '. Check storage permission in Settings.'}`);
    }
  }, [currentUri, newFolderName, loadDir]);

  const deleteItems = useCallback(async (uris: string[]) => {
    Alert.alert(`Delete ${uris.length} item${uris.length > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          for (const uri of uris) {
            try {
              if (PresenceDeviceControl?.deleteFile) {
                await PresenceDeviceControl.deleteFile(uri.replace('file://', ''));
              } else {
                await FileSystem.deleteAsync(uri, { idempotent: true });
              }
            } catch {}
          }
          setSelected(new Set());
          setSelectMode(false);
          loadDir(currentUri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }, [currentUri, loadDir]);

  const renameItem = useCallback(async () => {
    if (!showRename || !renameTo.trim()) return;
    const dir = showRename.uri.substring(0, showRename.uri.lastIndexOf('/') + 1);
    const newUri = dir + renameTo.trim();
    try {
      await FileSystem.moveAsync({ from: showRename.uri, to: newUri });
      setShowRename(null);
      setRenameTo('');
      loadDir(currentUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not rename item.');
    }
  }, [showRename, renameTo, currentUri, loadDir]);

  const copySelected = useCallback((mode: 'copy' | 'cut') => {
    setClipboard({ uris: Array.from(selected), mode });
    setSelectMode(false);
    setSelected(new Set());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selected]);

  const paste = useCallback(async () => {
    if (!clipboard) return;
    for (const uri of clipboard.uris) {
      const name = uri.split('/').pop()!;
      const dest = currentUri.endsWith('/') ? currentUri + name : currentUri + '/' + name;
      try {
        if (clipboard.mode === 'copy') {
          await FileSystem.copyAsync({ from: uri, to: dest });
        } else {
          await FileSystem.moveAsync({ from: uri, to: dest });
        }
      } catch (e: any) {
        Alert.alert('Error', `Could not paste "${name}": ${e.message}`);
      }
    }
    if (clipboard.mode === 'cut') setClipboard(null);
    loadDir(currentUri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [clipboard, currentUri, loadDir]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((uri: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  const longPress = useCallback((item: FSItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelected(new Set([item.uri]));
  }, []);

  // ── Filtered items ────────────────────────────────────────────────────────
  const displayed = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const radius = s.radius;

  // ── Zip / Unzip ────────────────────────────────────────────────────────────
  const handleZip = useCallback(async (item: FSItem) => {
    Alert.alert(
      'Zip File',
      `Zip "${item.name}"? A .zip will be created in the same folder.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Zip',
          onPress: async () => {
            try {
              if (PresenceDeviceControl?.zipFile) {
                await PresenceDeviceControl.zipFile(item.uri);
                loadDir(currentUri);
              } else {
                Alert.alert('Not available', 'Zip requires the PresenceDeviceControl native module.');
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to zip');
            }
          },
        },
      ]
    );
  }, [currentUri]);

  const handleUnzip = useCallback(async (item: FSItem) => {
    Alert.alert(
      'Unzip',
      `Extract "${item.name}" here?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Extract',
          onPress: async () => {
            try {
              if (PresenceDeviceControl?.unzipFile) {
                await PresenceDeviceControl.unzipFile(item.uri, currentUri);
                loadDir(currentUri);
              } else {
                // Fallback: use expo-file-system unzip if available
                const dest = currentUri;
                await (FileSystem as any).unzipAsync?.(item.uri, dest);
                loadDir(currentUri);
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to unzip');
            }
          },
        },
      ]
    );
  }, [currentUri]);


  return (
    <View style={[F.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <Animated.View style={[{ flex: 1 }, { opacity: fadeIn }]}>

        {/* ── Header ── */}
        <View style={F.header}>
          
          <Text style={[F.headerTitle, { color: t.text }]}>Files</Text>
          <View style={F.headerRight}>
            <Pressable hitSlop={8} onPress={() => setShowSearch(!showSearch)}>
              <Search size={18} color={t.textMuted} strokeWidth={1.6} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => loadDir(currentUri)}>
              <RefreshCw size={18} color={t.textMuted} strokeWidth={1.6} />
            </Pressable>
          </View>
        </View>

        {/* Permission banner */}
        {!permOk && (
          <Pressable
            style={[F.permBanner, { backgroundColor: '#F97316' + '18', borderColor: '#F97316' + '40' }]}
            onPress={() => {
              const { Linking: L } = require('react-native');
              L.openSettings();
            }}
          >
            <Text style={{ color: '#F97316', fontSize: 12, fontWeight: '600', flex: 1 }}>
              Storage access needed — tap to open Settings → Permissions → Files
            </Text>
            <ChevronRight size={14} color={'#F97316'} />
          </Pressable>
        )}

        {/* Search bar */}
        {showSearch && (
          <View style={[F.searchBar, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}>
            <Search size={14} color={t.textMuted} />
            <TextInput value={search} onChangeText={setSearch}
              placeholder="Search this folder..." placeholderTextColor={t.textMuted}
              style={[F.searchInput, { color: t.text }]} autoFocus />
            {search ? <Pressable hitSlop={8} onPress={() => setSearch('')}><X size={14} color={t.textMuted} /></Pressable> : null}
          </View>
        )}

        {/* ── Location tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={F.locationScroll} contentContainerStyle={F.locationRow}>
          {ROOT_DIRS.map(r => {
            const active = currentUri.startsWith(r.uri);
            const Icon = r.icon;
            return (
              <Pressable key={r.uri}
                style={[F.locationChip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accentDim : 'transparent' }]}
                onPress={() => navigateToRoot(r)}>
                <Icon size={12} color={active ? t.accent : t.textMuted} strokeWidth={1.6} />
                <Text style={[F.locationLabel, { color: active ? t.accent : t.textMuted }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Breadcrumbs — only show when inside a subdirectory */}
        {breadcrumbs.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={F.crumbRow}>
          <Pressable hitSlop={6} onPress={goHome}>
            <Home size={13} color={t.textMuted} />
          </Pressable>
          {breadcrumbs.map((c, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={12} color={t.textMuted + '60'} />
              <Pressable onPress={() => navigateToCrumb(i)} hitSlop={4}>
                <Text style={[F.crumbText, { color: i === breadcrumbs.length - 1 ? t.text : t.textMuted }]}>{c.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </ScrollView>}

        {/* ── Selection toolbar ── */}
        {selectMode && (
          <View style={[F.selToolbar, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[F.selCount, { color: t.accent }]}>{selected.size} selected</Text>
            <Pressable hitSlop={8} onPress={() => copySelected('copy')}><Copy size={18} color={t.textMuted} /></Pressable>
            <Pressable hitSlop={8} onPress={() => copySelected('cut')}><Scissors size={18} color={t.textMuted} /></Pressable>
            {selected.size === 1 && (
              <Pressable hitSlop={8} onPress={() => {
                const item = items.find(i => selected.has(i.uri));
                if (item) { setShowRename(item); setRenameTo(item.name); }
              }}><MoreVertical size={18} color={t.textMuted} /></Pressable>
            )}
            <Pressable hitSlop={8} onPress={() => deleteItems(Array.from(selected))}>
              <Trash2 size={18} color={t.red} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => { setSelectMode(false); setSelected(new Set()); }}>
              <X size={18} color={t.textMuted} />
            </Pressable>
          </View>
        )}

        {/* ── Paste bar ── */}
        {clipboard && !selectMode && (
          <Pressable style={[F.pasteBar, { backgroundColor: t.accentDim, borderColor: t.accent + '40' }]} onPress={paste}>
            <Text style={[F.pasteText, { color: t.accent }]}>
              {clipboard.mode === 'copy' ? 'Copy' : 'Move'} {clipboard.uris.length} item{clipboard.uris.length > 1 ? 's' : ''} here
            </Text>
            <Text style={[F.pasteTap, { color: t.accent + '80' }]}>tap to paste</Text>
            <Pressable hitSlop={8} onPress={() => setClipboard(null)}><X size={14} color={t.accent} /></Pressable>
          </Pressable>
        )}

        {/* ── File list ── */}
        {loading ? (
          <View style={F.centered}>
            <ActivityIndicator color={t.accent} size="large" />
            <Text style={[F.loadingText, { color: t.textMuted }]}>Reading folder…</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[F.listContent, displayed.length === 0 && { flexGrow: 1 }]} showsVerticalScrollIndicator={false}>
            {displayed.length === 0 && (
              <View style={F.empty}>
                <Folder size={44} color={t.textMuted + '40'} strokeWidth={1} />
                <Text style={[F.emptyText, { color: t.textMuted }]}>
                  {search ? 'No matches' : 'Folder is empty'}
                </Text>
              </View>
            )}
            {displayed.map(item => {
              const Icon  = getIcon(item);
              const color = getIconColor(item, t.accent);
              const isSel = selected.has(item.uri);
              return (
                <Pressable
                  key={item.uri}
                  onPress={() => selectMode ? toggleSelect(item.uri) : navigate(item)}
                  onLongPress={() => longPress(item)}
                  style={[
                    F.row, { borderRadius: radius, borderColor: t.border },
                    isSel && { backgroundColor: t.accentDim + '60', borderColor: t.accent + '60' },
                  ]}
                >
                  <View style={[F.iconWrap, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                    <Icon size={18} color={color} strokeWidth={1.6} />
                  </View>
                  <View style={F.meta}>
                    <Text style={[F.name, { color: t.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[F.sub, { color: t.textMuted }]}>
                      {item.isDir ? 'Folder' : formatBytes(item.size)}
                      {item.modTime ? `  ·  ${item.modTime}` : ''}
                    </Text>
                  </View>
                  {isSel
                    ? <View style={[F.selDot, { backgroundColor: t.accent }]}><Check size={12} color={t.bg} /></View>
                    : item.isDir
                    ? <ChevronRight size={14} color={t.textMuted + '60'} />
                    : <Pressable hitSlop={10} onPress={() => Share.share({ url: item.uri, title: item.name })}><Share2 size={14} color={t.textMuted + '60'} /></Pressable>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* New folder FAB */}
        {!selectMode && (
          <Pressable
            style={[F.fab, { backgroundColor: t.accent }]}
            onPress={() => { setShowNewFolder(true); setNewFolderName(''); }}
          >
            <FolderPlus size={22} color={t.bg} strokeWidth={1.8} />
          </Pressable>
        )}
      </Animated.View>

      {/* ── New folder modal ── */}
      <Modal visible={showNewFolder} transparent animationType="fade" onRequestClose={() => setShowNewFolder(false)}>
        <Pressable style={F.modalBg} onPress={() => setShowNewFolder(false)}>
          <Pressable style={[F.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[F.modalTitle, { color: t.text }]}>New Folder</Text>
            <TextInput value={newFolderName} onChangeText={setNewFolderName}
              placeholder="Folder name" placeholderTextColor={t.textMuted}
              style={[F.modalInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
              autoFocus returnKeyType="done" onSubmitEditing={createFolder} />
            <View style={F.modalBtns}>
              <Pressable style={[F.modalBtn, { borderColor: t.border }]} onPress={() => setShowNewFolder(false)}>
                <Text style={{ color: t.textMuted, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable style={[F.modalBtn, { backgroundColor: t.accent }]} onPress={createFolder}>
                <Text style={{ color: t.bg, fontSize: 15, fontWeight: '600' }}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Rename modal ── */}
      <Modal visible={!!showRename} transparent animationType="fade" onRequestClose={() => setShowRename(null)}>
        <Pressable style={F.modalBg} onPress={() => setShowRename(null)}>
          <Pressable style={[F.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[F.modalTitle, { color: t.text }]}>Rename</Text>
            <TextInput value={renameTo} onChangeText={setRenameTo}
              style={[F.modalInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
              autoFocus returnKeyType="done" onSubmitEditing={renameItem} />
            <View style={F.modalBtns}>
              <Pressable style={[F.modalBtn, { borderColor: t.border }]} onPress={() => setShowRename(null)}>
                <Text style={{ color: t.textMuted, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable style={[F.modalBtn, { backgroundColor: t.accent }]} onPress={renameItem}>
                <Text style={{ color: t.bg, fontSize: 15, fontWeight: '600' }}>Rename</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Text preview modal ── */}
      <Modal visible={!!previewText} animationType="slide" onRequestClose={() => setPreviewText(null)}>
        <View style={[F.previewContainer, { backgroundColor: t.bg }]}>
          <View style={[F.previewHeader, { borderBottomColor: t.border }]}>
            <Pressable onPress={() => setPreviewText(null)} hitSlop={8}>
              <X size={20} color={t.text} />
            </Pressable>
            <Text style={[F.previewName, { color: t.text }]} numberOfLines={1}>{previewText?.name}</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView contentContainerStyle={F.previewContent}>
            <Text style={[F.previewText, { color: t.text }]}>{previewText?.text}</Text>
          </ScrollView>
        </View>
      </Modal>
    <BottomBackBar />
    </View>
  );
}

const F = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 13 },
  backBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 18, fontWeight: '600' as const },
  headerRight:    { flexDirection: 'row', gap: 18, alignItems: 'center' },
  permBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },

  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: 14 },

  locationScroll: { maxHeight: 42 },
  locationRow:    { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 6 },
  locationChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  locationLabel:  { fontSize: 11, fontWeight: '600' as const },

  crumbRow:       { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumbText:      { fontSize: 12 },

  selToolbar:     { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1 },
  selCount:       { fontSize: 13, fontWeight: '600' as const, flex: 1 },

  pasteBar:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  pasteText:      { flex: 1, fontSize: 13, fontWeight: '600' as const },
  pasteTap:       { fontSize: 11 },

  listContent:    { paddingHorizontal: 16, paddingBottom: 100, gap: 2 },
  row:            { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  iconWrap:       { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  meta:           { flex: 1 },
  name:           { fontSize: 14, fontWeight: '500' as const },
  sub:            { fontSize: 11, marginTop: 2 },
  selDot:         { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText:    { fontSize: 14 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 200 },
  emptyText:      { fontSize: 15 },

  fab:            { position: 'absolute', bottom: 28, right: 24, width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },

  // Modals
  modalBg:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  modalCard:      { width: '100%' as any, borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  modalTitle:     { fontSize: 17, fontWeight: '600' as const },
  modalInput:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalBtns:      { flexDirection: 'row', gap: 12 },
  modalBtn:       { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },

  // Preview
  previewContainer: { flex: 1 },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  previewName:    { flex: 1, fontSize: 15, fontWeight: '500' as const },
  previewContent: { padding: 20 },
  previewText:    { fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
