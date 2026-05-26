/**
 * NativeSwipeUp
 *
 * A transparent native strip that detects deliberate upward flings and fires
 * onSwipeUp. Sits at the absolute bottom of any screen that needs rotary access.
 *
 * Usage:
 *   <NativeSwipeUp onSwipeUp={openRotary} height={40} />
 *
 * Drop this at the bottom of settings.tsx, messages panels, and chat screens.
 * No gesture conflicts — it's native gesture detection, not PanResponder.
 */

import React from 'react';
import { requireNativeComponent, StyleSheet, ViewStyle } from 'react-native';

const NativeSwipeUpDetector = requireNativeComponent<{
  style?: ViewStyle;
  onSwipeUp?: (e: any) => void;
  distanceThreshold?: number;  // dp — default 80
  velocityThreshold?: number;  // px/s — default 400
}>('SwipeUpDetector');

interface SwipeUpProps {
  onSwipeUp: () => void;
  height?: number;
  distanceThreshold?: number;
  velocityThreshold?: number;
}

export default function NativeSwipeUp({
  onSwipeUp,
  height = 40,
  distanceThreshold = 40,
  velocityThreshold = 200,
}: SwipeUpProps) {
  return (
    <NativeSwipeUpDetector
      style={[styles.strip, { height }]}
      onSwipeUp={onSwipeUp}
      distanceThreshold={distanceThreshold}
      velocityThreshold={velocityThreshold}
    />
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
});
