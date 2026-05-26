// presenceOS — UIStyle token system
// Each UIStyle variant produces a distinct visual character across the whole app.

import type { UIStyle } from '@/contexts/SettingsContext';

export interface UIStyleTokens {
  // Shape
  radius:      number;   // cards, modals, major containers
  radiusSm:    number;   // chips, badges, small elements
  radiusPill:  number;   // pill buttons, round action buttons
  // Borders
  borderWidth: number;   // standard border thickness
  // Depth
  elevation:   number;   // android elevation / shadow
  // Typography
  headingWeight: '200' | '300' | '400' | '600' | '700';
  bodyWeight:    '300' | '400' | '500';
  labelWeight:   '400' | '500' | '600' | '700';
  letterSpacing: number;  // section headers, caps labels
  bodySpacing:   number;  // body text letter spacing
  uppercase:     boolean; // section labels uppercased
  // Effects
  iconStroke:    number;
  glow:          boolean;
}

export const STYLE_TOKENS: Record<UIStyle, UIStyleTokens> = {
  geometric: {
    radius: 4, radiusSm: 3, radiusPill: 6,
    borderWidth: 1.5, elevation: 0,
    headingWeight: '300', bodyWeight: '400', labelWeight: '600',
    letterSpacing: 2.5, bodySpacing: 0.5,
    uppercase: true, iconStroke: 1.25, glow: false,
  },
  modern: {
    radius: 20, radiusSm: 12, radiusPill: 32,
    borderWidth: 0, elevation: 2,
    headingWeight: '200', bodyWeight: '300', labelWeight: '400',
    letterSpacing: 0.2, bodySpacing: 0,
    uppercase: false, iconStroke: 1.75, glow: false,
  },
  classic: {
    radius: 10, radiusSm: 6, radiusPill: 20,
    borderWidth: 1, elevation: 1,
    headingWeight: '400', bodyWeight: '400', labelWeight: '500',
    letterSpacing: 1.5, bodySpacing: 0.2,
    uppercase: true, iconStroke: 1.5, glow: false,
  },
  simple: {
    radius: 14, radiusSm: 8, radiusPill: 28,
    borderWidth: 1, elevation: 0,
    headingWeight: '300', bodyWeight: '400', labelWeight: '500',
    letterSpacing: 0.3, bodySpacing: 0,
    uppercase: false, iconStroke: 1.25, glow: false,
  },
  oldschool: {
    radius: 3, radiusSm: 2, radiusPill: 4,
    borderWidth: 2, elevation: 5,
    headingWeight: '700', bodyWeight: '500', labelWeight: '700',
    letterSpacing: 2, bodySpacing: 0.5,
    uppercase: true, iconStroke: 2.0, glow: false,
  },
  neon: {
    radius: 6, radiusSm: 4, radiusPill: 8,
    borderWidth: 1, elevation: 0,
    headingWeight: '300', bodyWeight: '400', labelWeight: '600',
    letterSpacing: 3, bodySpacing: 1,
    uppercase: true, iconStroke: 1.5, glow: true,
  },
};

export function getUITokens(style: UIStyle): UIStyleTokens {
  return STYLE_TOKENS[style];
}
