import { getDb } from '@/db/connection';
import { toSavingsAccount, toSavingsMovement } from '@/db/mappers';
import type { SavingsAccount, SavingsAccountWithBalance, SavingsMovement } from '@/types/models';

const ACCOUNT_COLUMNS = 'id, name, last4, icon, color, is_active, sort_order, created_at, updated_at';
const MOVEMENT_COLUMNS = 'id, account_id, kind, amount, movement_date, note, expense_id, created_at';
const BALANCE_SQL = "COALESCE(SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END), 0)";

export const savingsRepository = {
  async listAccountsWithBalance(includeInactive: boolean): Promise<SavingsAccountWithBalance[]> {
    const db = await getDb();
    const where = includeInactive ? '' : 'WHERE a.is_active = 1';
    const rows = await db.query(
      `SELECT a.id, a.name, a.last4, a.icon, a.color, a.is_active, a.sort_order, a.created_at, a.updated_at,
              (SELECT ${BALANCE_SQL} FROM savings_movements m WHERE m.account_id = a.id) AS balance,
              (SELECT COUNT(*) FROM savings_movements m WHERE m.account_id = a.id) AS movement_count
       FROM savings_accounts a ${where}
       ORDER BY a.sort_order, a.name`,
    );
    return rows.map((row) => ({ ...toSavingsAccount(row), balance: Number(row.balance), movementCount: Number(row.movement_count) }));
  },

  async getAccount(id: string): Promise<SavingsAccount | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM savings_accounts WHERE id = ?`, [id]);
    return rows.length ? toSavingsAccount(rows[0]) : null;
  },

  async listAccountsRaw(): Promise<SavingsAccount[]> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM savings_accounts ORDER BY sort_order, name`);
    return rows.map(toSavingsAccount);
  },

  async nextSortOrder(): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM savings_accounts');
    return Number(rows[0].next);
  },

  async insertAccount(account: SavingsAccount): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT INTO savings_accounts (${ACCOUNT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      account.id,
      account.name,
      account.last4,
      account.icon,
      account.color,
      account.isActive ? 1 : 0,
      account.sortOrder,
      account.createdAt,
      account.updatedAt,
    ]);
  },

  async updateAccount(account: SavingsAccount): Promise<void> {
    const db = await getDb();
    await db.run('UPDATE savings_accounts SET name = ?, last4 = ?, icon = ?, color = ?, is_active = ?, updated_at = ? WHERE id = ?', [
      account.name,
      account.last4,
      account.icon,
      account.color,
      account.isActive ? 1 : 0,
      account.updatedAt,
      account.id,
    ]);
  },

  /** Borra la cuenta y, por la regla CASCADE, todos sus movimientos. */
  async removeAccount(id: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM savings_movements WHERE account_id = ?', [id]);
    await db.run('DELETE FROM savings_accounts WHERE id = ?', [id]);
  },

  async getBalance(accountId: string): Promise<number> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${BALANCE_SQL} AS balance FROM savings_movements WHERE account_id = ?`, [accountId]);
    return Number(rows[0].balance);
  },

  async insertMovement(movement: SavingsMovement): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT INTO savings_movements (${MOVEMENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      movement.id,
      movement.accountId,
      movement.kind,
      movement.amount,
      movement.date,
      movement.note,
      movement.expenseId,
      movement.createdAt,
    ]);
  },

  async getMovement(id: string): Promise<SavingsMovement | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${MOVEMENT_COLUMNS} FROM savings_movements WHERE id = ?`, [id]);
    return rows.length ? toSavingsMovement(rows[0]) : null;
  },

  /** El retiro que pagó un gasto, si el gasto se pagó con una cuenta de ahorro. */
  async getMovementByExpense(expenseId: string): Promise<SavingsMovement | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${MOVEMENT_COLUMNS} FROM savings_movements WHERE expense_id = ?`, [expenseId]);
    return rows.length ? toSavingsMovement(rows[0]) : null;
  },

  async listMovements(accountId: string): Promise<SavingsMovement[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT ${MOVEMENT_COLUMNS} FROM savings_movements WHERE account_id = ? ORDER BY movement_date, created_at, id`,
      [accountId],
    );
    return rows.map(toSavingsMovement);
  },

  async listMovementsRaw(): Promise<SavingsMovement[]> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${MOVEMENT_COLUMNS} FROM savings_movements ORDER BY movement_date, created_at, id`);
    return rows.map(toSavingsMovement);
  },

  async removeMovement(id: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM savings_movements WHERE id = ?', [id]);
  },

  async removeMovementByExpense(expenseId: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM savings_movements WHERE expense_id = ?', [expenseId]);
  },

  /** Cuántos gastos se pagaron con esta cuenta (están enlazados a un retiro). */
  async countExpenseMovements(accountId: string): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COUNT(*) AS n FROM savings_movements WHERE account_id = ? AND expense_id IS NOT NULL', [accountId]);
    return Number(rows[0].n);
  },
};
