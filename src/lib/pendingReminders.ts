/**
 * Recordatorio periódico de gastos registrados automáticamente que siguen sin categoría.
 * Es puro (sin plugin ni base de datos): recibe cuántos pendientes hay y devuelve los avisos a programar.
 */

export interface PendingReminderSettings {
  enabled: boolean;
  /** Cada cuántos minutos se repite el aviso mientras haya pendientes. */
  intervalMinutes: number;
}

// Android nunca entrega avisos "con la pantalla apagada" más seguido que cada 9 minutos por app, sin
// importar los permisos que se activen (es una regla fija del sistema, documentada por Google). Pedir
// menos que eso no se cumple: el primer aviso llega, y los siguientes se pierden hasta que se abre la app
// y la "reactiva" un rato. Se deja algo de margen sobre esos 9 minutos.
export const MIN_INTERVAL_MINUTES = 15;
/** Máximo: 7 días. */
export const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
export const DEFAULT_PENDING_REMINDER_SETTINGS: PendingReminderSettings = { enabled: false, intervalMinutes: 240 };

/** Opciones rápidas del selector (minutos). Cualquier otro valor se elige con «Otro». */
export const INTERVAL_PRESETS = [30, 60, 120, 240, 480, 720, 1440] as const;

/** Horas en las que NO se avisa (de 10 pm a 8 am): un aviso que cae ahí se pasa a las 8:00 am. */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;

/** Avisos programados por adelantado como máximo; se reprograman cada vez que se abre la app. */
export const MAX_PLANNED = 40;
/** Y nunca más allá de este horizonte: si no abres la app en una semana, los avisos se detienen. */
const HORIZON_MS = 7 * 24 * 3_600_000;

/** Ids reservados (por encima de los de pagos, que llegan hasta ~2.000.001.000, y de los de captura). */
export const PENDING_REMINDER_ID_BASE = 2_100_000_000;

export function normalizeInterval(value: unknown): number {
  const minutes = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
    return DEFAULT_PENDING_REMINDER_SETTINGS.intervalMinutes;
  }
  return minutes;
}

export function isPendingReminderId(id: number): boolean {
  return id >= PENDING_REMINDER_ID_BASE;
}

/** «30 min», «4 h», «1 día», «1 h 30 min». */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 día' : `${days} días`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function isQuiet(date: Date): boolean {
  const hour = date.getHours();
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/** Si `date` cae en horas de silencio, la pasa a las 8:00 am siguientes. */
function outOfQuiet(date: Date): Date {
  if (!isQuiet(date)) return date;
  const next = new Date(date);
  if (date.getHours() >= QUIET_FROM_HOUR) next.setDate(next.getDate() + 1);
  next.setHours(QUIET_UNTIL_HOUR, 0, 0, 0);
  return next;
}

export interface PlannedPendingReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * Los avisos que deben quedar programados: uno cada `intervalMinutes` a partir de "ahora", sin caer de noche.
 * No lleva la cantidad de pendientes en el texto a propósito: el aviso se programa de antemano y, si llegan más
 * gastos con la app cerrada, un número escrito hoy quedaría desactualizado.
 */
export function planPendingReminders(input: { pendingCount: number; settings: PendingReminderSettings; now?: Date }): PlannedPendingReminder[] {
  const { pendingCount, settings } = input;
  const now = input.now ?? new Date();
  if (!settings.enabled || pendingCount <= 0) return [];

  const stepMs = normalizeInterval(settings.intervalMinutes) * 60_000;
  const limit = now.getTime() + HORIZON_MS;
  const plan: PlannedPendingReminder[] = [];
  let cursor = now;
  while (plan.length < MAX_PLANNED) {
    const at = outOfQuiet(new Date(cursor.getTime() + stepMs));
    if (at.getTime() > limit) break;
    plan.push({
      id: PENDING_REMINDER_ID_BASE + plan.length,
      at,
      title: 'Gastos por categorizar',
      body: 'Tienes gastos registrados automáticamente sin categoría. Toca para asignarlos.',
    });
    cursor = at;
  }
  return plan;
}
