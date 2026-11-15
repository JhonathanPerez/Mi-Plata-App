import { AUTO_BACKUP_KEEP, SETTING_KEYS } from '@/config/constants';
import { cloudBackupFileName, dateFromCloudBackupName, namesToPrune } from '@/lib/autoBackup';
import { encryptBackup, MIN_PASSWORD_LENGTH } from '@/lib/backupCrypto';
import { backupSecret } from '@/lib/backupSecret';
import { cloudFolder, type CloudFolder } from '@/lib/cloudFolder';
import { todayIso } from '@/lib/dates';
import { ValidationError } from '@/lib/errors';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { IsoDate } from '@/types/models';

/** `missing`: el cifrado está activado pero este teléfono no tiene la contraseña (por ejemplo, tras restaurar en uno nuevo). */
export type CloudEncryption = 'off' | 'on' | 'missing';

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
    return (await backupSecret.get()) ? 'on' : 'missing';
  },

  /** Define la contraseña de cifrado, o la cambia si ya existía. Sin ella no sale ninguna copia del teléfono. */
  async enableEncryption(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    await backupSecret.set(password);
    await settingsRepository.set(SETTING_KEYS.cloudBackupEncrypted, '1');
  },

  /** La contraseña, o un error que explica qué falta. Es lo único que deja salir una copia del teléfono. */
  async requirePassword(): Promise<string> {
    const encryption = await this.getEncryption();
    const password = await backupSecret.get();
    if (encryption === 'off') throw new Error('Define una contraseña de cifrado para sacar copias del teléfono.');
    if (encryption === 'missing' || !password) throw new Error('Falta la contraseña de cifrado en este teléfono. Defínela de nuevo.');
    return password;
  },

  /** Cifra el texto de una copia con la contraseña, para compartirla o subirla. Falla si no hay contraseña: nunca devuelve texto plano. */
  async encryptForExport(backupText: string): Promise<string> {
    return encryptBackup(backupText, await this.requirePassword());
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

  /** La fecha de la última copia enviada a la nube, cuando la hizo la tarea en segundo plano y la app se entera al abrirse. */
  async setLastDate(date: IsoDate): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.cloudBackupLast, date);
  },

  /** Fecha de la última copia enviada a la nube; null si todavía no se ha enviado ninguna. */
  getLastDate(): Promise<IsoDate | null> {
    return settingsRepository.get(SETTING_KEYS.cloudBackupLast);
  },

  /**
   * Envía el texto de una copia a la carpeta elegida, siempre cifrado, y conserva solo las últimas.
   * Sin contraseña no envía nada: falla en vez de subir la copia en texto plano.
   */
  async upload(backupText: string, today: IsoDate = todayIso()): Promise<void> {
    if (!(await cloudFolder.get())) throw new Error('No hay una carpeta de la nube elegida, o se perdió el acceso a ella.');
    const payload = await this.encryptForExport(backupText);
    const name = cloudBackupFileName(today);
    await cloudFolder.write(name, payload);
    await settingsRepository.set(SETTING_KEYS.cloudBackupLast, today);
    // Se borran las sobrantes después de escribir la nueva, y solo las nuestras: el resto de la carpeta no se toca.
    for (const old of namesToPrune(await cloudFolder.list(), AUTO_BACKUP_KEEP, dateFromCloudBackupName)) {
      if (old !== name) await cloudFolder.remove(old).catch(() => undefined);
    }
  },
};
