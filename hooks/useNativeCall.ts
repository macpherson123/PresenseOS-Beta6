import { useEffect, useRef, useState, useCallback } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

interface CallState {
  state: 'idle' | 'dialing' | 'active' | 'held' | 'disconnected';
  duration: number;
  phoneNumber: string;
  isMuted: boolean;
  isSpeaker: boolean;
}

const initialState: CallState = {
  state: 'idle',
  duration: 0,
  phoneNumber: '',
  isMuted: false,
  isSpeaker: false,
};

export function useNativeCall() {
  const [callState, setCallState] = useState<CallState>(initialState);
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    try {
      const eventEmitter = new NativeEventEmitter(
        NativeModules.PresenceDialer
      );
      emitterRef.current = eventEmitter;

      // Listen for call state changes from native layer
      const subscription = eventEmitter.addListener(
        'callStateChanged',
        (event: { state: string; phoneNumber: string; duration: number }) => {
          setCallState((prev) => ({
            ...prev,
            state: event.state as any,
            phoneNumber: event.phoneNumber,
            duration: event.duration,
          }));

          // Clear state when call disconnects
          if (event.state === 'disconnected') {
            setTimeout(() => {
              setCallState(initialState);
            }, 500);
          }
        }
      );

      return () => {
        subscription.remove();
      };
    } catch (error) {
      console.warn('NativeCall setup failed:', error);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (Platform.OS !== 'android' || !NativeModules.PresenceDialer) return;
    try {
      await NativeModules.PresenceDialer.setMuted(!callState.isMuted);
      setCallState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    } catch (error) {
      console.error('Mute toggle failed:', error);
    }
  }, [callState.isMuted]);

  const toggleSpeaker = useCallback(async () => {
    if (Platform.OS !== 'android' || !NativeModules.PresenceDialer) return;
    try {
      await NativeModules.PresenceDialer.setSpeaker(!callState.isSpeaker);
      setCallState((prev) => ({ ...prev, isSpeaker: !prev.isSpeaker }));
    } catch (error) {
      console.error('Speaker toggle failed:', error);
    }
  }, [callState.isSpeaker]);

  const endCall = useCallback(async () => {
    if (Platform.OS !== 'android' || !NativeModules.PresenceDialer) return;
    try {
      await NativeModules.PresenceDialer.endCall();
    } catch (error) {
      console.error('End call failed:', error);
    }
  }, []);

  return {
    callState,
    toggleMute,
    toggleSpeaker,
    endCall,
  };
}
