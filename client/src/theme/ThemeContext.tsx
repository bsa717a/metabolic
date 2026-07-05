import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  COLOR_THEME_STORAGE_KEY,
  resolveColorTheme,
  type ColorTheme
} from './palettes';

export type ThemeMode = 'light' | 'dark';

const MODE_STORAGE_KEY = 'metabolic-theme';

function getSystemMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredMode(): ThemeMode | null {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function getStoredColorTheme(): ColorTheme {
  return resolveColorTheme(localStorage.getItem(COLOR_THEME_STORAGE_KEY));
}

function resolveMode(): ThemeMode {
  return getStoredMode() ?? getSystemMode();
}

function applyTheme(mode: ThemeMode, colorTheme: ColorTheme) {
  document.documentElement.dataset.theme = colorTheme;
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

type ThemeContextValue = {
  mode: ThemeMode;
  colorTheme: ColorTheme;
  setMode: (mode: ThemeMode) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  toggleMode: () => void;
  /** @deprecated Use `mode` instead */
  theme: ThemeMode;
  /** @deprecated Use `setMode` instead */
  setTheme: (mode: ThemeMode) => void;
  /** @deprecated Use `toggleMode` instead */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => resolveMode());
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => getStoredColorTheme());

  useEffect(() => {
    applyTheme(mode, colorTheme);
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  }, [mode, colorTheme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!getStoredMode()) {
        const next = media.matches ? 'dark' : 'light';
        setModeState(next);
        applyTheme(next, colorTheme);
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [colorTheme]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setColorTheme = useCallback((next: ColorTheme) => setColorThemeState(next), []);
  const toggleMode = useCallback(() => setModeState((current) => (current === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        colorTheme,
        setMode,
        setColorTheme,
        toggleMode,
        theme: mode,
        setTheme: setMode,
        toggleTheme: toggleMode
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
