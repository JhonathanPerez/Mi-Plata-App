import { MAX_AMOUNT } from '@/config/constants';
import { monthRange } from '@/lib/dates';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { budgetRepository } from '@/repositories/budgetRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import type { YearMonth } from '@/types/models';

export type BudgetLevel = 'none' | 'ok' | 'near' | 'over';

export interface BudgetStatus {
  yearMonth: YearMonth;
  hasBudget: boolean;
  budget: number;
  spent: number;
  /** Nunca negativo. */
  available: number;
  overBy: number;
  /** 0-100. Si se excede el presupuesto se queda en 100: cuánto se pasó lo dice `overBy`. */
  percentUsed: number;
  level: BudgetLevel;
}

/** Cálculo puro del estado del presupuesto (fácil de probar). */
export function computeBudgetStatus(yearMonth: YearMonth, budget: number, spent: number): BudgetStatus {
  const hasBudget = budget > 0;
  const percentUsed = hasBudget ? Math.min(100, (spent / budget) * 100) : 0;
  let level: BudgetLevel = 'none';
  if (hasBudget) level = spent > budget ? 'over' : percentUsed >= 85 ? 'near' : 'ok';
  return {
    yearMonth,
    hasBudget,
    budget,
    spent,
    available: hasBudget ? Math.max(0, budget - spent) : 0,
    overBy: hasBudget ? Math.max(0, spent - budget) : 0,
    percentUsed,
    level,
  };
}

export const budgetService = {
  async getStatus(yearMonth: YearMonth): Promise<BudgetStatus> {
    const { from, to } = monthRange(yearMonth);
    const [budget, totals] = await Promise.all([
      budgetRepository.getEffectiveAmount(yearMonth),
      expenseRepository.sumBetween(from, to),
    ]);
    return computeBudgetStatus(yearMonth, budget, totals.total);
  },

  getAmount(yearMonth: YearMonth): Promise<number> {
    return budgetRepository.getEffectiveAmount(yearMonth);
  },

  /** Define el presupuesto de ese mes; los meses siguientes lo heredan hasta que se cambie. 0 = sin presupuesto. */
  async setBudget(yearMonth: YearMonth, amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new ValidationError('El presupuesto debe ser un valor en pesos, sin decimales.');
    }
    if (amount > MAX_AMOUNT) throw new ValidationError('El presupuesto es demasiado alto.');
    await budgetRepository.upsert(yearMonth, amount);
    notifyDataChanged();
  },
};
