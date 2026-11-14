import { SETTING_KEYS } from '@/config/constants';
import { isValidTime, todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import {
  BACKUP_SCHEDULE_CHANGED, backupFileName, computeNextBackup, DEFAULT_AUTO_BACKUP_FREQUENCY, DEFAULT_AUTO_BACKUP_TIME, isAutoBackupFrequency, isBackupDue, namesToPrune,
  type AutoBackupFrequency,
} from '@/lib/autoBackup';
import { backupStore, type StoredBackup } from '@/lib/backupStore';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { IsoDate } from '@/types/models';
import { backupService } from './backupService';
import { cloudBackupService } from './cloudBackupService';

/** Evita dos copias a la vez cuando coinciden el arranque y el regreso a la app. */
let running: Promise<StoredBackup | null> | null = null;
let uploading: Promise<void> | null = null;

/** Le avisa al sincronizador (sin pantalla) que el horario cambió, para que lo recalcule. */
function announceScheduleChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BACKUP_SCHEDULE_CHANGED));
}

/** El texto de la copia de hoy: se reutiliza la que ya se guardó en el teléfono, o se crea una nueva. */
async function backupTextFor(today: IsoDate): Promise<string> {
  const name = backupFileName(today);
  if ((await backupStore.list()).some((item) => item.name === name)) return backupStore.read(name);
  return JSON.stringify(await backupService.createBackup());
}

async function createStoredBackup(today: IsoDate): Promise<StoredBackup | null> {
  const backup = await backupService.createBackup();
  const name = backupFileName(today);
  const text = JSON.stringify(backup);
  await backupStore.write(name, text);
  await settingsRepository.set(SETTING_KEYS.autoBackupLast, today);
  // Solo se borran las sobrantes después de escribir la nueva: nunca se queda la persona sin copia por un fallo a medias.
  for (const old of namesToPrune((await backupStore.list()).map((item) => item.name))) {
    await backupStore.remove(old).catch(() => undefined);
  }
  return { name, date: today, size: text.length };
}

export const autoBackupService = {
  isSupported(): boolean {
    return backupStore.isSupported();
  },

  async getFrequency(): Promise<AutoBackupFrequency> {
    const value = await settingsRepository.get(SETTING_KEYS.autoBackupFrequency);
    return isAutoBackupFrequency(value) ? value : DEFAULT_AUTO_BACKUP_FREQUENCY;
  },

  async setFrequency(frequency: AutoBackupFrequency): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.autoBackupFrequency, frequency);
    announceScheduleChange();
  },

  /** La hora del día (HH:MM) a la que se hacen las copias. */
  async getTime(): Promise<string> {
    const value = await settingsRepository.get(SETTING_KEYS.autoBackupTime);
    return value && isValidTime(value) ? value : DEFAULT_AUTO_BACKUP_TIME;
  },

  async setTime(time: string): Promise<void> {
    if (!isValidTime(time)) throw new Error('La hora no es válida.');
    await settingsRepository.set(SETTING_KEYS.autoBackupTime, time);
    announceScheduleChange();
  },

  /** Fecha de la última copia automática; null si todavía no se ha hecho ninguna. */
  async getLastDate(): Promise<IsoDate | null> {
    return settingsRepository.get(SETTING_KEYS.autoBackupLast);
  },

  list(): Promise<StoredBackup[]> {
    return backupStore.isSupported() ? backupStore.list() : Promise.resolve([]);
  },

  /** Hace una copia ahora, sin importar la frecuencia. */
  runNow(today: IsoDate = todayIso()): Promise<StoredBackup | null> {
    if (!backupStore.isSupported()) return Promise.resolve(null);
    running ??= createStoredBackup(today).finally(() => {
      running = null;
    });
    return running;
  },

  /** Hace la copia del teléfono solo si ya llegó la hora que toca. Devuelve si la hizo. */
  async runIfDue(now: Date = new Date()): Promise<boolean> {
    if (!backupStore.isSupported()) return false;
    const [frequency, last, time] = await Promise.all([this.getFrequency(), this.getLastDate(), this.getTime()]);
    if (!isBackupDue(frequency, last, time, now)) return false;
    return (await this.runNow(todayIso(now))) !== null;
  },

  /** Hace una copia ahora (del teléfono y, si hay carpeta elegida, también a la nube). Lo usa el botón «Hacer una copia ahora». */
  async backupEverywhere(today: IsoDate = todayIso()): Promise<{ sentToCloud: boolean }> {
    await this.runNow(today);
    const sentToCloud = (await cloudBackupService.getFolder()) !== null;
    if (sentToCloud) await this.uploadToCloud(today);
    return { sentToCloud };
  },

  /** Envía una copia a la carpeta de la nube ahora, sin importar la frecuencia. */
  uploadToCloud(today: IsoDate = todayIso()): Promise<void> {
    if (!cloudBackupService.isSupported()) return Promise.resolve();
    uploading ??= backupTextFor(today)
      .then((text) => cloudBackupService.upload(text, today))
      .then(() => cloudBackupService.clearError())
      // Se guarda el motivo para mostrarlo en la pantalla: así la persona sabe por qué la copia de la nube no ha llegado.
      .catch(async (error: unknown) => {
        await cloudBackupService.recordError(errorMessage(error)).catch(() => undefined);
        throw error;
      })
      .finally(() => {
        uploading = null;
      });
    return uploading;
  },

  /** Envía la copia a la nube solo si hay carpeta elegida y ya llegó la hora que toca. Devuelve si la envió. */
  async runCloudIfDue(now: Date = new Date()): Promise<boolean> {
    if (!cloudBackupService.isSupported()) return false;
    const [frequency, last, time, folder] = await Promise.all([this.getFrequency(), cloudBackupService.getLastDate(), this.getTime(), cloudBackupService.getFolder()]);
    if (!folder || !isBackupDue(frequency, last, time, now)) return false;
    await this.uploadToCloud(todayIso(now));
    return true;
  },

  /**
   * Milisegundos hasta la próxima copia (la del teléfono o la de la nube, la que llegue primero); 0 si ya está pendiente;
   * null si no hay nada programado. El sincronizador lo usa para despertarse a la hora elegida mientras la app esté abierta.
   */
  async getNextRunDelay(now: Date = new Date()): Promise<number | null> {
    const [frequency, last, time, cloudLast, folder] = await Promise.all([
      this.getFrequency(), this.getLastDate(), this.getTime(), cloudBackupService.getLastDate(), cloudBackupService.getFolder(),
    ]);
    const moments = [computeNextBackup(frequency, last, time, now), folder ? computeNextBackup(frequency, cloudLast, time, now) : null].filter(
      (moment): moment is Date => moment !== null,
    );
    if (moments.length === 0) return null;
    return Math.max(0, Math.min(...moments.map((moment) => moment.getTime())) - now.getTime());
  },

  /** El contenido de una copia guardada (para compartirla o restaurarla). */
  read(name: string): Promise<string> {
    return backupStore.read(name);
  },
};
