// ================================
// 3. /hooks/useHomeGestures.ts
// ================================
import { PanResponder } from 'react-native';
import { useMemo } from 'react';

export function useHomeGestures({ showRotary, openRotary, closeRotary, panX }: any) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
    onPanResponderRelease: (_, gs) => {
      if (gs.dy < -50) openRotary();
      else if (gs.dy > 50) closeRotary();
    },
  }), [showRotary]);
}