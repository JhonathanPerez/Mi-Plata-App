import type { IsoDate } from '@/types/models';

/**
 * Reglas de corte y pago de una tarjeta de crédito.
 *
 * Una regla puede ser un día fijo del mes ("el 20"), el último día ("fin de mes") o el n-ésimo día de la
 * semana ("el segundo viernes"). Cada extracto se identifica por su "periodo" (YYYY-MM): el mes al que se
 * aplica la regla de corte. Ejemplo con corte "último día" y pago "día 20 del mes siguiente":
 * el extracto 2026-09 corta el 30 sep 2026 y se paga hasta el 20 oct 2026.
 *
 * Todo es puro (sin base de datos ni zona horaria): las fechas son texto YYYY-MM-DD calculadas en UTC.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo
export type Ordinal = 1 | 2 | 3 | 4 | 'last';
export type CycleRule =
  | { kind: 'day'; day: number }
  | { kind: 'last' }
  | { kind: 'nth'; nth: Ordinal; weekday: Weekday };
/** Qué hacer si la fecha de pago cae en sábado o domingo. */
export type WeekendPolicy = 'keep' | 'before' | 'after';
export type Period = string; // YYYY-MM

export interface CycleRules {
  cut: CycleRule;
  due: CycleRule;
  /** true: el pago es en el mes siguiente al del corte. */
  dueNextMonth: boolean;
  weekend: WeekendPolicy;
}

export interface StatementDates {
  cut: IsoDate;
  due: IsoDate;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const daysInMonth = (year: number, month0: number): number => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
const fromIso = (iso: IsoDate): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (date: Date): IsoDate => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export function weekdayOf(date: IsoDate): Weekday {
  return fromIso(date).getUTCDay() as Weekday;
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const d = fromIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function addMonths(period: Period, months: number): Period {
  const [year, month] = period.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Fecha que resulta de aplicar la regla al mes del periodo dado. */
export function resolveRule(rule: CycleRule, period: Period): IsoDate {
  const [year, month] = period.split('-').map(Number);
  const month0 = month - 1;
  const last = daysInMonth(year, month0);

  if (rule.kind === 'last') return `${year}-${pad(month)}-${pad(last)}`;
  if (rule.kind === 'day') return `${year}-${pad(month)}-${pad(Math.min(rule.day, last))}`;

  if (rule.nth === 'last') {
    for (let day = last; day >= 1; day -= 1) {
      if (new Date(Date.UTC(year, month0, day)).getUTCDay() === rule.weekday) return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  let seen = 0;
  for (let day = 1; day <= last; day += 1) {
    if (new Date(Date.UTC(year, month0, day)).getUTCDay() === rule.weekday) {
      seen += 1;
      if (seen === rule.nth) return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  // Cualquier mes tiene al menos 4 de cada día de la semana, así que aquí no se llega con reglas válidas.
  throw new Error('La regla no produce una fecha en este mes.');
}

/** Mueve un sábado o domingo al viernes anterior o al lunes siguiente, según la política elegida. */
export function adjustForWeekend(date: IsoDate, policy: WeekendPolicy): IsoDate {
  if (policy === 'keep') return date;
  const day = weekdayOf(date);
  if (day === 6) return addDaysIso(date, policy === 'before' ? -1 : 2);
  if (day === 0) return addDaysIso(date, policy === 'before' ? -2 : 1);
  return date;
}

/** Fechas de corte y de pago del extracto de un periodo, según las reglas de la tarjeta. */
export function statementDates(rules: CycleRules, period: Period): StatementDates {
  const cut = resolveRule(rules.cut, period);
  const dueBase = resolveRule(rules.due, rules.dueNextMonth ? addMonths(period, 1) : period);
  return { cut, due: adjustForWeekend(dueBase, rules.weekend) };
}

/**
 * Extracto al que pertenece un gasto: el primero cuya fecha de corte es igual o posterior al día del gasto
 * (una compra hecha el mismo día del corte entra al extracto que cierra ese día).
 * `datesFor` permite tener en cuenta fechas ajustadas a mano.
 */
export function periodFor(date: IsoDate, datesFor: (period: Period) => { cut: IsoDate }): Period {
  const base = date.slice(0, 7);
  for (let offset = -2; offset <= 3; offset += 1) {
    const period = addMonths(base, offset);
    if (datesFor(period).cut >= date) return period;
  }
  return addMonths(base, 1);
}

// ---------- Validación ----------

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

export function isCycleRule(value: unknown): value is CycleRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  if (rule.kind === 'last') return true;
  if (rule.kind === 'day') return isInt(rule.day) && rule.day >= 1 && rule.day <= 31;
  if (rule.kind === 'nth') {
    const okNth = rule.nth === 'last' || (isInt(rule.nth) && rule.nth >= 1 && rule.nth <= 4);
    return okNth && isInt(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6;
  }
  return false;
}

export function isCycleRules(value: unknown): value is CycleRules {
  if (typeof value !== 'object' || value === null) return false;
  const rules = value as Record<string, unknown>;
  return (
    isCycleRule(rules.cut) &&
    isCycleRule(rules.due) &&
    typeof rules.dueNextMonth === 'boolean' &&
    (rules.weekend === 'keep' || rules.weekend === 'before' || rules.weekend === 'after')
  );
}

/** Lee las reglas guardadas como texto JSON. Devuelve null si no hay o están dañadas. */
export function parseCycleRules(text: string | null | undefined): CycleRules | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isCycleRules(value) ? value : null;
  } catch {
    return null;
  }
}

export function serializeCycleRules(rules: CycleRules): string {
  return JSON.stringify({ cut: rules.cut, due: rules.due, dueNextMonth: rules.dueNextMonth, weekend: rules.weekend });
}

/**
 * Comprueba que las reglas tienen sentido: en todos los meses de un par de años el pago debe caer DESPUÉS
 * del corte (por ejemplo, corte el 25 y pago el 10 "del mismo mes" no es posible).
 */
export function validateCycleRules(rules: CycleRules): string | null {
  if (!isCycleRules(rules)) return 'Las fechas del ciclo no son válidas.';
  for (let i = 0; i < 24; i += 1) {
    const period = addMonths('2026-01', i);
    const { cut, due } = statementDates(rules, period);
    if (due <= cut) {
      return rules.dueNextMonth
        ? 'La fecha de pago debe ser posterior al corte.'
        : 'Con esas fechas el pago cae antes del corte. Elige «mes siguiente» para el pago.';
    }
  }
  return null;
}

// ---------- Texto para mostrar ----------

const ORDINALS: Record<string, string> = { '1': 'primer', '2': 'segundo', '3': 'tercer', '4': 'cuarto', last: 'último' };
export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** "El día 20", "El último día", "El segundo viernes". */
export function describeRule(rule: CycleRule): string {
  if (rule.kind === 'last') return 'El último día';
  if (rule.kind === 'day') return `El día ${rule.day}`;
  return `El ${ORDINALS[String(rule.nth)]} ${WEEKDAY_NAMES[rule.weekday]}`;
}

export function describeCut(rules: CycleRules): string {
  return `${describeRule(rules.cut)} de cada mes`;
}

export function describeDue(rules: CycleRules): string {
  return `${describeRule(rules.due)} ${rules.dueNextMonth ? 'del mes siguiente' : 'del mismo mes'}`;
}

export const WEEKEND_LABELS: Record<WeekendPolicy, string> = {
  keep: 'Mantener la fecha',
  before: 'Pagar el día hábil anterior',
  after: 'Pagar el día hábil siguiente',
};
