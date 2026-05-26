import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, Alert,
  NativeModules, FlatList, ScrollView,
} from 'react-native';
import PresenceKeyboard from '@/components/PresenceKeyboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '@/contexts/SettingsContext';
import { WIKIPEDIA_REDIRECTS } from '@/constants/philosophy';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import {
  ChevronLeft, RefreshCw, Lock, ArrowLeft, ArrowRight, X, Search,
  BookOpen, Shield, Clock, Download, Trash2, FileText, Image, Film,
  Music, Archive, File as FileIcon, CheckCircle, AlertCircle, Loader,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { PresenceDeviceControl } = NativeModules;

let WebView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').default;
}

let ScreenOrientation: any = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch { /* not installed yet */ }

const BLOCKED_DOMAINS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'snapchat.com', 'reddit.com', 'linkedin.com', 'pinterest.com', 'tumblr.com',
  'threads.net', 'mastodon.social', 'youtube.com', 'twitch.tv',
];

const LOGIN_PATTERNS = [
  'login', 'signin', 'sign-in', 'sign_in', 'auth', 'oauth', 'sso',
  'accounts.google', 'appleid.apple',
];

const QUICK_LINKS = [
  { name: 'Wikipedia', url: 'https://wikipedia.org', color: '#636363' },
  { name: 'Weather', url: 'https://weather.com', color: '#5B8DEF' },
  { name: 'News', url: 'https://apnews.com', color: '#E85454' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', color: '#DE5833' },
];

const DOWNLOAD_EXTENSIONS = [
  '.apk', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.mkv', '.avi', '.mov', '.flac', '.wav', '.ogg',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
  '.exe', '.dmg', '.deb', '.rpm', '.bin', '.iso',
  '.csv', '.json', '.xml', '.txt',
];

function getRandomWikipedia() {
  return WIKIPEDIA_REDIRECTS[Math.floor(Math.random() * WIKIPEDIA_REDIRECTS.length)];
}

function extractFileName(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split('/').pop() || '';
    if (name && name.includes('.')) return decodeURIComponent(name);
  } catch {}
  return 'download_' + Date.now();
}

function isDownloadUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return DOWNLOAD_EXTENSIONS.some(ext => lower.includes(ext));
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(lower)) return Image;
  if (/\.(mp4|mkv|avi|mov|webm)$/.test(lower)) return Film;
  if (/\.(mp3|flac|wav|ogg|aac|m4a)$/.test(lower)) return Music;
  if (/\.(zip|rar|7z|tar|gz|bz2)$/.test(lower)) return Archive;
  if (/\.(doc|docx|pdf|txt|xls|xlsx|ppt|pptx|csv)$/.test(lower)) return FileText;
  return FileIcon;
}

type DownloadItem = {
  id: number;
  title: string;
  localUri: string;
  status: string;
  bytesDownloaded: number;
  bytesTotal: number;
  lastModified: number;
  mediaType: string;
};

