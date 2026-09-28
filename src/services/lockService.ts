import { SETTING_KEYS } from '@/config/constants';
import { notifyDataChanged } from '@/lib/dataBus';
import { DEFAULT_LOCK_DELAY, normalizeLockDelay, type LockDelay } from '@/lib/lockPolicy';
import { settingsRepository } from '@/repositories/settingsRepository';

export interface LockConfig {
  enabled: boolean;
  delaySeconds: LockDelay;
}

export const lockService = {
  /** El bloqueo viene ACTIVADO por defecto: solo se apaga si el usuario lo desactiva. */
  async getConfig(): Promise<LockConfig> {
    const [enabled, delay] = await Promise.all([
      settingsRepository.get(SETTING_KEYS.biometricLock),
      settingsRepository.get(SETTING_KEYS.lockDelaySeconds),
    ]);
    return { enabled: enabled !== '0', delaySeconds: delay === null ? DEFAULT_LOCK_DELAY : normalizeLockDelay(delay) };
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.biometricLock, enabled ? '1' : '0');
    notifyDataChanged();
  },

  async setDelay(delaySeconds: LockDelay): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.lockDelaySeconds, String(delaySeconds));
    notifyDataChanged();
  },
};
