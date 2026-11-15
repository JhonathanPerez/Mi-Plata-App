import { AUTO_BACKUP_KEEP } from '@/config/constants';
import type { IsoDate } from '@/types/models';
import { addDays, formatLongDate, formatTime, formatWeekdayDate, isValidIsoDate, isValidTime, parseIsoDate, todayIso } from './dates';

export type AutoBackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';

export const AUTO_BACKUP_OPTIONS: Array<{ value: AutoBackupFrequency; label: string }> = [
  { value: 'off', label: 'Apagada' },
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

/** Sin que la persona elija nada, las copias son semanales y a las 9:00 p. m. */
export const DEFAULT_AUTO_BACKUP_FREQUENCY: AutoBackupFrequency = 'weekly';
export const DEFAULT_AUTO_BACKUP_TIME = '21:00';

/** Aviso interno (de la pantalla al sincronizador) para que se recalcule el horario cuando la persona lo cambia. */
export const BACKUP_SCHEDULE_CHANGED = 'miplata:backup-schedule-changed';

const FREQUENCY_DAYS: Record<Exclude<AutoBackupFrequency, 'off'>, number> = { daily: 1, weekly: 7, monthly: 30 };

/** Cada cuántos días se hace la copia según la frecuencia; null si está apagada. */
export function backupIntervalDays(frequency: AutoBackupFrequency): number | null {
  return frequency === 'off' ? null : FREQUENCY_DAYS[frequency];
}

/** Cómo le fue a la copia en segundo plano la última vez que se ejecutó (lo informa el plugin de Android). */
export interface BackgroundRunInfo {
  lastRunAt?: number;
  lastOk?: boolean;
  lastError?: string;
}

export function isAutoBackupFrequency(value: unknown): value is AutoBackupFrequency {
  return value === 'off' || value === 'daily' || value === 'weekly' || value === 'monthly';
}

/**
 * El momento en que toca la próxima copia: la fecha de la última más el intervalo (1, 7 o 30 días), a la hora elegida.
 * Sin copia previa (o con un dato dañado) toca ya: la primera copia se hace apenas se activa. Apagada = null.
 * Si el momento ya pasó (la app estaba cerrada), la copia está pendiente y se hace en cuanto se abre.
 */
export function computeNextBackup(frequency: AutoBackupFrequency, lastDate: IsoDate | null, time: string, now: Date): Date | null {
  if (frequency === 'off') return null;
  if (!lastDate || !isValidIsoDate(lastDate)) return now;
  const [hour, minute] = (isValidTime(time) ? time : DEFAULT_AUTO_BACKUP_TIME).split(':').map(Number);
  const next = parseIsoDate(addDays(lastDate, FREQUENCY_DAYS[frequency]));
  next.setHours(hour, minute, 0, 0);
  return next;
}

/** ¿Ya toca hacer una copia? */
export function isBackupDue(frequency: AutoBackupFrequency, lastDate: IsoDate | null, time: string, now: Date): boolean {
  const next = computeNextBackup(frequency, lastDate, time, now);
  return next !== null && next.getTime() <= now.getTime();
}

/**
 * Aviso cuando la copia de la nube va atrasada: ya tocaba enviarla y no ha llegado (sin conexión, carpeta sin acceso…).
 * null si todo va al día o las copias están apagadas.
 */
export function describeCloudLag(frequency: AutoBackupFrequency, cloudLast: IsoDate | null, time: string, now: Date): string | null {
  if (!isBackupDue(frequency, cloudLast, time, now)) return null;
  return cloudLast && isValidIsoDate(cloudLast)
    ? `La última copia que llegó a la nube fue el ${formatLongDate(cloudLast)}. Hay una pendiente: se vuelve a intentar al abrir la app.`
    : 'Todavía no ha llegado ninguna copia a la nube. Se intenta al abrir la app.';
}

/** El texto «Próxima copia de seguridad…» de la pantalla; null si las copias están apagadas. */
export function describeNextBackup(frequency: AutoBackupFrequency, lastDate: IsoDate | null, time: string, now: Date): string | null {
  const next = computeNextBackup(frequency, lastDate, time, now);
  if (next === null) return null;
  if (next.getTime() <= now.getTime()) return 'Próxima copia de seguridad: pendiente, se hace en cuanto abras la app.';
  const date = todayIso(next);
  const today = todayIso(now);
  const when = date === today ? ' (hoy)' : date === addDays(today, 1) ? ' (mañana)' : '';
  const hour = formatTime(isValidTime(time) ? time : DEFAULT_AUTO_BACKUP_TIME);
  // «a. m.» y «p. m.» ya terminan en punto: no se duplica.
  const text = `Próxima copia de seguridad: ${formatWeekdayDate(date, now)} a las ${hour}${when}`;
  return text.endsWith('.') ? text : `${text}.`;
}

const FILE_NAME = /^MiPlata_auto_(\d{4}-\d{2}-\d{2})\.json$/;

/** Una copia por día: si se hace otra el mismo día, reemplaza a la anterior. */
export function backupFileName(date: IsoDate): string {
  return `MiPlata_auto_${date}.json`;
}

const CLOUD_FILE_NAME = /^MiPlata_nube_(\d{4}-\d{2}-\d{2})\.json$/;

/** Nombre de la copia en la carpeta de la nube: otro prefijo, para no confundirla con las copias locales. */
export function cloudBackupFileName(date: IsoDate): string {
  return `MiPlata_nube_${date}.json`;
}

export function dateFromCloudBackupName(name: string): IsoDate | null {
  const match = CLOUD_FILE_NAME.exec(name);
  return match && isValidIsoDate(match[1]) ? match[1] : null;
}

/** La fecha de una copia según su nombre de archivo; null si el archivo no es una copia automática. */
export function dateFromBackupName(name: string): IsoDate | null {
  const match = FILE_NAME.exec(name);
  return match && isValidIsoDate(match[1]) ? match[1] : null;
}

/**
 * Cuáles archivos borrar para conservar solo las `keep` copias más recientes. Ignora lo que no sea una copia propia
 * (`dateOf` dice cómo leer la fecha del nombre: copias locales por defecto, o las de la nube).
 */
export function namesToPrune(
  names: string[],
  keep: number = AUTO_BACKUP_KEEP,
  dateOf: (name: string) => IsoDate | null = dateFromBackupName,
): string[] {
  return names
    .filter((name) => dateOf(name) !== null)
    .sort((a, b) => (dateOf(b) as string).localeCompare(dateOf(a) as string))
    .slice(keep);
}
