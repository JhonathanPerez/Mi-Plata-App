import { getDb } from '@/db/connection';
import { toExpense, toExpenseWithRefs } from '@/db/mappers';
import type { SqlValue } from '@/db/types';
import type { StoredStatementDates } from './cardCycleRepository';
import type {
  CategoryTotal,
  DailyTotal,
  Expense,
  ExpenseFilters,
  ExpenseWithRefs,
  IsoDate,
  MethodTotal,
} from '@/types/models';

const EXPENSE_COLUMNS =
  'id, amount, category_id, payment_method_id, expense_date, expense_time, note, paid_at, created_at, updated_at';
const EXPENSE_PLACEHOLDERS = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?';

const SELECT_WITH_REFS = `
  SELECT e.id, e.amount, e.category_id, e.payment_method_id, e.expense_date, e.expense_time, e.note, e.paid_at,
         e.created_at, e.updated_at,
         c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         p.name AS pm_name, p.icon AS pm_icon, p.color AS pm_color, p.type AS pm_type
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
  JOIN payment_methods p ON p.id = e.payment_method_id`;

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

export interface RangeTotals {
  total: number;
  count: number;
}

export const expenseRepository = {
  async insert(expense: Expense): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT INTO expenses (${EXPENSE_COLUMNS}) VALUES (${EXPENSE_PLACEHOLDERS})`, [
      expense.id,
      expense.amount,
      expense.categoryId,
      expense.paymentMethodId,
      expense.date,
      expense.time,
      expense.note,
      expense.paidAt,
      expense.createdAt,
      expense.updatedAt,
    ]);
  },

  /** Guarda el gasto y marca como categorizado el aviso detectado del que salió, todo o nada. */
  async insertFromPending(expense: Expense, pendingId: string): Promise<void> {
    const db = await getDb();
    await db.transaction(async () => {
      await this.insert(expense);
      await db.run("UPDATE pending_captures SET status = 'accepted', raw_text = '', resolved_at = ? WHERE id = ?", [
        expense.createdAt,
        pendingId,
      ]);
    });
  },

  async insertMany(expenses: Expense[]): Promise<void> {
    const db = await getDb();
    await db.runMany(
      `INSERT INTO expenses (${EXPENSE_COLUMNS}) VALUES (${EXPENSE_PLACEHOLDERS})`,
      expenses.map((e) => [e.id, e.amount, e.categoryId, e.paymentMethodId, e.date, e.time, e.note, e.paidAt, e.createdAt, e.updatedAt]),
    );
  },

  async update(expense: Expense): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE expenses
         SET amount = ?, category_id = ?, payment_method_id = ?, expense_date = ?, expense_time = ?,
             note = ?, paid_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        expense.amount,
        expense.categoryId,
        expense.paymentMethodId,
        expense.date,
        expense.time,
        expense.note,
        expense.paidAt,
        expense.updatedAt,
        expense.id,
      ],
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM expenses WHERE id = ?', [id]);
  },

  async getById(id: string): Promise<Expense | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ?`, [id]);
    return rows.length ? toExpense(rows[0]) : null;
  },

  /** Consulta con filtros de SQL. La búsqueda de texto se resuelve en el servicio (sin tildes). */
  async query(filters: ExpenseFilters = {}): Promise<ExpenseWithRefs[]> {
    const db = await getDb();
    const where: string[] = [];
    const params: SqlValue[] = [];

    if (filters.from) {
      where.push('e.expense_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      where.push('e.expense_date <= ?');
      params.push(filters.to);
    }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      where.push(`e.category_id IN (${placeholders(filters.categoryIds.length)})`);
      params.push(...filters.categoryIds);
    }
    if (filters.paymentMethodIds && filters.paymentMethodIds.length > 0) {
      where.push(`e.payment_method_id IN (${placeholders(filters.paymentMethodIds.length)})`);
      params.push(...filters.paymentMethodIds);
    }
    if (filters.minAmount !== undefined && filters.minAmount > 0) {
      where.push('e.amount >= ?');
      params.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined && filters.maxAmount > 0) {
      where.push('e.amount <= ?');
      params.push(filters.maxAmount);
    }

    if (filters.status === 'due') where.push('e.paid_at IS NULL');
    if (filters.status === 'paid') where.push('e.paid_at IS NOT NULL');

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = filters.limit && filters.limit > 0 ? `LIMIT ${Math.trunc(filters.limit)}` : '';
    const rows = await db.query(
      `${SELECT_WITH_REFS} ${clause}
       ORDER BY e.expense_date DESC, COALESCE(e.expense_time, '') DESC, e.created_at DESC ${limit}`,
      params,
    );
    return rows.map(toExpenseWithRefs);
  },

  async sumBetween(from: IsoDate, to: IsoDate): Promise<RangeTotals> {
    const db = await getDb();
    const rows = await db.query(
      'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM expenses WHERE expense_date BETWEEN ? AND ?',
      [from, to],
    );
    return { total: Number(rows[0].total), count: Number(rows[0].n) };
  },

  async totalsByCategory(from: IsoDate, to: IsoDate): Promise<CategoryTotal[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT c.id AS id, c.name AS name, c.icon AS icon, c.color AS color,
              SUM(e.amount) AS total, COUNT(*) AS n
       FROM expenses e JOIN categories c ON c.id = e.category_id
       WHERE e.expense_date BETWEEN ? AND ?
       GROUP BY c.id, c.name, c.icon, c.color
       ORDER BY total DESC, c.name`,
      [from, to],
    );
    return rows.map((row) => ({
      categoryId: String(row.id),
      name: String(row.name),
      icon: String(row.icon),
      color: String(row.color),
      total: Number(row.total),
      count: Number(row.n),
      percent: 0,
    }));
  },

  async totalsByMethod(from: IsoDate, to: IsoDate): Promise<MethodTotal[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT p.id AS id, p.name AS name, p.icon AS icon, p.color AS color,
              SUM(e.amount) AS total, COUNT(*) AS n
       FROM expenses e JOIN payment_methods p ON p.id = e.payment_method_id
       WHERE e.expense_date BETWEEN ? AND ?
       GROUP BY p.id, p.name, p.icon, p.color
       ORDER BY total DESC, p.name`,
      [from, to],
    );
    return rows.map((row) => ({
      paymentMethodId: String(row.id),
      name: String(row.name),
      icon: String(row.icon),
      color: String(row.color),
      total: Number(row.total),
      count: Number(row.n),
      percent: 0,
    }));
  },

  async dailyTotals(from: IsoDate, to: IsoDate): Promise<DailyTotal[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT expense_date AS date, SUM(amount) AS total
       FROM expenses WHERE expense_date BETWEEN ? AND ?
       GROUP BY expense_date ORDER BY expense_date`,
      [from, to],
    );
    return rows.map((row) => ({ date: String(row.date), total: Number(row.total) }));
  },

  /** Todos los gastos de un método de pago (para armar los extractos de una tarjeta). */
  async listByMethod(paymentMethodId: string): Promise<Expense[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE payment_method_id = ? ORDER BY expense_date, created_at`,
      [paymentMethodId],
    );
    return rows.map(toExpense);
  },

  async listByIds(ids: string[]): Promise<Expense[]> {
    if (ids.length === 0) return [];
    const db = await getDb();
    const rows = await db.query(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id IN (${placeholders(ids.length)})`, ids);
    return rows.map(toExpense);
  },

  /** Marca gastos como pagados (con fecha) o como por pagar (null). Devuelve cuántos cambiaron. */
  async setPaid(ids: string[], paidAt: IsoDate | null, updatedAt: string): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    await db.run(`UPDATE expenses SET paid_at = ?, updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [
      paidAt,
      updatedAt,
      ...ids,
    ]);
  },

  /**
   * Paga gastos y deja fijas las fechas de los extractos a los que pertenecen, todo o nada.
   * Así, cambiar después las reglas de la tarjeta no altera un extracto ya pagado.
   */
  async payWithFrozenDates(ids: string[], paidAt: IsoDate, updatedAt: string, frozen: StoredStatementDates[]): Promise<void> {
    const db = await getDb();
    await db.transaction(async () => {
      await db.run(`UPDATE expenses SET paid_at = ?, updated_at = ? WHERE id IN (${placeholders(ids.length)})`, [paidAt, updatedAt, ...ids]);
      for (const item of frozen) {
        await db.run(
          'INSERT OR IGNORE INTO card_statement_dates (payment_method_id, period, cut_date, due_date) VALUES (?, ?, ?, ?)',
          [item.paymentMethodId, item.period, item.cutDate, item.dueDate],
        );
      }
    });
  },

  /** Total y cantidad de gastos por pagar, agrupados por método de pago. */
  async unpaidTotalsByMethod(): Promise<Array<{ paymentMethodId: string; total: number; count: number }>> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT payment_method_id AS id, SUM(amount) AS total, COUNT(*) AS n
       FROM expenses WHERE paid_at IS NULL GROUP BY payment_method_id`,
    );
    return rows.map((row) => ({ paymentMethodId: String(row.id), total: Number(row.total), count: Number(row.n) }));
  },

  async listAllRaw(): Promise<Expense[]> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${EXPENSE_COLUMNS} FROM expenses ORDER BY expense_date, created_at`);
    return rows.map(toExpense);
  },
};
