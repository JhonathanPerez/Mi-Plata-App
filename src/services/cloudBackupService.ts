import { AUTO_BACKUP_KEEP, SETTING_KEYS } from '@/config/constants';
import { cloudBackupFileName, dateFromCloudBackupName, namesToPrune } from '@/lib/autoBackup';
import { encryptBackup, MIN_PASSWORD_LENGTH } from '@/lib/backupCrypto';
import { cloudFolder, type CloudFolder } from '@/lib/cloudFolder';
import { todayIso } from '@/lib/dates';
import { ValidationError } from '@/lib/errors';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { IsoDate } from '@/types/models';

/** `missing`: el cifrado está activado pero este teléfono no tiene la contraseña (por ejemplo, tras restaurar en uno nuevo). */
export type CloudEncryption = 'off' | 'on' | 'missing';

const PASSWORD_KEY = 'miplata.cloudBackupPassword';

/**
 * La contraseña vive solo en el almacenamiento privado de la app (no en la base de datos): si estuviera allí, iría dentro
 * de cada copia de seguridad, junto a lo que protege. La carpeta de la nube nunca la recibe.
 */
function readPassword(): string | null {
  try {
    return localStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}

export const cloudBackupService = {
  isSupported(): boolean {
    return cloudFolder.isSupported();
  },

  /** La carpeta elegida, o null si no hay (o se perdió el acceso a ella). */
  getFolder(): Promise<CloudFolder | null> {
    return cloudFolder.get();
  },

  /** Abre el selector de carpetas de Android. Devuelve null si la persona no eligió ninguna. */
  pickFolder(): Promise<CloudFolder | null> {
    return cloudFolder.pick();
  },

  clearFolder(): Promise<void> {
    return cloudFolder.clear();
  },

  async getEncryption(): Promise<CloudEncryption> {
    if ((await settingsRepository.get(SETTING_KEYS.cloudBackupEncrypted)) !== '1') return 'off';
    return readPassword() ? 'on' : 'missing';
  },

  /** Activa el cifrado, o cambia la contraseña si ya estaba activo. */
  async enableEncryption(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    localStorage.setItem(PASSWORD_KEY, password);
    await settingsRepository.set(SETTING_KEYS.cloudBackupEncrypted, '1');
  },

  async disableEncryption(): Promise<void> {
    try {
      localStorage.removeItem(PASSWORD_KEY);
    } catch {
      // Sin almacenamiento no había contraseña guardada.
    }
    await settingsRepository.set(SETTING_KEYS.cloudBackupEncrypted, '0');
  },

  /** Por qué falló el último envío; null si el último salió bien (o todavía no se ha intentado). */
  async getLastError(): Promise<string | null> {
    return (await settingsRepository.get(SETTING_KEYS.cloudBackupError)) || null;
  },

  async recordError(message: string): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.cloudBackupError, message);
  },

  async clearError(): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.cloudBackupError, '');
  },

  /** Fecha de la última copia enviada a la nube; null si todavía no se ha enviado ninguna. */
  getLastDate(): Promise<IsoDate | null> {
    return settingsRepository.get(SETTING_KEYS.cloudBackupLast);
  },

  /**
   * Envía el texto de una copia a la carpeta elegida (cifrado si así se configuró) y conserva solo las últimas.
   * Nunca envía sin cifrar si el cifrado está activado: sin contraseña, falla.
   */
  async upload(backupText: string, today: IsoDate = todayIso()): Promise<void> {
    if (!(await cloudFolder.get())) throw new Error('No hay una carpeta de la nube elegida, o se perdió el acceso a ella.');
    const encryption = await this.getEncryption();
    const password = readPassword();
    if (encryption === 'missing' || (encryption === 'on' && !password)) {
      throw new Error('Falta la contraseña de cifrado en este teléfono. Defínela de nuevo para enviar copias.');
    }
    const payload = encryption === 'on' && password ? await encryptBackup(backupText, password) : backupText;
    const name = cloudBackupFileName(today);
    await cloudFolder.write(name, payload);
    await settingsRepository.set(SETTING_KEYS.cloudBackupLast, today);
    // Se borran las sobrantes después de escribir la nueva, y solo las nuestras: el resto de la carpeta no se toca.
    for (const old of namesToPrune(await cloudFolder.list(), AUTO_BACKUP_KEEP, dateFromCloudBackupName)) {
      if (old !== name) await cloudFolder.remove(old).catch(() => undefined);
    }
  },
};
