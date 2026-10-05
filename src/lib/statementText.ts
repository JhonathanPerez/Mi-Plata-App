import { MONTH_NAMES, MONTH_SHORT, WEEKDAY_SHORT, parseIsoDate } from './dates';
import type { IsoDate } from '@/types/models';

/** "mié 30 sep" */
export function formatDayMonth(iso: IsoDate): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** "septiembre" a partir del periodo "2026-09". */
export function periodMonthName(period: string): string {
  return MONTH_NAMES[Number(period.slice(5, 7)) - 1];
}

/** "hoy", "mañana", "en 10 días", "hace 3 días". */
export function relativeDays(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

/** Texto corto para la fecha límite de pago: "Pago hoy", "Vencido hace 3 días", "Hasta el mar 20 oct · en 10 días". */
export function dueLabel(dueDate: IsoDate, daysLeft: number): string {
  if (daysLeft < 0) return `Vencido hace ${-daysLeft} ${-daysLeft === 1 ? 'día' : 'días'}`;
  if (daysLeft === 0) return 'Pago hoy';
  return `Hasta el ${formatDayMonth(dueDate)} · ${relativeDays(daysLeft)}`;
}

/** Versión para la pastilla de una tarjeta de crédito y de un extracto: "Pago en 6 días · mar 6 oct" o "Pago mañana · jue 1 oct" (hoy y vencido se dicen igual que en `dueLabel`). */
export function dueShortLabel(dueDate: IsoDate, daysLeft: number): string {
  if (daysLeft <= 0) return dueLabel(dueDate, daysLeft);
  return `Pago ${relativeDays(daysLeft)} · ${formatDayMonth(dueDate)}`;
}

/** Fechas de un ciclo abierto en una línea corta: "Corta jue 8 oct · pago hasta mar 3 nov". */
export function cycleDatesLabel(cutDate: IsoDate, dueDate: IsoDate): string {
  return `Corta ${formatDayMonth(cutDate)} · pago hasta ${formatDayMonth(dueDate)}`;
}

/** Fechas de un extracto cerrado en una línea corta: "Corte mié 30 sep · pago hasta dom 20 oct". */
export function statementDatesLabel(cutDate: IsoDate, dueDate: IsoDate): string {
  return `Corte ${formatDayMonth(cutDate)} · pago hasta ${formatDayMonth(dueDate)}`;
}

/** Oscurece un color #RRGGBB (factor 0..1) para armar el degradado de una tarjeta. */
export function shadeColor(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const channel = (start: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(value.slice(start, start + 2), 16) * (1 - factor))))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
