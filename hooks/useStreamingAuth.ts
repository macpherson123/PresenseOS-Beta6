import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SPOTIFY_TOKEN_KEY = '@presenceos:spotify_auth';
const DEEZER_TOKEN_KEY = '@presenceos:deezer_auth';

export interface OAuthConfig {
  service: 'spotify' | 'deezer';
  url: string;
  onSuccess?: () => void;
  onError?: (err: string) => void;
}

// Spotify OAuth Configuration
export const getSpotifyAuthUrl = () => {
  const clientId = '8f65ce85381c4d76bc9845a7d6efd029';
  const redirectUri = 'presenceos://auth/spotify';
  const scope = 'streaming user-read-private user-read-email user-library-read user-library-modify playlist-read-private playlist-modify-public playlist-modify-private';

  return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
};

// Deezer OAuth Configuration
export const getDeezerAuthUrl = () => {
  const appId = 'YOUR_DEEZER_APP_ID';
  const redirectUri = 'presenceos://auth/deezer';
  const perms = 'basic_access,email,offline_access,manage_library,delete_library,manage_playlists';

  return `https://connect.deezer.com/oauth/auth.php?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&perms=${perms}`;
};

export function useStreamingAuth() {
  const initiateSpotifyAuth = useCallback(async (onSuccess?: () => void, onError?: (err: string) => void) => {
    try {
      const authUrl = getSpotifyAuthUrl();
      // Use system browser (Chrome Custom Tab) - trusted by OAuth providers
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'presenceos://auth/spotify');

      if (result.type === 'success' && result.url) {
        try {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');
          if (code) {
            await AsyncStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify({
              code,
              timestamp: Date.now(),
            }));
            console.log('[StreamingAuth] Spotify auth successful');
            onSuccess?.();
          } else {
            const error = url.searchParams.get('error') || 'No auth code received';
            console.log('[StreamingAuth] Spotify auth error:', error);
            onError?.(error);
          }
        } catch (e) {
          console.log('[StreamingAuth] URL parsing error:', e);
          onError?.('Failed to parse auth response');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        console.log('[StreamingAuth] Spotify auth cancelled');
        onError?.('Authentication cancelled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect Spotify';
      onError?.(message);
      console.error('[StreamingAuth] Spotify auth failed:', error);
    }
  }, []);

  const initiateDeezerAuth = useCallback(async (onSuccess?: () => void, onError?: (err: string) => void) => {
    try {
      const authUrl = getDeezerAuthUrl();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'presenceos://auth/deezer');

      if (result.type === 'success' && result.url) {
        try {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');
          if (code) {
            await AsyncStorage.setItem(DEEZER_TOKEN_KEY, JSON.stringify({
              code,
              timestamp: Date.now(),
            }));
            console.log('[StreamingAuth] Deezer auth successful');
            onSuccess?.();
          } else {
            const error = url.searchParams.get('error_reason') || 'No auth code received';
            console.log('[StreamingAuth] Deezer auth error:', error);
            onError?.(error);
          }
        } catch (e) {
          console.log('[StreamingAuth] URL parsing error:', e);
          onError?.('Failed to parse auth response');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        console.log('[StreamingAuth] Deezer auth cancelled');
        onError?.('Authentication cancelled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect Deezer';
      onError?.(message);
      console.error('[StreamingAuth] Deezer auth failed:', error);
    }
  }, []);

  const isSpotifyConnected = useCallback(async (): Promise<boolean> => {
    try {
      const data = await AsyncStorage.getItem(SPOTIFY_TOKEN_KEY);
      return data !== null;
    } catch {
      return false;
    }
  }, []);

  const isDeezerConnected = useCallback(async (): Promise<boolean> => {
    try {
      const data = await AsyncStorage.getItem(DEEZER_TOKEN_KEY);
      return data !== null;
    } catch {
      return false;
    }
  }, []);

  const disconnectSpotify = useCallback(async () => {
    await AsyncStorage.removeItem(SPOTIFY_TOKEN_KEY);
    console.log('[StreamingAuth] Spotify disconnected');
  }, []);

  const disconnectDeezer = useCallback(async () => {
    await AsyncStorage.removeItem(DEEZER_TOKEN_KEY);
    console.log('[StreamingAuth] Deezer disconnected');
  }, []);

  return {
    initiateSpotifyAuth,
    initiateDeezerAuth,
    isSpotifyConnected,
    isDeezerConnected,
    disconnectSpotify,
    disconnectDeezer,
  };
}
