// ================================
// 2. /components/layout/RotaryMount.tsx
// ================================
import { Animated, StyleSheet } from 'react-native';

export function RotaryMount({ visible, backdropOp, rotaryY, rotaryScale, children }: any) {
  if (!visible) return null;

  return (
    <>
      <Animated.View style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'black',
        opacity: backdropOp,
      }} />

      <Animated.View style={{
        ...StyleSheet.absoluteFillObject,
        transform: [{ translateY: rotaryY }, { scale: rotaryScale }],
      }}>{children}</Animated.View>
    </>
  );
}