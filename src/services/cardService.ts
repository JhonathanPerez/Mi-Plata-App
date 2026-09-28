import { notifyDataChanged } from '@/lib/dataBus';
import { diffDays, isValidIsoDate, todayIso } from '@/lib/dates';
import { ValidationError } from '@/lib/errors';
import { nowIso } from '@/lib/ids';
import { periodFor, type Period } from '@/lib/cycles';
import {
  buildStatements,
  diffAssignments,
  makeDatesFor,
  openStatement,
  payableStatements,
  validateStatementDates,
  type FixedByPeriod,
  type MovedExpense,
  type StatementExpense,
  type StatementView,
} from '@/lib/statements';
import { cardCycleRepository, type StoredStatementDates } from '@/repositories/cardCycleRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import type { Expense, IsoDate, PaymentMethod } from '@/types/models';

export interface NextDue {
  period: Period;
  date: IsoDate;
  amount: number;
  /** Días que faltan (negativo si ya venció). */
  daysLeft: number;
  overdue: boolean;
}

export interface CardOverview {
  method: PaymentMethod;
  /** false si la tarjeta todavía no tiene reglas de corte y pago. */
  configured: boolean;
  statements: CardStatement[];
  /** Extractos ya cerrados con gastos por pagar, del más viejo al más nuevo. */
  payable: CardStatement[];
  open: CardStatement | null;
  /** Todo lo que se debe en esta tarjeta (extractos cerrados + ciclo abierto). */
  unpaidTotal: number;
  unpaidCount: number;
  /** El pago más próximo (o vencido) entre los extractos cerrados. */
  nextDue: NextDue | null;
}

/** Extracto con los gastos completos (para mostrar categoría y descripción). */
export type CardStatement = StatementView<Expense>;

function toFixed(rows: StoredStatementDates[]): FixedByPeriod {
  const fixed: FixedByPeriod = {};
  for (const row of rows) fixed[row.period] = { cut: row.cutDate, due: row.dueDate };
  return fixed;
}

/** Arma la vista de una tarjeta a partir de sus datos. Pura: se puede probar sin base de datos. */
export function computeOverview(input: {
  method: PaymentMethod;
  expenses: Expense[];
  fixedRows: StoredStatementDates[];
  today: IsoDate;
}): CardOverview {
  const { method, expenses, fixedRows, today } = input;
  const unpaid = expenses.filter((e) => e.paidAt === null);
  const unpaidTotal = unpaid.reduce((total, e) => total + e.amount, 0);

  if (!method.cycle) {
    return { method, configured: false, statements: [], payable: [], open: null, unpaidTotal, unpaidCount: unpaid.length, nextDue: null };
  }
  const statements = buildStatements({ rules: method.cycle, fixed: toFixed(fixedRows), expenses, today });
  const payable = payableStatements(statements);
  const soonest = [...payable].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
  const daysLeft = soonest ? diffDays(today, soonest.dueDate) : 0;
  return {
    method,
    configured: true,
    statements,
    payable,
    open: openStatement(statements),
    unpaidTotal,
    unpaidCount: unpaid.length,
    nextDue: soonest
      ? { period: soonest.period, date: soonest.dueDate, amount: soonest.unpaidTotal, daysLeft, overdue: daysLeft < 0 }
      : null,
  };
}

export interface DueSummary {
  /** Todo lo que está por pagar en tarjetas de crédito. */
  total: number;
  cards: Array<{
    methodId: string;
    name: string;
    icon: string;
    color: string;
    total: number;
    count: number;
    configured: boolean;
    nextDue: NextDue | null;
    hasClosedStatement: boolean;
  }>;
  /** Por pagar en métodos que no son tarjeta de crédito (por ejemplo algo fiado). */
  other: { total: number; count: number };
}

export interface DatesPreview {
  /** Mensaje si las fechas no son válidas; null si se pueden guardar. */
  error: string | null;
  moved: MovedExpense[];
  /** El extracto ya tiene gastos pagados: cambiar sus fechas requiere confirmación. */
  hasPaidExpenses: boolean;
  totalBefore: number;
  totalAfter: number;
}

