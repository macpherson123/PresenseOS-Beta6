// presenceOS — Color System
// 8 complete named themes. Each theme is a full palette — no mode/accent split.
// ─────────────────────────────────────────────────────────────────────────────

export type ThemePreset =
  | 'midnight' | 'snow' | 'arctic' | 'neon'
  | 'forest'  | 'ocean' | 'rose' | 'inferno'
  | 'aurora'  | 'copper' | 'void';

export interface ThemeColors {
  bg:            string;
  surface:       string;
  card:          string;
  cardHover:     string;
  accent:        string;
  accentDim:     string;
  teal:          string;
  tealDim:       string;
  red:           string;
  redDim:        string;
  green:         string;
  greenDim:      string;
  text:          string;
  textSecondary: string;
  textMuted:     string;
  border:        string;
  borderLight:   string;
  overlay:       string;
  white:         string;
  black:         string;
}

export interface ThemeDefinition {
  id:      ThemePreset;
  name:    string;
  desc:    string;
  preview: { bg: string; surface: string; accent: string; textMuted: string; };
  colors:  ThemeColors;
}

// ─── 8 Theme Definitions ──────────────────────────────────────────────────────

const THEME_DEFS: ThemeDefinition[] = [
  {
    id: 'midnight', name: 'Midnight', desc: 'Deep dark with warm amber',
    preview: { bg: '#16161C', surface: '#1E1E26', accent: '#E8A838', textMuted: '#686572' },
    colors: {
      bg: '#16161C', surface: '#1E1E26', card: '#26262E', cardHover: '#2E2E38',
      accent: '#E8A838',          accentDim: 'rgba(232,168,56,0.15)',
      teal:   '#3ABFAD',          tealDim:   'rgba(58,191,173,0.15)',
      red:    '#E85454',          redDim:    'rgba(232,84,84,0.15)',
      green:  '#4ADE80',          greenDim:  'rgba(74,222,128,0.15)',
      text: '#E8E5DF', textSecondary: '#949089', textMuted: '#686572',
      border: '#32323E', borderLight: '#28282E',
      overlay: 'rgba(0,0,0,0.6)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'snow', name: 'Snow', desc: 'Clean white with teal accents',
    preview: { bg: '#F4F2EE', surface: '#FFFFFF', accent: '#3ABFAD', textMuted: '#787470' },
    colors: {
      bg: '#F4F2EE', surface: '#FFFFFF', card: '#E8E5E0', cardHover: '#DDDAD4',
      accent: '#3ABFAD',          accentDim: 'rgba(58,191,173,0.15)',
      teal:   '#3ABFAD',          tealDim:   'rgba(58,191,173,0.15)',
      red:    '#C8202F',          redDim:    'rgba(200,32,47,0.12)',
      green:  '#1A9E4A',          greenDim:  'rgba(26,158,74,0.12)',
      text: '#0E0E14', textSecondary: '#3A3935', textMuted: '#787470',
      border: '#AEABA3', borderLight: '#CCCAC4',
      overlay: 'rgba(0,0,0,0.4)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'arctic', name: 'Arctic', desc: 'Frozen dark with crystalline blue',
    preview: { bg: '#050A10', surface: '#0A1420', accent: '#88DDFF', textMuted: '#406878' },
    colors: {
      bg: '#050A10', surface: '#0A1420', card: '#0F1E2E', cardHover: '#142840',
      accent: '#88DDFF',          accentDim: 'rgba(136,221,255,0.15)',
      teal:   '#44FFEE',          tealDim:   'rgba(68,255,238,0.15)',
      red:    '#FF7799',          redDim:    'rgba(255,119,153,0.15)',
      green:  '#44FFAA',          greenDim:  'rgba(68,255,170,0.12)',
      text: '#E0F4FF', textSecondary: '#80B4D0', textMuted: '#406878',
      border: '#10203A', borderLight: '#0A1828',
      overlay: 'rgba(0,0,0,0.75)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'neon', name: 'Neon', desc: 'Dark void with neon pink',
    preview: { bg: '#0D0D18', surface: '#14141F', accent: '#FF2D78', textMuted: '#606080' },
    colors: {
      bg: '#0D0D18', surface: '#14141F', card: '#1A1A2A', cardHover: '#20202E',
      accent: '#FF2D78',          accentDim: 'rgba(255,45,120,0.15)',
      teal:   '#00D4FF',          tealDim:   'rgba(0,212,255,0.15)',
      red:    '#FF4444',          redDim:    'rgba(255,68,68,0.15)',
      green:  '#39FF14',          greenDim:  'rgba(57,255,20,0.12)',
      text: '#F0EEFF', textSecondary: '#9090AA', textMuted: '#606080',
      border: '#2A2A3E', borderLight: '#20202E',
      overlay: 'rgba(0,0,0,0.75)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'forest', name: 'Forest', desc: 'Deep green woods',
    preview: { bg: '#0D1410', surface: '#141F18', accent: '#4ADE80', textMuted: '#506858' },
    colors: {
      bg: '#0D1410', surface: '#141F18', card: '#1A2820', cardHover: '#203028',
      accent: '#4ADE80',          accentDim: 'rgba(74,222,128,0.15)',
      teal:   '#2DD4BF',          tealDim:   'rgba(45,212,191,0.15)',
      red:    '#F87171',          redDim:    'rgba(248,113,113,0.15)',
      green:  '#4ADE80',          greenDim:  'rgba(74,222,128,0.15)',
      text: '#E4F0E8', textSecondary: '#88A890', textMuted: '#506858',
      border: '#243028', borderLight: '#1C2820',
      overlay: 'rgba(0,0,0,0.65)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'ocean', name: 'Ocean', desc: 'Deep blue depths',
    preview: { bg: '#0A0E1A', surface: '#10162A', accent: '#38BDF8', textMuted: '#506088' },
    colors: {
      bg: '#0A0E1A', surface: '#10162A', card: '#161E36', cardHover: '#1C2640',
      accent: '#38BDF8',          accentDim: 'rgba(56,189,248,0.15)',
      teal:   '#2DD4BF',          tealDim:   'rgba(45,212,191,0.15)',
      red:    '#FB7185',          redDim:    'rgba(251,113,133,0.15)',
      green:  '#4ADE80',          greenDim:  'rgba(74,222,128,0.12)',
      text: '#E0EEFF', textSecondary: '#8090B8', textMuted: '#506088',
      border: '#1E2A44', borderLight: '#161E36',
      overlay: 'rgba(0,0,0,0.7)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'rose', name: 'Rosé', desc: 'Warm blush with soft pinks',
    preview: { bg: '#FDF0F2', surface: '#FFFFFF', accent: '#D4324A', textMuted: '#907880' },
    colors: {
      bg: '#FDF0F2', surface: '#FFFFFF', card: '#F8E8EC', cardHover: '#F0DCE2',
      accent: '#D4324A',          accentDim: 'rgba(212,50,74,0.12)',
      teal:   '#D4324A',          tealDim:   'rgba(212,50,74,0.12)',
      red:    '#C8202F',          redDim:    'rgba(200,32,47,0.12)',
      green:  '#2E8B57',          greenDim:  'rgba(46,139,87,0.12)',
      text: '#1A0810', textSecondary: '#6A3040', textMuted: '#907880',
      border: '#F0C8CC', borderLight: '#F8DCE0',
      overlay: 'rgba(0,0,0,0.4)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'inferno', name: 'Inferno', desc: 'Volcanic dark with lava orange',
    preview: { bg: '#0A0302', surface: '#120604', accent: '#FF5500', textMuted: '#704040' },
    colors: {
      bg: '#0A0302', surface: '#120604', card: '#1C0A06', cardHover: '#241008',
      accent: '#FF5500',          accentDim: 'rgba(255,85,0,0.15)',
      teal:   '#FF8C00',          tealDim:   'rgba(255,140,0,0.15)',
      red:    '#FF2222',          redDim:    'rgba(255,34,34,0.15)',
      green:  '#88FF44',          greenDim:  'rgba(136,255,68,0.12)',
      text: '#FFF0E8', textSecondary: '#B88070', textMuted: '#704040',
      border: '#280C06', borderLight: '#1E0804',
      overlay: 'rgba(0,0,0,0.82)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'aurora', name: 'Aurora', desc: 'Northern lights — emerald glow on deep navy',
    preview: { bg: '#080C14', surface: '#0E1620', accent: '#50FFAA', textMuted: '#4A7868' },
    colors: {
      bg: '#080C14', surface: '#0E1620', card: '#141F2E', cardHover: '#1A2840',
      accent: '#50FFAA',          accentDim: 'rgba(80,255,170,0.15)',
      teal:   '#7B4FFF',          tealDim:   'rgba(123,79,255,0.15)',
      red:    '#FF6B6B',          redDim:    'rgba(255,107,107,0.15)',
      green:  '#50FFAA',          greenDim:  'rgba(80,255,170,0.12)',
      text: '#D4F0E8', textSecondary: '#88C4B0', textMuted: '#4A7868',
      border: '#0E2030', borderLight: '#0A1828',
      overlay: 'rgba(0,0,0,0.75)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'copper', name: 'Copper', desc: 'Industrial copper — warm metal on dark forge',
    preview: { bg: '#0E0A08', surface: '#18120E', accent: '#D4742A', textMuted: '#706050' },
    colors: {
      bg: '#0E0A08', surface: '#18120E', card: '#221A14', cardHover: '#2A201A',
      accent: '#D4742A',          accentDim: 'rgba(212,116,42,0.15)',
      teal:   '#C8963C',          tealDim:   'rgba(200,150,60,0.15)',
      red:    '#E85454',          redDim:    'rgba(232,84,84,0.15)',
      green:  '#8BC44A',          greenDim:  'rgba(139,196,74,0.12)',
      text: '#F0E8DF', textSecondary: '#A09080', textMuted: '#706050',
      border: '#2E1E12', borderLight: '#241612',
      overlay: 'rgba(0,0,0,0.72)', white: '#FFFFFF', black: '#000000',
    },
  },
  {
    id: 'void', name: 'Void', desc: 'Absolute dark with electric blue',
    preview: { bg: '#030305', surface: '#07070C', accent: '#6B8CFF', textMuted: '#404868' },
    colors: {
      bg: '#030305', surface: '#07070C', card: '#0C0C14', cardHover: '#111120',
      accent: '#6B8CFF',          accentDim: 'rgba(107,140,255,0.15)',
      teal:   '#4CEFCE',          tealDim:   'rgba(76,239,206,0.15)',
      red:    '#FF5577',          redDim:    'rgba(255,85,119,0.15)',
      green:  '#44FFAA',          greenDim:  'rgba(68,255,170,0.12)',
      text: '#C8D0E8', textSecondary: '#7080A8', textMuted: '#404868',
      border: '#12121E', borderLight: '#0A0A14',
      overlay: 'rgba(0,0,0,0.82)', white: '#FFFFFF', black: '#000000',
    },
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const THEMES: Record<ThemePreset, ThemeDefinition> =
  Object.fromEntries(THEME_DEFS.map(t => [t.id, t])) as Record<ThemePreset, ThemeDefinition>;

export const THEME_LIST: ThemeDefinition[] = THEME_DEFS;

export function getTheme(name: ThemePreset): ThemeColors {
  return THEMES[name]?.colors ?? THEMES.midnight.colors;
}

// ─── Legacy exports (kept so non-settings screens compile unchanged) ──────────

export type ThemeMode    = 'dark' | 'light' | 'greyscale';
export type AccentColor  = 'amber' | 'teal' | 'rose' | 'violet' | 'sky' | 'lime';

export const ACCENT_OPTIONS: { id: AccentColor; name: string; color: string }[] = [
  { id: 'amber',  name: 'Amber',  color: '#E8A838' },
  { id: 'teal',   name: 'Teal',   color: '#3ABFAD' },
  { id: 'rose',   name: 'Rose',   color: '#F472B6' },
  { id: 'violet', name: 'Violet', color: '#A78BFA' },
  { id: 'sky',    name: 'Sky',    color: '#38BDF8'  },
  { id: 'lime',   name: 'Lime',   color: '#A3E635'  },
];

export const THEME_MODE_OPTIONS: { id: ThemeMode; name: string; icon: string }[] = [
  { id: 'dark',      name: 'Dark',  icon: 'Moon'     },
  { id: 'light',     name: 'Light', icon: 'Sun'      },
  { id: 'greyscale', name: 'Grey',  icon: 'Contrast' },
];

/** @deprecated — use getTheme(name: ThemePreset) instead */
export function buildTheme(
  mode: ThemeMode,
  _accentColor?: AccentColor,
  _light?: AccentColor,
  _dark?: AccentColor,
): ThemeColors {
  const map: Record<ThemeMode, ThemePreset> = {
    dark: 'midnight', light: 'snow', greyscale: 'arctic',
  };
  return getTheme(map[mode] ?? 'midnight');
}

export const theme = THEMES.midnight.colors;

export default {
  light: {
    text:           theme.text,
    background:     theme.bg,
    tint:           theme.accent,
    tabIconDefault: theme.textMuted,
    tabIconSelected: theme.accent,
  },
};
