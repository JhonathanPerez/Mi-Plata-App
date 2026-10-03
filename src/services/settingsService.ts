import { SETTING_KEYS } from '@/config/constants';
import { notifyDataChanged } from '@/lib/dataBus';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { ThemeMode } from '@/types/models';

const THEMES: ThemeMode[] = ['system', 'light', 'dark'];

export const settingsService = {
  async getTheme(): Promise<ThemeMode> {
    const value = await settingsRepository.get(SETTING_KEYS.theme);
    return THEMES.includes(value as ThemeMode) ? (value as ThemeMode) : 'system';
  },

  async setTheme(mode: ThemeMode): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.theme, mode);
    notifyDataChanged();
  },

  /** ¿El usuario dejó los valores ocultos (modo privacidad)? Por defecto se ven. */
  async getHideAmounts(): Promise<boolean> {
    return (await settingsRepository.get(SETTING_KEYS.hideAmounts)) === 'true';
  },

  /** Solo guarda la preferencia; no avisa al bus de datos porque no cambia ningún gasto (nada que releer). */
  async setHideAmounts(hidden: boolean): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.hideAmounts, hidden ? 'true' : 'false');
  },

  /** Cuántas veces se mostró la pista de deslizar un gasto (un número alto = ya la aprendió). No cambia gastos: no avisa al bus. */
  async getSwipeHintCount(): Promise<number> {
    const value = Number(await settingsRepository.get(SETTING_KEYS.swipeHintCount));
    return Number.isFinite(value) && value > 0 ? value : 0;
  },

  async setSwipeHintCount(count: number): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.swipeHintCount, String(count));
  },

  getLastPaymentMethodId(): Promise<string | null> {
    return settingsRepository.get(SETTING_KEYS.lastPaymentMethodId);
  },
};