async function loadCard(methodId: string): Promise<{ method: PaymentMethod; expenses: Expense[]; fixedRows: StoredStatementDates[] }> {
  const method = await paymentMethodRepository.getById(methodId);
  if (!method) throw new ValidationError('Esta tarjeta ya no existe.');
  const [expenses, fixedRows] = await Promise.all([expenseRepository.listByMethod(methodId), cardCycleRepository.listByMethod(methodId)]);
  return { method, expenses, fixedRows };
}

/** Lo que vence antes va primero; sin fecha límite, al final (y de más a menos deuda). */
function byUrgency<T extends { nextDue: NextDue | null; total: number }>(a: T, b: T): number {
  if (a.nextDue && b.nextDue) return a.nextDue.date < b.nextDue.date ? -1 : a.nextDue.date > b.nextDue.date ? 1 : b.total - a.total;
  if (a.nextDue) return -1;
  if (b.nextDue) return 1;
  return b.total - a.total;
}

export const cardService = {
  async getOverview(methodId: string, today: IsoDate = todayIso()): Promise<CardOverview | null> {
    const method = await paymentMethodRepository.getById(methodId);
    if (!method) return null;
    const { expenses, fixedRows } = await loadCard(methodId);
    return computeOverview({ method, expenses, fixedRows, today });
  },

  /** Todas las tarjetas de crédito activas con sus extractos. */
  async listOverviews(today: IsoDate = todayIso()): Promise<CardOverview[]> {
    const methods = (await paymentMethodRepository.list(false)).filter((m) => m.type === 'credit_card');
    const overviews = await Promise.all(
      methods.map(async (method) => {
        const [expenses, fixedRows] = await Promise.all([expenseRepository.listByMethod(method.id), cardCycleRepository.listByMethod(method.id)]);
        return computeOverview({ method, expenses, fixedRows, today });
      }),
    );
    return overviews.sort((a, b) => byUrgency({ nextDue: a.nextDue, total: a.unpaidTotal }, { nextDue: b.nextDue, total: b.unpaidTotal }));
  },

  /** Resumen "Por pagar" para Inicio. */
  async dueSummary(today: IsoDate = todayIso()): Promise<DueSummary> {
    const [totals, methods] = await Promise.all([expenseRepository.unpaidTotalsByMethod(), paymentMethodRepository.list(true)]);
    const byId = new Map(methods.map((m) => [m.id, m]));
    const summary: DueSummary = { total: 0, cards: [], other: { total: 0, count: 0 } };

    for (const row of totals) {
      const method = byId.get(row.paymentMethodId);
      if (!method || method.type !== 'credit_card') {
        summary.other.total += row.total;
        summary.other.count += row.count;
        continue;
      }
      const overview = await cardService.getOverview(method.id, today);
      summary.total += row.total;
      summary.cards.push({
        methodId: method.id,
        name: method.name,
        icon: method.icon,
        color: method.color,
        total: row.total,
        count: row.count,
        configured: overview?.configured ?? false,
        nextDue: overview?.nextDue ?? null,
        hasClosedStatement: (overview?.payable.length ?? 0) > 0,
      });
    }
    summary.cards.sort(byUrgency);
    return summary;
  },

  /**
   * Marca como pagados los gastos elegidos (de extractos ya cerrados) y deja fijas las fechas de esos extractos.
   * Los gastos que no se incluyan siguen como "por pagar".
   */
  async payExpenses(methodId: string, expenseIds: string[], paidOn: IsoDate, today: IsoDate = todayIso()): Promise<{ paid: number; total: number }> {
    const ids = [...new Set(expenseIds)];
    if (ids.length === 0) throw new ValidationError('Marca al menos un gasto para pagar.');
    if (!isValidIsoDate(paidOn)) throw new ValidationError('La fecha del pago no es válida.');
    if (paidOn > today) throw new ValidationError('La fecha del pago no puede ser futura.');

    const { method, expenses, fixedRows } = await loadCard(methodId);
    if (!method.cycle) throw new ValidationError('Configura primero las fechas de corte y pago de esta tarjeta.');

    const fixed = toFixed(fixedRows);
    const datesFor = makeDatesFor(method.cycle, fixed);
    const byId = new Map(expenses.map((e) => [e.id, e]));
    const frozen = new Map<Period, StoredStatementDates>();
    let total = 0;

    for (const id of ids) {
      const expense = byId.get(id);
      if (!expense) throw new ValidationError('Alguno de los gastos ya no pertenece a esta tarjeta.');
      if (expense.paidAt !== null) throw new ValidationError('Alguno de los gastos ya estaba pagado.');
      const period = periodFor(expense.date, datesFor);
      const dates = datesFor(period);
      if (today <= dates.cut) throw new ValidationError('Ese extracto aún no ha cerrado: no se puede pagar todavía.');
      total += expense.amount;
      if (!fixed[period] && !frozen.has(period)) {
        frozen.set(period, { paymentMethodId: methodId, period, cutDate: dates.cut, dueDate: dates.due });
      }
    }

    await expenseRepository.payWithFrozenDates(ids, paidOn, nowIso(), [...frozen.values()]);
    notifyDataChanged();
    return { paid: ids.length, total };
  },

  /** Simula un cambio de fechas de un extracto: qué gastos cambian de extracto y si el cambio es válido. */
  async previewStatementDates(methodId: string, period: Period, cut: IsoDate, due: IsoDate): Promise<DatesPreview> {
    const { method, expenses, fixedRows } = await loadCard(methodId);
    if (!method.cycle) throw new ValidationError('Configura primero las fechas de corte y pago de esta tarjeta.');
    const fixedBefore = toFixed(fixedRows);
    const before = makeDatesFor(method.cycle, fixedBefore);
    const after = makeDatesFor(method.cycle, { ...fixedBefore, [period]: { cut, due } });
    const error = validateStatementDates({ period, cut, due, datesFor: before });
    const list: StatementExpense[] = expenses;
    const moved = error ? [] : diffAssignments(list, before, after);
    const inPeriod = (datesFor: (p: Period) => { cut: IsoDate }) => list.filter((e) => periodFor(e.date, datesFor) === period);
    const sum = (items: StatementExpense[]) => items.reduce((total, e) => total + e.amount, 0);
    return {
      error,
      moved,
      hasPaidExpenses: inPeriod(before).some((e) => e.paidAt !== null),
      totalBefore: sum(inPeriod(before)),
      totalAfter: sum(inPeriod(after)),
    };
  },

  /**
   * Ajusta a mano las fechas de UN extracto (solo ese mes). Si el extracto ya tiene gastos pagados hay que
   * confirmar (`confirmPaid`), porque los gastos pueden cambiar de extracto.
   */
  async setStatementDates(
    methodId: string,
    period: Period,
    cut: IsoDate,
    due: IsoDate,
    options: { confirmPaid?: boolean } = {},
  ): Promise<void> {
    const preview = await cardService.previewStatementDates(methodId, period, cut, due);
    if (preview.error) throw new ValidationError(preview.error, 'dates');
    if (preview.hasPaidExpenses && !options.confirmPaid) {
      throw new ValidationError('Este extracto ya tiene gastos pagados. Confirma para cambiar sus fechas.', 'paid');
    }
    await cardCycleRepository.upsert({ paymentMethodId: methodId, period, cutDate: cut, dueDate: due });
    notifyDataChanged();
  },

  /** Vuelve un extracto a las fechas que dicta la regla de la tarjeta. */
  async resetStatementDates(methodId: string, period: Period, options: { confirmPaid?: boolean } = {}): Promise<void> {
    const { method, fixedRows } = await loadCard(methodId);
    if (!method.cycle) return;
    const fixed = toFixed(fixedRows);
    if (!fixed[period]) return;
    const rulesDates = makeDatesFor(method.cycle, {})(period);
    const preview = await cardService.previewStatementDates(methodId, period, rulesDates.cut, rulesDates.due);
    if (preview.hasPaidExpenses && !options.confirmPaid) {
      throw new ValidationError('Este extracto ya tiene gastos pagados. Confirma para cambiar sus fechas.', 'paid');
    }
    await cardCycleRepository.remove(methodId, period);
    notifyDataChanged();
  },
};
