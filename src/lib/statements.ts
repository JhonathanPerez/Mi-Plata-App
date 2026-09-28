import { addMonths, periodFor, statementDates, type CycleRules, type Period } from './cycles';
import type { IsoDate } from '@/types/models';

/**
 * Arma los extractos de una tarjeta a partir de sus reglas, de las fechas fijadas a mano y de sus gastos.
 * Es puro: recibe todo lo que necesita y no toca la base de datos.
 */

export interface StatementExpense {
  id: string;
  date: IsoDate;
  amount: number;
  /** Fecha en que se pagó al banco; null = por pagar. */
  paidAt: IsoDate | null;
}

/** Fechas de un extracto que el usuario ajustó o que quedaron fijas al pagarlo. */
export interface FixedDates {
  cut: IsoDate;
  due: IsoDate;
}

export interface StatementView<T extends StatementExpense = StatementExpense> {
  period: Period;
  cutDate: IsoDate;
  dueDate: IsoDate;
  /** Sus fechas no salen de la regla: se ajustaron a mano o quedaron fijas al pagarlo. */
  fixed: boolean;
  /** Ya pasó su fecha de corte: no le entrarán más gastos y se puede pagar. */
  closed: boolean;
  expenses: T[];
  total: number;
  unpaidTotal: number;
  unpaidCount: number;
  paidTotal: number;
  paidCount: number;
  lastPaidAt: IsoDate | null;
}

export type FixedByPeriod = Record<Period, FixedDates>;

/** Fechas de un periodo: las fijadas si existen, si no las de la regla. */
export function makeDatesFor(rules: CycleRules, fixed: FixedByPeriod): (period: Period) => { cut: IsoDate; due: IsoDate } {
  return (period) => {
    const own = fixed[period];
    return own ? { cut: own.cut, due: own.due } : statementDates(rules, period);
  };
}

export function buildStatements<T extends StatementExpense>(input: {
  rules: CycleRules;
  fixed: FixedByPeriod;
  expenses: T[];
  today: IsoDate;
}): StatementView<T>[] {
  const { rules, fixed, expenses, today } = input;
  const datesFor = makeDatesFor(rules, fixed);
  const byPeriod = new Map<Period, T[]>();

  for (const expense of expenses) {
    const period = periodFor(expense.date, datesFor);
    const list = byPeriod.get(period);
    if (list) list.push(expense);
    else byPeriod.set(period, [expense]);
  }
  // El extracto en curso siempre se muestra, aunque todavía no tenga gastos.
  const current = periodFor(today, datesFor);
  if (!byPeriod.has(current)) byPeriod.set(current, []);

  const views: StatementView<T>[] = [];
  for (const [period, list] of byPeriod) {
    const dates = datesFor(period);
    const paid = list.filter((e) => e.paidAt !== null);
    const unpaid = list.filter((e) => e.paidAt === null);
    const paidDates = paid.map((e) => e.paidAt as IsoDate).sort();
    views.push({
      period,
      cutDate: dates.cut,
      dueDate: dates.due,
      fixed: Boolean(fixed[period]),
      closed: today > dates.cut,
      expenses: [...list].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
      total: sum(list),
      unpaidTotal: sum(unpaid),
      unpaidCount: unpaid.length,
      paidTotal: sum(paid),
      paidCount: paid.length,
      lastPaidAt: paidDates.length ? paidDates[paidDates.length - 1] : null,
    });
  }
  return views.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
}

const sum = (list: StatementExpense[]): number => list.reduce((total, e) => total + e.amount, 0);

/** Extractos ya cerrados que todavía tienen gastos por pagar, del más viejo al más nuevo. */
export function payableStatements<T extends StatementExpense>(views: StatementView<T>[]): StatementView<T>[] {
  return views.filter((v) => v.closed && v.unpaidCount > 0).sort((a, b) => (a.period < b.period ? -1 : 1));
}

/** El extracto abierto (el que aún recibe gastos), si existe. */
export function openStatement<T extends StatementExpense>(views: StatementView<T>[]): StatementView<T> | null {
  return views.filter((v) => !v.closed).sort((a, b) => (a.period < b.period ? -1 : 1))[0] ?? null;
}

export interface MovedExpense {
  expense: StatementExpense;
  from: Period;
  to: Period;
}

/** Gastos que cambian de extracto si las fechas pasan de `before` a `after`. */
export function diffAssignments(
  expenses: StatementExpense[],
  before: (period: Period) => { cut: IsoDate },
  after: (period: Period) => { cut: IsoDate },
): MovedExpense[] {
  const moved: MovedExpense[] = [];
  for (const expense of expenses) {
    const from = periodFor(expense.date, before);
    const to = periodFor(expense.date, after);
    if (from !== to) moved.push({ expense, from, to });
  }
  return moved;
}

/**
 * Valida las fechas de un extracto ajustado a mano: el pago va después del corte, y el corte queda después
 * del corte del extracto anterior y antes del siguiente (para que ningún gasto quede sin extracto).
 * Devuelve un mensaje de error o null.
 */
export function validateStatementDates(input: {
  period: Period;
  cut: IsoDate;
  due: IsoDate;
  datesFor: (period: Period) => { cut: IsoDate; due: IsoDate };
}): string | null {
  const { period, cut, due, datesFor } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cut) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Elige fechas válidas.';
  if (due <= cut) return 'La fecha de pago debe ser posterior al corte.';
  const previous = datesFor(addMonths(period, -1)).cut;
  const next = datesFor(addMonths(period, 1)).cut;
  if (cut <= previous) return 'El corte debe ser posterior al del extracto anterior.';
  if (cut >= next) return 'El corte debe ser anterior al del extracto siguiente.';
  return null;
}
