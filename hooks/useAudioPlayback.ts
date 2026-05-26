import { useMusic } from '@/contexts/MusicContext';

/**
 * Thin compatibility wrapper around useMusic().
 *
 * All audio management now lives inside MusicContext (the Audio.Sound object
 * is held at the provider level so it persists across screen navigations).
 * This hook re-exports the relevant playback functions so existing consumers
 * continue to work without changes.
 */
export function useAudioPlayback() {
  const {
    playbackState,
    togglePlayPause,
    seekTo,
    nextTrack,
    previousTrack,
  } = useMusic();

  return {
    isPlaying: playbackState.isPlaying,
    play: togglePlayPause,
    pause: togglePlayPause,
    stop: togglePlayPause,
    seek: seekTo,
    nextTrack,
    previousTrack,
  };
}
