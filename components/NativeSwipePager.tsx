/**
 * NativeSwipePager
 *
 * JS wrapper for the native PresenceSwipePager ViewPager2 component.
 *
 * Usage:
 *   const pagerRef = useRef<SwipePagerRef>(null);
 *
 *   <NativeSwipePager ref={pagerRef} onPageChange={p => setPage(p)} style={{ flex: 1 }}>
 *     <MessagesPanel />    // page 0 — left
 *     <HomePanel />        // page 1 — centre  ← starts here
 *     <SettingsPanel />    // page 2 — right
 *   </NativeSwipePager>
 *
 *   pagerRef.current?.goToPage(1)   // snap to home programmatically
 */

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  requireNativeComponent,
  UIManager,
  findNodeHandle,
  ViewStyle,
  Platform,
} from 'react-native';

// ── Native component ──────────────────────────────────────────────────────────

const NativePresenceSwipePager = requireNativeComponent<{
  style?: ViewStyle;
  onPageChange?: (e: { nativeEvent: { page: number } }) => void;
  children?: React.ReactNode;
}>('PresenceSwipePager');

// ── Public API ────────────────────────────────────────────────────────────────

export interface SwipePagerRef {
  /** Programmatically navigate to a page (0=messages, 1=home, 2=settings) */
  goToPage: (page: number, animated?: boolean) => void;
}

interface SwipePagerProps {
  style?: ViewStyle;
  onPageChange?: (page: number) => void;
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

const NativeSwipePager = forwardRef<SwipePagerRef, SwipePagerProps>(
  ({ style, onPageChange, children }, ref) => {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      goToPage(page: number, animated = true) {
        if (Platform.OS !== 'android') return;
        const node = findNodeHandle(nativeRef.current);
        if (!node) return;

        const commandsMap =
          UIManager.getViewManagerConfig('PresenceSwipePager')?.Commands;
        if (!commandsMap) return;

        UIManager.dispatchViewManagerCommand(
          node,
          commandsMap.setPage,
          [page, animated],
        );
      },
    }));

    return (
      <NativePresenceSwipePager
        ref={nativeRef}
        style={style ?? { flex: 1 }}
        onPageChange={(e) => onPageChange?.(e.nativeEvent.page)}
      >
        {children}
      </NativePresenceSwipePager>
    );
  },
);

NativeSwipePager.displayName = 'NativeSwipePager';

export default NativeSwipePager;
