import {
  addDays,
  addMonths,
  currentYearMonth,
  daysInMonth,
  elapsedDaysInMonth,
  monthRange,
  todayIso,
} from '@/lib/dates';
import { percentOf } from '@/lib/money';
import { budgetRepository } from '@/repositories/budgetRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import type {
  CategoryTotal,
  DailyTotal,
  ExpenseWithRefs,
  IsoDate,
  MethodTotal,
  YearMonth,
} from '@/types/models';
import { computeBudgetStatus, type BudgetStatus } from './budgetService';

export interface DashboardData {
  yearMonth: YearMonth;
  today: IsoDate;
  todayTotal: number;
  monthTotal: number;
  monthCount: number;
  budget: BudgetStatus;
  byCategory: CategoryTotal[];
  topCategory: CategoryTotal | null;
  byMethod: MethodTotal[];
  recent: ExpenseWithRefs[];
}

export interface MonthlySummary {
  yearMonth: YearMonth;
  total: number;
  transactions: number;
  dailyAverage: number;
  topCategory: CategoryTotal | null;
  /** Método más utilizado (por número de transacciones). */
  topMethod: MethodTotal | null;
  byCategory: CategoryTotal[];
  byMethod: MethodTotal[];
  daily: DailyTotal[];
  previousTotal: number;
  previousTransactions: number;
  changeAmount: number;
  /** null cuando el mes anterior no tiene gastos. */
  changePercent: number | null;
}

export function withCategoryPercents(items: CategoryTotal[], total: number): CategoryTotal[] {
  return items.map((item) => ({ ...item, percent: percentOf(item.total, total) }));
}

export function withMethodPercents(items: MethodTotal[], total: number): MethodTotal[] {
  return items.map((item) => ({ ...item, percent: percentOf(item.total, total) }));
}

/** El método "más utilizado" es el de más transacciones; en empate, el de mayor valor. */
export function pickMostUsedMethod(methods: MethodTotal[]): MethodTotal | null {
  if (methods.length === 0) return null;
  return [...methods].sort((a, b) => b.count - a.count || b.total - a.total)[0];
}

/** Rellena con ceros los días sin gastos para que la gráfica tenga todo el mes. */
export function fillDailyTotals(yearMonth: YearMonth, totals: DailyTotal[]): DailyTotal[] {
  const byDate = new Map(totals.map((t) => [t.date, t.total]));
  const { from } = monthRange(yearMonth);
  const days = daysInMonth(yearMonth);
  const result: DailyTotal[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    result.push({ date, total: byDate.get(date) ?? 0 });
  }
  return result;
}

export const statsService = {
  async getDashboard(now: Date = new Date()): Promise<DashboardData> {
    const yearMonth = currentYearMonth(now);
    const today = todayIso(now);
    const { from, to } = monthRange(yearMonth);

    const [todayTotals, monthTotals, byCategory, byMethod, recent, budgetAmount] = await Promise.all([
      expenseRepository.sumBetween(today, today),
      expenseRepository.sumBetween(from, to),
      expenseRepository.totalsByCategory(from, to),
      expenseRepository.totalsByMethod(from, to),
      expenseRepository.query({ limit: 5 }),
      budgetRepository.getEffectiveAmount(yearMonth),
    ]);

    const categories = withCategoryPercents(byCategory, monthTotals.total);
    return {
      yearMonth,
      today,
      todayTotal: todayTotals.total,
      monthTotal: monthTotals.total,
      monthCount: monthTotals.count,
      budget: computeBudgetStatus(yearMonth, budgetAmount, monthTotals.total),
      byCategory: categories,
      topCategory: categories[0] ?? null,
      byMethod: withMethodPercents(byMethod, monthTotals.total),
      recent,
    };
  },

  async getMonthlySummary(yearMonth: YearMonth, now: Date = new Date()): Promise<MonthlySummary> {
    const { from, to } = monthRange(yearMonth);
    const previous = monthRange(addMonths(yearMonth, -1));

    const [totals, byCategory, byMethod, daily, previousTotals] = await Promise.all([
      expenseRepository.sumBetween(from, to),
      expenseRepository.totalsByCategory(from, to),
      expenseRepository.totalsByMethod(from, to),
      expenseRepository.dailyTotals(from, to),
      expenseRepository.sumBetween(previous.from, previous.to),
    ]);

    const categories = withCategoryPercents(byCategory, totals.total);
    const methods = withMethodPercents(byMethod, totals.total);
    const days = elapsedDaysInMonth(yearMonth, now);

    return {
      yearMonth,
      total: totals.total,
      transactions: totals.count,
      dailyAverage: totals.total / Math.max(1, days),
      topCategory: categories[0] ?? null,
      topMethod: pickMostUsedMethod(methods),
      byCategory: categories,
      byMethod: methods,
      daily: fillDailyTotals(yearMonth, daily),
      previousTotal: previousTotals.total,
      previousTransactions: previousTotals.count,
      changeAmount: totals.total - previousTotals.total,
      changePercent:
        previousTotals.total > 0 ? ((totals.total - previousTotals.total) / previousTotals.total) * 100 : null,
    };
  },
};
