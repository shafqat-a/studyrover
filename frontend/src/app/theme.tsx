import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Theme provider (appearance system).
 *
 * Two orthogonal controls compose the look:
 * - `theme`  — the brand palette identity (midnight | ocean | forest | sunset
 *   | royal), applied as `data-theme` on <html>. Each theme overrides the
 *   primary/accent/ring tokens in globals.css.
 * - `mode`   — light | dark | system brightness. `system` follows the OS via
 *   `prefers-color-scheme`; the resolved value toggles the `dark` class.
 *
 * Both are persisted to localStorage and applied before first paint by an
 * inline script in index.html (no FOUC). The provider re-applies on mount and
 * keeps the DOM in sync when the user changes either control.
 */

export type ThemeName = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'royal';
export type ColorMode = 'light' | 'dark' | 'system';

export interface ThemeOption {
  name: ThemeName;
  label: string;
  /** CSS color shown in the picker swatch (light-mode primary of the theme). */
  swatch: string;
}

export const THEMES: readonly ThemeOption[] = [
  { name: 'midnight', label: 'Midnight', swatch: '#18181b' },
  { name: 'ocean', label: 'Ocean', swatch: '#2563eb' },
  { name: 'forest', label: 'Forest', swatch: '#16a34a' },
  { name: 'sunset', label: 'Sunset', swatch: '#e11d48' },
  { name: 'royal', label: 'Royal', swatch: '#7c3aed' },
];

const THEME_KEY = 'sr-theme';
const MODE_KEY = 'sr-color-mode';

interface ThemeContextValue {
  theme: ThemeName;
  mode: ColorMode;
  /** Effective brightness after resolving `system`. */
  resolvedMode: 'light' | 'dark';
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ColorMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / disabled storage) */
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function isThemeName(value: string | null): value is ThemeName {
  return (
    value === 'midnight' ||
    value === 'ocean' ||
    value === 'forest' ||
    value === 'sunset' ||
    value === 'royal'
  );
}

function isColorMode(value: string | null): value is ColorMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = readStored(THEME_KEY);
    return isThemeName(stored) ? stored : 'midnight';
  });
  const [mode, setModeState] = useState<ColorMode>(() => {
    const stored = readStored(MODE_KEY);
    return isColorMode(stored) ? stored : 'system';
  });
  // Track the OS preference so `system` mode stays live.
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  // Keep <html> in sync with the active theme + resolved brightness.
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', theme);
    el.classList.toggle('dark', resolvedMode === 'dark');
  }, [theme, resolvedMode]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    writeStored(THEME_KEY, next);
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    writeStored(MODE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, resolvedMode, setTheme, setMode }),
    [theme, mode, resolvedMode, setTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Access the appearance controls. Throws if used outside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}
