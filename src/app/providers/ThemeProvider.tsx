import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useQuery } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import type { ThemeMode } from '@/types/models';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && window.matchMedia(DARK_QUERY).matches);
}

/** Color de fondo del tema activo, leído del token `--bg` (así la barra de estado no duplica la paleta). */
function readBackgroundToken(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}

async function syncStatusBar(mode: ThemeMode): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const dark = isDark(mode);
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    const color = readBackgroundToken();
    if (color) await StatusBar.setBackgroundColor({ color });
  } catch {
    // La barra de estado es solo cosmética: si falla, la app sigue funcionando.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useQuery(() => settingsService.getTheme());
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    if (stored.data) setModeState(stored.data);
  }, [stored.data]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    void syncStatusBar(mode);

    if (mode !== 'system') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => void syncStatusBar('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void settingsService.setTheme(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
}