export default function BrowserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTheme: t, settings } = useSettings();
  const params = useLocalSearchParams<{ url?: string }>();
  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [redirectArticle, setRedirectArticle] = useState<{ title: string; url: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const webViewRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tabs,      setTabs]      = React.useState([{ id: 't1', url: '', title: 'New Tab' }]);
  const [activeTab, setActiveTab] = React.useState('t1');

  const addTab = React.useCallback(() => {
    const id = `t${Date.now()}`;
    setTabs(prev => [...prev, { id, url: '', title: 'New Tab' }]);
    setActiveTab(id);
    setCurrentUrl('');
    setUrlInput('');
  }, []);

  const closeTab = React.useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) return [{ id: `t${Date.now()}`, url: '', title: 'New Tab' }];
      const remaining = prev.filter(t => t.id !== id);
      const index = prev.findIndex(t => t.id === id);
      const nextTab = remaining[Math.min(index, remaining.length - 1)];
      setActiveTab(nextTab.id);
      setCurrentUrl(nextTab.url);
      setUrlInput(nextTab.url);
      return remaining;
    });
  }, []);

  const switchTab = React.useCallback((id: string) => {
    setActiveTab(id);
    setTabs(prev => {
      const tab = prev.find(t => t.id === id);
      if (tab) { setCurrentUrl(tab.url); setUrlInput(tab.url); }
      return prev;
    });
  }, []);

  // Allow free rotation while the browser is open, then restore portrait lock.
  useEffect(() => {
    if (!ScreenOrientation) return;
    ScreenOrientation.unlockAsync?.().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync?.(ScreenOrientation.OrientationLock?.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Minimal persistent history (cap 50).
  useEffect(() => {
    AsyncStorage.getItem('browser_history').then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, 50));
      } catch {}
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (history.length === 0) return;
    AsyncStorage.setItem('browser_history', JSON.stringify(history.slice(0, 50))).catch(() => {});
  }, [history]);

  // Restore all tabs on mount — deep-link param takes priority
  useEffect(() => {
    if (params.url) {
      const decoded = decodeURIComponent(params.url);
      setCurrentUrl(decoded); setUrlInput(decoded); return;
    }
    AsyncStorage.getItem('browser_tabs').then(saved => {
      if (saved) {
        try {
          const { tabs: st, activeTabId } = JSON.parse(saved);
          if (Array.isArray(st) && st.length > 0) {
            setTabs(st);
            const aid = activeTabId ?? st[st.length - 1].id;
            setActiveTab(aid);
            const active = st.find((t: any) => t.id === aid);
            if (active?.url) { setCurrentUrl(active.url); setUrlInput(active.url); }
            return;
          }
        } catch {}
      }
      AsyncStorage.getItem('browser_last_url').then(url => {
        if (url) { setCurrentUrl(url); setUrlInput(url); }
      }).catch(() => {});
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep tabs in sync with current URL
  React.useEffect(() => {
    setTabs(prev => prev.map(t => t.id === activeTab
      ? { ...t, url: currentUrl, title: currentUrl ? (currentUrl.replace(/https?:\/\//, '').split('/')[0] || 'Page') : 'New Tab' }
      : t
    ));
  }, [currentUrl, activeTab]);

  // Persist tabs whenever they change
  React.useEffect(() => {
    if (tabs.length === 1 && !tabs[0].url) return;
    AsyncStorage.setItem('browser_tabs', JSON.stringify({ tabs, activeTabId: activeTab })).catch(() => {});
    if (currentUrl) AsyncStorage.setItem('browser_last_url', currentUrl).catch(() => {});
  }, [tabs, activeTab, currentUrl]);

  const loadDownloads = useCallback(async () => {
    try {
      const list = await PresenceDeviceControl.listDownloads();
      const sorted = (list as DownloadItem[]).sort(
        (a, b) => (b.lastModified || 0) - (a.lastModified || 0)
      );
      setDownloads(sorted);
    } catch {}
  }, []);

  // Poll for download updates when downloads panel is visible
  useEffect(() => {
    if (showDownloads) {
      loadDownloads();
      pollRef.current = setInterval(loadDownloads, 3000);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [showDownloads, loadDownloads]);

  const startDownload = useCallback(async (downloadUrl: string) => {
    const fileName = extractFileName(downloadUrl);
    try {
      await PresenceDeviceControl.downloadFile(downloadUrl, fileName);
      setShowDownloads(true);
      loadDownloads();
    } catch (e: any) {
      Alert.alert('Download Error', e?.message || 'Failed to start download');
    }
  }, [loadDownloads]);

  const removeDownloadItem = useCallback(async (id: number) => {
    try {
      await PresenceDeviceControl.removeDownload(id);
      setDownloads(prev => prev.filter(d => d.id !== id));
    } catch {}
  }, []);

  const isSocialOrLogin = useCallback((testUrl: string): boolean => {
    // When the dev toggle is off, allow everything — both social AND logins.
    // Otherwise blocking logins makes the "social allowed" mode useless because
    // you can't actually log in to anything (Google, Apple, etc all hit LOGIN_PATTERNS).
    if (!settings.browserSocialBlock) return false;
    const lower = testUrl.toLowerCase();
    const isSocial = BLOCKED_DOMAINS.some((domain) => lower.includes(domain));
    const isLogin  = LOGIN_PATTERNS.some((pattern) => lower.includes(pattern));
    return isSocial || isLogin;
  }, [settings.browserSocialBlock]);

  const navigateTo = useCallback((rawUrl: string) => {
    let fullUrl = rawUrl.trim();
    if (!fullUrl) return;

if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(fullUrl)) {      if (fullUrl.includes('.') && !fullUrl.includes(' ')) {
        fullUrl = 'https://' + fullUrl;
      } else {
        fullUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(fullUrl);
      }
    }

    if (isSocialOrLogin(fullUrl)) {
      const article = getRandomWikipedia();
      setRedirectArticle(article);
      setCurrentUrl('');
      setShowPredictions(false);
      return;
    }

    // Wrap PDF URLs in Google Docs viewer
    if (/\.pdf($|\?)/i.test(fullUrl) && !fullUrl.startsWith('https://docs.google.com/gview')) {
      fullUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fullUrl)}`;
    }

    setRedirectArticle(null);
    setCurrentUrl(fullUrl);
    setUrlInput(fullUrl);
    setShowPredictions(false);
    setShowDownloads(false);
    setHistory(prev => [fullUrl, ...prev.filter(h => h !== fullUrl)].slice(0, 50));
  }, [isSocialOrLogin]);

  const handleSubmit = useCallback(() => {
    navigateTo(urlInput);
  }, [urlInput, navigateTo]);

  const handleQuickLink = useCallback((linkUrl: string) => {
    setUrlInput(linkUrl);
    navigateTo(linkUrl);
  }, [navigateTo]);

  const handleClear = useCallback(() => {
    setUrlInput('');
    setCurrentUrl('');
    setRedirectArticle(null);
    setCanGoBack(false);
    setCanGoForward(false);
    setShowPredictions(false);
  }, []);

  const handleNavigationStateChange = useCallback((navState: any) => {
    const newUrl = navState.url || '';
    setUrlInput(newUrl);
    setCanGoBack(navState.canGoBack ?? false);
    setCanGoForward(navState.canGoForward ?? false);
    setIsLoading(navState.loading ?? false);
    if (newUrl && !navState.loading) {
      setHistory(prev => [newUrl, ...prev.filter(h => h !== newUrl)].slice(0, 50));
    }

    if (isSocialOrLogin(newUrl)) {
      const article = getRandomWikipedia();
      setRedirectArticle(article);
      setCurrentUrl('');
    }
  }, [isSocialOrLogin]);

  // Predictions: history entries containing the current word
  const currentWord = urlInput.split(/[\s/]/).pop() ?? '';
  const predictions = currentWord.length >= 2
    ? history.filter(h => h.toLowerCase().includes(currentWord.toLowerCase())).slice(0, 5)
    : [];

  const hasActiveDownloads = downloads.some(d => d.status === 'running' || d.status === 'pending');

  const renderDownloadItem = ({ item }: { item: DownloadItem }) => {
    const Icon = getFileIcon(item.title || '');
    const progress = item.bytesTotal > 0 ? item.bytesDownloaded / item.bytesTotal : 0;
    const isActive = item.status === 'running' || item.status === 'pending';
    const isComplete = item.status === 'complete';
    const isFailed = item.status === 'failed';

    return (
      <View style={[styles.dlItem, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={[styles.dlIconWrap, { backgroundColor: t.accent + '15' }]}>
          <Icon size={20} color={t.accent} />
        </View>
        <View style={styles.dlInfo}>
          <Text style={[styles.dlTitle, { color: t.text }]} numberOfLines={1}>
            {item.title || 'Unknown file'}
          </Text>
          <View style={styles.dlMeta}>
            {isActive && (
              <View style={styles.dlProgressBar}>
                <View style={[styles.dlProgressTrack, { backgroundColor: t.border }]}>
                  <View style={[styles.dlProgressFill, { backgroundColor: t.accent, width: `${Math.round(progress * 100)}%` as any }]} />
                </View>
              </View>
            )}
            <Text style={[styles.dlSize, { color: t.textMuted }]}>
              {isActive ? `${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.bytesTotal)}` : formatBytes(item.bytesTotal > 0 ? item.bytesTotal : item.bytesDownloaded)}
            </Text>
          </View>
        </View>
        <View style={styles.dlStatus}>
          {isActive && <Loader size={16} color={t.accent} />}
          {isComplete && <CheckCircle size={16} color="#4CAF50" />}
          {isFailed && <AlertCircle size={16} color="#F44336" />}
        </View>
        <Pressable
          style={styles.dlRemoveBtn}
          onPress={() => removeDownloadItem(item.id)}
          hitSlop={8}
        >
          <Trash2 size={16} color={t.textMuted} />
        </Pressable>
      </View>
    );
  };

  const renderDownloadsPanel = () => (
    <View style={styles.dlPanel}>
      <View style={styles.dlHeader}>
        <Download size={18} color={t.accent} />
        <Text style={[styles.dlHeaderText, { color: t.text }]}>Downloads</Text>
        <Text style={[styles.dlCount, { color: t.textMuted }]}>{downloads.length} files</Text>
      </View>
      {downloads.length === 0 ? (
        <View style={styles.dlEmpty}>
          <Download size={40} color={t.textMuted} />
          <Text style={[styles.dlEmptyText, { color: t.textMuted }]}>No downloads yet</Text>
          <Text style={[styles.dlEmptySubtext, { color: t.textMuted }]}>
            Files you download will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDownloadItem}
          contentContainerStyle={styles.dlList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  const renderWebContent = () => {
    if (showDownloads) return renderDownloadsPanel();

    if (redirectArticle) {
      return (
        <View style={styles.redirectContainer}>
          <View style={[styles.redirectBadge, { backgroundColor: t.accentDim }]}>
            <BookOpen size={14} color={t.accent} />
            <Text style={[styles.redirectBadgeText, { color: t.accent }]}>REDIRECTED</Text>
          </View>
          <View style={[styles.redirectCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[styles.redirectIconWrap, { backgroundColor: t.accent + '15' }]}>
              <BookOpen size={28} color={t.accent} />
            </View>
            <Text style={[styles.redirectTitle, { color: t.text }]}>{redirectArticle.title}</Text>
            <Text style={[styles.redirectBody, { color: t.textSecondary }]}>
              presenceOS detected a social media or login attempt. Here's something genuinely interesting instead.
            </Text>
            <Pressable
              style={[styles.readBtn, { backgroundColor: t.accent }]}
              onPress={() => {
                setRedirectArticle(null);
                setCurrentUrl(redirectArticle.url);
                setUrlInput(redirectArticle.url);
              }}
            >
              <Text style={[styles.readBtnText, { color: t.bg }]}>Read This Instead</Text>
            </Pressable>
            <View style={styles.redirectActions}>
              <Pressable
                style={[styles.redirectBtnSecondary, { borderColor: t.border }]}
                onPress={() => setRedirectArticle(getRandomWikipedia())}
              >
                <Text style={[styles.redirectBtnSecText, { color: t.textSecondary }]}>Another</Text>
              </Pressable>
              <Pressable
                style={[styles.redirectBtnSecondary, { borderColor: t.border }]}
                onPress={handleClear}
              >
                <Text style={[styles.redirectBtnSecText, { color: t.textSecondary }]}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    if (currentUrl) {
      if (Platform.OS === 'web') {
        return (
          <iframe
            src={currentUrl}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none' } as any}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Browser"
          />
        );
      }

      if (WebView) {
        return (
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={styles.webview}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onShouldStartLoadWithRequest={(request: any) => {
              const url = request.url || '';
              if (isSocialOrLogin(url)) {
                const article = getRandomWikipedia();
                setRedirectArticle(article);
                setCurrentUrl('');
                return false;
              }
              if (url.startsWith('intent://') || url.startsWith('market://') || url.startsWith('play.google.com')) {
                return false;
              }
              // Wrap PDFs in Google Docs viewer
              if (/\.pdf($|\?)/i.test(url) && !url.startsWith('https://docs.google.com/gview')) {
                const wrapped = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
                setCurrentUrl(wrapped);
                setUrlInput(wrapped);
                return false;
              }
              // Intercept downloadable file URLs
              if (isDownloadUrl(url) && !url.startsWith('https://docs.google.com/gview')) {
                startDownload(url);
                return false;
              }
              return true;
            }}
            onFileDownload={({ nativeEvent: { downloadUrl } }: any) => {
              if (/\.pdf($|\?)/i.test(downloadUrl)) {
                const wrapped = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(downloadUrl)}`;
                setCurrentUrl(wrapped);
                setUrlInput(wrapped);
              } else {
                startDownload(downloadUrl);
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            cacheEnabled={true}
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            renderLoading={() => (
              <View style={[styles.loadingOverlay, { backgroundColor: t.bg }]}>
                <ActivityIndicator size="large" color={t.accent} />
              </View>
            )}
            allowsBackForwardNavigationGestures={true}
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
          />
        );
      }
    }

    return (
      <View style={styles.startPage}>
        <View style={[styles.startLogo, { backgroundColor: t.accentDim, borderColor: t.accent + '20' }]}>
          <Shield size={28} color={t.accent} />
        </View>
        <Text style={[styles.startTitle, { color: t.text }]}>presenceOS Browser</Text>
        <Text style={[styles.startSubtitle, { color: t.textMuted }]}>
          A focused browsing experience. Social media and login attempts are redirected to something worth reading.
        </Text>
        <Text style={[styles.quickLabel, { color: t.textMuted }]}>QUICK LINKS</Text>
        <View style={styles.quickGrid}>
          {QUICK_LINKS.map((link) => (
            <Pressable
              key={link.name}
              style={[styles.quickCard, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => handleQuickLink(link.url)}
            >
              <View style={[styles.quickDot, { backgroundColor: link.color }]} />
              <Text style={[styles.quickName, { color: t.textSecondary }]}>{link.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />

      {/* ── Tab strip — compact fixed height strip ── */}
      <View style={[styles.tabBar, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, height: 36 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}
        >
          {tabs.map(tab => (
            <Pressable
              key={tab.id}
              style={[styles.tab, {
                borderColor: tab.id === activeTab ? t.accent : 'transparent',
                backgroundColor: tab.id === activeTab ? t.accentDim : 'transparent',
              }]}
              onPress={() => switchTab(tab.id)}
            >
              <Text style={[styles.tabTitle, { color: tab.id === activeTab ? t.accent : t.textMuted }]} numberOfLines={1}>
                {tab.title}
              </Text>
              <Pressable onPress={() => closeTab(tab.id)} hitSlop={8}>
                <X size={12} color={tab.id === activeTab ? t.accent : t.textMuted} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={[styles.addTabBtn, { borderLeftColor: t.border }]} onPress={addTab}>
          <Text style={{ color: t.accent, fontSize: 18, lineHeight: 20 }}>+</Text>
        </Pressable>
      </View>

      {/* ── URL / nav bar ── */}
      <View style={[styles.chrome, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
        

        <Pressable
          style={[styles.urlBar, { backgroundColor: t.surface, borderColor: showKeyboard ? t.accent : t.border, flex: 1 }]}
          onPress={() => setShowKeyboard(true)}
        >
          <Lock size={14} color={currentUrl ? t.teal : t.textMuted} />
          <Text
            style={[styles.urlInput, { color: urlInput ? t.text : t.textMuted }]}
            numberOfLines={1}
          >
            {urlInput || 'Enter address or search…'}
          </Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={t.accent} />
          ) : urlInput ? (
            <Pressable onPress={handleClear} hitSlop={8}>
              <X size={16} color={t.textMuted} />
            </Pressable>
          ) : (
            <Search size={16} color={t.textMuted} />
          )}
        </Pressable>

        <Pressable
          style={[styles.chromeBtn, !canGoBack && !showDownloads && styles.navBtnDisabled]}
          onPress={() => { if (showDownloads) setShowDownloads(false); else webViewRef.current?.goBack(); }}
          disabled={!canGoBack && !showDownloads}
        >
          <ArrowLeft size={18} color={(canGoBack || showDownloads) ? t.text : t.textMuted} />
        </Pressable>
        <Pressable
          style={[styles.chromeBtn, !canGoForward && styles.navBtnDisabled]}
          onPress={() => webViewRef.current?.goForward()}
          disabled={!canGoForward}
        >
          <ArrowRight size={18} color={canGoForward ? t.text : t.textMuted} />
        </Pressable>
        <Pressable
          style={styles.chromeBtn}
          onPress={() => { if (showDownloads) loadDownloads(); else if (currentUrl) webViewRef.current?.reload(); }}
        >
          <RefreshCw size={16} color={t.textMuted} />
        </Pressable>
        <Pressable style={styles.chromeBtn} onPress={() => setShowDownloads(!showDownloads)}>
          <Download size={18} color={showDownloads ? t.accent : t.textMuted} />
          {hasActiveDownloads && !showDownloads && (
            <View style={[styles.dlBadge, { backgroundColor: t.accent }]} />
          )}
        </Pressable>
      </View>

      {showPredictions && predictions.length > 0 && !showDownloads && (
          <View style={[styles.predictionsBox, { backgroundColor: t.surface, borderColor: t.border }]}>
            {predictions.map((pred, i) => (
              <Pressable
                key={i}
                style={[styles.predictionRow, i < predictions.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.borderLight }]}
                onPress={() => { setUrlInput(pred); navigateTo(pred); }}
              >
                <Clock size={12} color={t.textMuted} />
                <Text style={[styles.predictionText, { color: t.text }]} numberOfLines={1}>{pred}</Text>
              </Pressable>
            ))}
          </View>
        )}

      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        {renderWebContent()}
      </View>

      {/* ── PresenceKeyboard for URL entry ── */}
      {showKeyboard && (
        <View style={{ backgroundColor: t.bg }}>
          <Pressable
            style={[styles.kbDismiss, { borderBottomColor: t.border }]}
            onPress={() => { setShowKeyboard(false); if (urlInput.trim()) handleSubmit(); }}
          >
            <Text style={[styles.kbDismissText, { color: t.accent }]}>Go</Text>
            <Pressable onPress={() => setShowKeyboard(false)} hitSlop={12}>
              <X size={16} color={t.textMuted} />
            </Pressable>
          </Pressable>
          <PresenceKeyboard
            value={urlInput}
            onChange={(v) => { setUrlInput(v); setShowPredictions(v.length > 0); }}
            onSend={handleSubmit}
          />
        </View>
      )}
    <BottomBackBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  chromeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  urlInput: { flex: 1, fontSize: 13, paddingVertical: 7 },
  navBtnDisabled: { opacity: 0.4 },
  content: { flex: 1 },
  webview: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  redirectContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  redirectBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 20 },
  redirectBadgeText: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2 },
  redirectCard: { borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, width: '100%', marginBottom: 20 },
  redirectIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  redirectTitle: { fontSize: 18, fontWeight: '600' as const, textAlign: 'center' as const, marginBottom: 12 },
  redirectBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' as const, marginBottom: 16 },
  readBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', marginBottom: 12 },
  readBtnText: { fontSize: 15, fontWeight: '600' as const },
  redirectActions: { width: '100%', flexDirection: 'row', gap: 10 },
  redirectBtnSecondary: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  redirectBtnSecText: { fontSize: 13, fontWeight: '500' as const },
  startPage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  startLogo: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1 },
  startTitle: { fontSize: 20, fontWeight: '600' as const, marginBottom: 8 },
  startSubtitle: { fontSize: 13, textAlign: 'center' as const, marginBottom: 40, lineHeight: 20 },
  quickLabel: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 2, marginBottom: 14 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  quickCard: { borderRadius: 14, padding: 16, width: 120, alignItems: 'center', gap: 8, borderWidth: 1 },
  quickDot: { width: 28, height: 28, borderRadius: 14 },
  quickName: { fontSize: 12, fontWeight: '500' as const },
  predictionsBox: {
    marginHorizontal: 20, borderRadius: 10, borderWidth: 1, overflow: 'hidden',
    marginTop: -4, marginBottom: 4, elevation: 4, zIndex: 10,
  },
  predictionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  predictionText: { flex: 1, fontSize: 13 },
  // Downloads panel
  dlPanel: { flex: 1, paddingHorizontal: 16 },
  dlHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  dlHeaderText: { fontSize: 16, fontWeight: '600' as const, flex: 1 },
  dlCount: { fontSize: 12 },
  dlList: { paddingBottom: 20 },
  dlItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  dlIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dlInfo: { flex: 1 },
  dlTitle: { fontSize: 13, fontWeight: '500' as const, marginBottom: 4 },
  dlMeta: { gap: 4 },
  dlSize: { fontSize: 11 },
  dlProgressBar: { width: '100%' },
  dlProgressTrack: { height: 3, borderRadius: 2, width: '100%' },
  dlProgressFill: { height: 3, borderRadius: 2 },
  dlStatus: { marginRight: 4 },
  dlRemoveBtn: { padding: 6 },
  dlBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 8, height: 8, borderRadius: 4,
  },
  dlEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  dlEmptyText: { fontSize: 15, fontWeight: '500' as const },
  dlEmptySubtext: { fontSize: 12 },

  //tabs — hard-clamp to 36px, never grows
  tabBar: {
    height: 36,
    maxHeight: 36,
    minHeight: 36,
    flexShrink: 0,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 6,
    borderWidth: 1,
    marginHorizontal: 2,
    height: 26,
  },
  tabTitle: { fontSize: 11, fontWeight: '500' as const, maxWidth: 80 },
  addTabBtn: {
    width: 36, height: 36,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  kbDismiss: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  kbDismissText: { fontSize: 15, fontWeight: '600' as const },
});
