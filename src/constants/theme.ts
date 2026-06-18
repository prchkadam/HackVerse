/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/* ── EchoSight Design Tokens ─────────────────────────────── */

export const Accent = {
  blue:        '#4A9EFF',
  blueGlow:    'rgba(74, 158, 255, 0.25)',
  cyan:        '#22D3EE',
  cyanGlow:    'rgba(34, 211, 238, 0.20)',
  green:       '#34D399',
  greenGlow:   'rgba(52, 211, 153, 0.20)',
  amber:       '#FBBF24',
  amberGlow:   'rgba(251, 191, 36, 0.20)',
  red:         '#EF4444',
  redGlow:     'rgba(239, 68, 68, 0.30)',
  purple:      '#A78BFA',
  purpleGlow:  'rgba(167, 139, 250, 0.20)',
} as const;

export const Surface = {
  card:        '#111318',
  cardBorder:  '#1E2028',
  elevated:    '#181A20',
  overlay:     'rgba(0,0,0,0.6)',
  dimmed:      'rgba(255,255,255,0.06)',
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
} as const;
