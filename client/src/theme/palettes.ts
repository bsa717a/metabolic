export const COLOR_THEME_IDS = ['classic', 'ocean', 'ember', 'indigo', 'plum', 'wine'] as const;

export type ColorTheme = (typeof COLOR_THEME_IDS)[number];

export const COLOR_THEMES: {
  id: ColorTheme;
  label: string;
  swatchBg: string;
  swatchAccent: string;
}[] = [
  { id: 'classic', label: 'Classic', swatchBg: '#e9ecef', swatchAccent: '#7da35d' },
  { id: 'ocean', label: 'Ocean', swatchBg: '#eef2f5', swatchAccent: '#2a9d8f' },
  { id: 'ember', label: 'Ember', swatchBg: '#faf6f1', swatchAccent: '#e07a5f' },
  { id: 'indigo', label: 'Indigo', swatchBg: '#e8eaf0', swatchAccent: '#4a6670' },
  { id: 'plum', label: 'Plum', swatchBg: '#ede8f0', swatchAccent: '#6b4f7a' },
  { id: 'wine', label: 'Wine', swatchBg: '#f0e8ea', swatchAccent: '#8b3a4a' }
];

export const DEFAULT_COLOR_THEME: ColorTheme = 'classic';

export const COLOR_THEME_STORAGE_KEY = 'metabolic-color-theme';

const LEGACY_COLOR_THEME_MAP: Record<string, ColorTheme> = {
  neon: 'indigo',
  voltage: 'plum',
  crimson: 'wine'
};

export function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return COLOR_THEME_IDS.includes(value as ColorTheme);
}

export function resolveColorTheme(value: string | null | undefined): ColorTheme {
  if (isColorTheme(value)) return value;
  if (value && value in LEGACY_COLOR_THEME_MAP) return LEGACY_COLOR_THEME_MAP[value];
  return DEFAULT_COLOR_THEME;
}
