/**
 * lucide-safe
 *
 * Drop-in replacement for `lucide-react-native` that never returns undefined.
 * Any icon name missing in the installed lucide version resolves to a visible
 * dashed-circle placeholder instead of crashing React render with
 * "Element type is invalid: ... got: undefined".
 *
 * Wiring: metro.config.js resolves `lucide-react-native` to this file, so
 * existing `import { Foo } from 'lucide-react-native'` imports transparently
 * benefit with no source changes across the 30+ files that use lucide.
 *
 * Why this exists: lucide 0.475 had an export regression, and lucide v1.x
 * renamed/removed icons (e.g. PauseCircle → CirclePause). Either can leak
 * an undefined import into JSX and take down the entire app. This wrapper
 * makes icon-name drift a visual defect, not a crash.
 */

import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import * as LucideReal from 'lucide-react-native/dist/esm/lucide-react-native.js';

// Visible placeholder — a small dashed circle so missing icons are obvious
// in dev without blowing up the render tree.
export function FallbackIcon({ size = 20, color = '#888', strokeWidth = 1.25 }: any) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12" cy="12" r="9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray="2 2"
      />
    </Svg>
  );
}
(FallbackIcon as any).displayName = 'LucideFallback';

// Common aliases between lucide v0 → v1. If the v0 name is missing but the
// v1 name exists (or vice versa), transparently map it. Extend as needed
// when we catch new mismatches in the wild.
const ALIASES: Record<string, string> = {
  PauseCircle:     'CirclePause',
  CirclePause:     'PauseCircle',
  PlayCircle:      'CirclePlay',
  CirclePlay:      'PlayCircle',
  StopCircle:      'CircleStop',
  CircleStop:      'StopCircle',
  XCircle:         'CircleX',
  CircleX:         'XCircle',
  CheckCircle:     'CircleCheck',
  CircleCheck:     'CheckCircle',
  CheckCircle2:    'CircleCheckBig',
  CircleCheckBig:  'CheckCircle2',
  AlertCircle:     'CircleAlert',
  CircleAlert:     'AlertCircle',
  HelpCircle:      'CircleHelp',
  CircleHelp:      'HelpCircle',
  MinusCircle:     'CircleMinus',
  CircleMinus:     'MinusCircle',
  PlusCircle:      'CirclePlus',
  CirclePlus:      'PlusCircle',
};

// Resolve a name to a component: real export first, alias next, fallback last.
function resolve(name: string): any {
  const real = (LucideReal as any)[name];
  if (real) return real;
  const aliasName = ALIASES[name];
  if (aliasName) {
    const aliased = (LucideReal as any)[aliasName];
    if (aliased) return aliased;
  }
  return FallbackIcon;
}

// Build a proxy that looks like the lucide module but never returns undefined.
// Metro pre-binds named imports at build time, so the proxy mostly helps any
// dynamic lookups. The `exports` assignment below is what makes named imports
// resolve correctly — see the bottom of the file.
const safeLucide: Record<string, any> = new Proxy(LucideReal as any, {
  get(target, prop) {
    if (typeof prop === 'symbol') return (target as any)[prop];
    if (prop === '__esModule') return true;
    if (prop === 'FallbackIcon') return FallbackIcon;
    if (prop === 'default') return safeLucide;
    return resolve(prop as string);
  },
  has() { return true; }, // every name is a "valid" access — missing → fallback
});

// Re-export everything named so TypeScript and Metro see a full module surface.
// We can't statically know every icon name lucide exports, so we dump them all
// here at module-load time. This is a one-time cost.
for (const key of Object.keys(LucideReal)) {
  (module.exports as any)[key] = (LucideReal as any)[key] ?? FallbackIcon;
}
// Also cover the known aliases so things like `PauseCircle` resolve even if
// lucide v1 only ships `CirclePause`.
for (const [oldName, newName] of Object.entries(ALIASES)) {
  if (!(oldName in module.exports)) {
    (module.exports as any)[oldName] = resolve(oldName);
  }
  if (!(newName in module.exports)) {
    (module.exports as any)[newName] = resolve(newName);
  }
}

(module.exports as any).FallbackIcon = FallbackIcon;
(module.exports as any).default = safeLucide;
