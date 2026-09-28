import type { IsoDate, YearMonth } from '@/types/models';
import { capitalize } from './text';

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Convierte un Date a "YYYY-MM-DD" usando la zona horaria LOCAL (nunca UTC). */
export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function parseIsoDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function toYearMonth(value: IsoDate | Date): YearMonth {
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
  return value.slice(0, 7);
}

export function currentYearMonth(now: Date = new Date()): YearMonth {
  return toYearMonth(now);
}

export function addMonths(yearMonth: YearMonth, delta: number): YearMonth {
  const [year, month] = yearMonth.split('-').map(Number);
  return toYearMonth(new Date(year, month - 1 + delta, 1));
}

export function daysInMonth(yearMonth: YearMonth): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function monthRange(yearMonth: YearMonth): { from: IsoDate; to: IsoDate } {
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${pad(daysInMonth(yearMonth))}` };
}

export function yearRange(year: number): { from: IsoDate; to: IsoDate } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function addDays(iso: IsoDate, delta: number): IsoDate {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

/** Diferencia en días calendario (b - a), inmune a cambios de horario. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Días transcurridos del mes (para promediar). Meses pasados: todos; futuros: 1. */
export function elapsedDaysInMonth(yearMonth: YearMonth, now: Date = new Date()): number {
  const current = currentYearMonth(now);
  if (yearMonth < current) return daysInMonth(yearMonth);
  if (yearMonth === current) return now.getDate();
  return 1;
}

/** "Septiembre 2026" */
export function formatMonthTitle(yearMonth: YearMonth): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${capitalize(MONTH_NAMES[month - 1])} ${year}`;
}

/** "19 septiembre 2026" */
export function formatLongDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** "19 sep" */
export function formatShortDate(iso: IsoDate): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTH_SHORT[month - 1]}`;
}

/** "19/09/2026" */
export function formatNumericDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Encabezado de grupo en el historial: Hoy, Ayer o "sáb 19 sep". */
export function formatDayHeading(iso: IsoDate, now: Date = new Date()): string {
  const today = todayIso(now);
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const date = parseIsoDate(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  const base = `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
  return sameYear ? base : `${base} ${date.getFullYear()}`;
}

/** "14:05" -> "2:05 p. m." */
export function formatTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad(minute)} ${suffix}`;
}

export function currentTimeHHMM(now: Date = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
