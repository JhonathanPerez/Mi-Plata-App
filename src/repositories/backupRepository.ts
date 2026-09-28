import { SETTING_KEYS } from '@/config/constants';
import { getDb } from '@/db/connection';
import { serializeCycleRules } from '@/lib/cycles';
import type { Budget, Category, Expense, PaymentMethod } from '@/types/models';
import type { StoredStatementDates } from './cardCycleRepository';

export interface BackupData {
  categories: Category[];
  paymentMethods: PaymentMethod[];
  expenses: Expense[];
  budgets: Budget[];
  settings: Array<{ key: string; value: string }>;
  /** Fechas de extractos ajustadas o fijadas al pagar (copias antiguas no las traen). */
  cardStatementDates: StoredStatementDates[];
}

export const backupRepository = {
  /** Reemplaza TODO el contenido de la base por el de la copia, en una sola transacción. */
  async replaceAll(data: BackupData): Promise<void> {
    const db = await getDb();
    await db.transaction(async () => {
      await db.run('DELETE FROM card_statement_dates');
      await db.run('DELETE FROM expenses');
      await db.run('DELETE FROM budgets');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM payment_methods');
      await db.run('DELETE FROM settings');

      await db.runMany(
        `INSERT INTO categories (id, name, icon, color, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        data.categories.map((c) => [c.id, c.name, c.icon, c.color, c.isActive ? 1 : 0, c.sortOrder, c.createdAt, c.updatedAt]),
      );
      await db.runMany(
        `INSERT INTO payment_methods
           (id, name, type, icon, color, last4, is_active, sort_order, credit_limit, cutoff_day, due_day, cycle_rules, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.paymentMethods.map((m) => [
          m.id, m.name, m.type, m.icon, m.color, m.last4, m.isActive ? 1 : 0, m.sortOrder,
          m.creditLimit, m.cutoffDay, m.dueDay, m.cycle ? serializeCycleRules(m.cycle) : null, m.createdAt, m.updatedAt,
        ]),
      );
      await db.runMany(
        `INSERT INTO expenses
           (id, amount, category_id, payment_method_id, expense_date, expense_time, note, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.expenses.map((e) => [e.id, e.amount, e.categoryId, e.paymentMethodId, e.date, e.time, e.note, e.paidAt, e.createdAt, e.updatedAt]),
      );
      await db.runMany(
        'INSERT INTO card_statement_dates (payment_method_id, period, cut_date, due_date) VALUES (?, ?, ?, ?)',
        data.cardStatementDates.map((d) => [d.paymentMethodId, d.period, d.cutDate, d.dueDate]),
      );
      await db.runMany(
        `INSERT INTO budgets (id, year_month, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        data.budgets.map((b) => [b.id, b.yearMonth, b.amount, b.createdAt, b.updatedAt]),
      );
      await db.runMany(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        data.settings.map((s) => [s.key, s.value]),
      );
      // Evita que se vuelvan a sembrar las categorías por defecto tras restaurar.
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [SETTING_KEYS.seeded, '1']);
    });
  },
};
