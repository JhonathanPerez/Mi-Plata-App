import { getDb } from '@/db/connection';
import { toBudget } from '@/db/mappers';
import { newId, nowIso } from '@/lib/ids';
import type { Budget, YearMonth } from '@/types/models';

export const budgetRepository = {
  /**
   * Presupuesto vigente para un mes: el definido para ese mes o, si no hay,
   * el más reciente anterior (el presupuesto "se hereda" hacia adelante).
   */
  async getEffectiveAmount(yearMonth: YearMonth): Promise<number> {
    const db = await getDb();
    const rows = await db.query(
      'SELECT amount FROM budgets WHERE year_month <= ? ORDER BY year_month DESC LIMIT 1',
      [yearMonth],
    );
    return rows.length ? Number(rows[0].amount) : 0;
  },

  async upsert(yearMonth: YearMonth, amount: number): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(
      `INSERT INTO budgets (id, year_month, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (year_month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
      [newId(), yearMonth, amount, now, now],
    );
  },

  async listAll(): Promise<Budget[]> {
    const db = await getDb();
    const rows = await db.query(
      'SELECT id, year_month, amount, created_at, updated_at FROM budgets ORDER BY year_month',
    );
    return rows.map(toBudget);
  },
};
