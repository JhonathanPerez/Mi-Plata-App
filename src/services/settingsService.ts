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

  getLastPaymentMethodId(): Promise<string | null> {
    return settingsRepository.get(SETTING_KEYS.lastPaymentMethodId);
  },
};
