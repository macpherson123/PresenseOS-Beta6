import React, { useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

// Animated.Value instances MUST live in refs, not inside the render call.
// The previous implementation created `new Animated.Value(±400)` on every render,
// which reset the values each frame and leaked animation objects.
export default function ScreenWrapper({ left, right, children, panX, bg }: any) {
  const offsetLeft  = useRef(new Animated.Value(-400)).current;
  const offsetRight = useRef(new Animated.Value( 400)).current;

  return (
    <>
      <Animated.View pointerEvents="none" style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: bg,
        transform: [{ translateX: Animated.add(panX, offsetLeft) }],
      }}>{left}</Animated.View>

      <Animated.View pointerEvents="none" style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: bg,
        transform: [{ translateX: Animated.add(panX, offsetRight) }],
      }}>{right}</Animated.View>

      <Animated.View style={{ flex: 1, transform: [{ translateX: panX }] }}>
        {children}
      </Animated.View>
    </>
  );
}
