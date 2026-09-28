import { getDb } from '@/db/connection';
import { toPaymentMethod } from '@/db/mappers';
import { serializeCycleRules } from '@/lib/cycles';
import type { PaymentMethod, PaymentMethodWithCount } from '@/types/models';

const COLUMNS =
  'id, name, type, icon, color, last4, is_active, sort_order, credit_limit, cutoff_day, due_day, cycle_rules, created_at, updated_at';

export const paymentMethodRepository = {
  async list(includeInactive = false): Promise<PaymentMethod[]> {
    const db = await getDb();
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const rows = await db.query(`SELECT ${COLUMNS} FROM payment_methods ${where} ORDER BY sort_order, name`);
    return rows.map(toPaymentMethod);
  },

  async listWithCounts(): Promise<PaymentMethodWithCount[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT p.id, p.name, p.type, p.icon, p.color, p.last4, p.is_active, p.sort_order,
              p.credit_limit, p.cutoff_day, p.due_day, p.cycle_rules, p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM expenses e WHERE e.payment_method_id = p.id) AS expense_count
       FROM payment_methods p
       ORDER BY p.sort_order, p.name`,
    );
    return rows.map((row) => ({ ...toPaymentMethod(row), expenseCount: Number(row.expense_count) }));
  },

  async getById(id: string): Promise<PaymentMethod | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${COLUMNS} FROM payment_methods WHERE id = ?`, [id]);
    return rows.length ? toPaymentMethod(rows[0]) : null;
  },

  async findByName(name: string): Promise<PaymentMethod | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${COLUMNS} FROM payment_methods WHERE name = ? COLLATE NOCASE`, [name]);
    return rows.length ? toPaymentMethod(rows[0]) : null;
  },

  async nextSortOrder(): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM payment_methods');
    return Number(rows[0].next);
  },

  async insert(method: PaymentMethod): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT INTO payment_methods (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      method.id,
      method.name,
      method.type,
      method.icon,
      method.color,
      method.last4,
      method.isActive ? 1 : 0,
      method.sortOrder,
      method.creditLimit,
      method.cutoffDay,
      method.dueDay,
      method.cycle ? serializeCycleRules(method.cycle) : null,
      method.createdAt,
      method.updatedAt,
    ]);
  },

  async update(method: PaymentMethod): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE payment_methods
         SET name = ?, type = ?, icon = ?, color = ?, last4 = ?, is_active = ?, sort_order = ?,
             credit_limit = ?, cutoff_day = ?, due_day = ?, cycle_rules = ?, updated_at = ?
       WHERE id = ?`,
      [
        method.name,
        method.type,
        method.icon,
        method.color,
        method.last4,
        method.isActive ? 1 : 0,
        method.sortOrder,
        method.creditLimit,
        method.cutoffDay,
        method.dueDay,
        method.cycle ? serializeCycleRules(method.cycle) : null,
        method.updatedAt,
        method.id,
      ],
    );
  },

  async countExpenses(id: string): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COUNT(*) AS n FROM expenses WHERE payment_method_id = ?', [id]);
    return Number(rows[0].n);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM payment_methods WHERE id = ?', [id]);
  },
};
