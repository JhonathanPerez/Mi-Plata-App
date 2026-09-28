import { parseIsoDate } from './dates';
import { formatCOP } from './money';
import { formatDayMonth, periodMonthName } from './statementText';
import type { IsoDate } from '@/types/models';

/**
 * Qué avisos del teléfono programar antes de las fechas límite de pago de las tarjetas.
 * Es puro (sin plugin ni base de datos): recibe los extractos y devuelve la lista de avisos, y por eso se prueba a fondo.
 */

/** Con cuántos días de anticipación se puede avisar (0 = el mismo día del vencimiento). */
export const LEAD_DAY_OPTIONS = [3, 1, 0] as const;
export const HOUR_OPTIONS = [8, 9, 12, 18] as const;

export interface ReminderSettings {
  enabled: boolean;
  /** Días antes del vencimiento, de mayor a menor. Nunca vacío. */
  leadDays: number[];
  /** Hora local a la que llega el aviso (0-23). */
  hour: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: false, leadDays: [1, 0], hour: 9 };

export function normalizeLeadDays(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const allowed = new Set<number>(LEAD_DAY_OPTIONS);
  // Ojo: Number('') es 0 ("el mismo día"), así que los textos vacíos se descartan antes de convertir.
  const days = [...new Set(raw.filter((item) => String(item).trim() !== '').map((item) => Number(item)).filter((n) => Number.isInteger(n) && allowed.has(n)))];
  return days.length > 0 ? days.sort((a, b) => b - a) : [...DEFAULT_REMINDER_SETTINGS.leadDays];
}

export function normalizeHour(value: unknown): number {
  const hour = Number(value);
  return (HOUR_OPTIONS as readonly number[]).includes(hour) ? hour : DEFAULT_REMINDER_SETTINGS.hour;
}

export interface ReminderStatement {
  period: string;
  dueDate: IsoDate;
  /** Lo que falta por pagar de este extracto. */
  unpaidTotal: number;
  /** false = el ciclo sigue abierto (el monto final aún puede crecer). */
  closed: boolean;
}

export interface ReminderCard {
  methodId: string;
  name: string;
  /** Extractos con algo por pagar: los cerrados y el ciclo abierto. */
  statements: ReminderStatement[];
}

export interface PlannedReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
  methodId: string;
  period: string;
  leadDays: number;
}

/** Los avisos programados de un extracto pasan de este margen respecto a "ahora" o se descartan. */
const MIN_FUTURE_MS = 60_000;
const MAX_REMINDERS = 60;

/** Identificador estable (entero positivo de 31 bits) para poder reemplazar el mismo aviso sin duplicarlo. */
export function reminderId(methodId: string, period: string, leadDays: number): number {
  let hash = 0x811c9dc5;
  const text = `${methodId}|${period}|${leadDays}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 2_000_000_000) + 1000; // 1..999 quedan libres para avisos de prueba
}

function whenText(leadDays: number, dueDate: IsoDate): string {
  if (leadDays === 0) return 'hoy';
  if (leadDays === 1) return 'mañana';
  return `en ${leadDays} días (${formatDayMonth(dueDate)})`;
}

function message(card: ReminderCard, statement: ReminderStatement, leadDays: number): { title: string; body: string } {
  const when = whenText(leadDays, statement.dueDate);
  const title = leadDays === 0 ? `Hoy vence el pago de ${card.name}` : `Pago de ${card.name}`;
  if (statement.closed) {
    return {
      title,
      body: `Tu extracto de ${periodMonthName(statement.period)} (${formatCOP(statement.unpaidTotal)}) vence ${when}.`,
    };
  }
  // El ciclo sigue abierto: el monto final puede cambiar, así que no se promete una cifra.
  return { title, body: `El pago de ${card.name} vence ${when}. Revisa cuánto debes antes de pagar.` };
}

/** Fecha y hora local (a la hora `hour`) que quedan `leadDays` días antes del vencimiento. */
function reminderMoment(dueDate: IsoDate, leadDays: number, hour: number): Date {
  const moment = parseIsoDate(dueDate);
  moment.setDate(moment.getDate() - leadDays);
  moment.setHours(hour, 0, 0, 0);
  return moment;
}

export function planReminders(input: { cards: ReminderCard[]; settings: ReminderSettings; now: Date }): PlannedReminder[] {
  const { cards, settings, now } = input;
  if (!settings.enabled) return [];

  const planned: PlannedReminder[] = [];
  for (const card of cards) {
    for (const statement of card.statements) {
      if (statement.unpaidTotal <= 0) continue;
      for (const leadDays of settings.leadDays) {
        const at = reminderMoment(statement.dueDate, leadDays, settings.hour);
        if (at.getTime() < now.getTime() + MIN_FUTURE_MS) continue;
        const { title, body } = message(card, statement, leadDays);
        planned.push({ id: reminderId(card.methodId, statement.period, leadDays), at, title, body, methodId: card.methodId, period: statement.period, leadDays });
      }
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}

// Con espacios duros para que "8 a. m." nunca se parta en dos líneas.
export const HOUR_LABELS: Record<number, string> = { 8: '8\u00a0a.\u00a0m.', 9: '9\u00a0a.\u00a0m.', 12: '12\u00a0m.', 18: '6\u00a0p.\u00a0m.' };
export const LEAD_LABELS: Record<number, string> = { 3: '3 días antes', 1: '1 día antes', 0: 'El mismo día' };
