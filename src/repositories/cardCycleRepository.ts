import { getDb } from '@/db/connection';
import type { IsoDate } from '@/types/models';

export interface StoredStatementDates {
  paymentMethodId: string;
  period: string;
  cutDate: IsoDate;
  dueDate: IsoDate;
}

const toStored = (row: Record<string, unknown>): StoredStatementDates => ({
  paymentMethodId: String(row.payment_method_id),
  period: String(row.period),
  cutDate: String(row.cut_date),
  dueDate: String(row.due_date),
});

/** Fechas de extractos ajustadas a mano o fijadas al pagarlos (tabla `card_statement_dates`). */
export const cardCycleRepository = {
  async listByMethod(paymentMethodId: string): Promise<StoredStatementDates[]> {
    const db = await getDb();
    const rows = await db.query(
      'SELECT payment_method_id, period, cut_date, due_date FROM card_statement_dates WHERE payment_method_id = ? ORDER BY period',
      [paymentMethodId],
    );
    return rows.map(toStored);
  },

  async listAll(): Promise<StoredStatementDates[]> {
    const db = await getDb();
    const rows = await db.query('SELECT payment_method_id, period, cut_date, due_date FROM card_statement_dates ORDER BY payment_method_id, period');
    return rows.map(toStored);
  },

  async upsert(item: StoredStatementDates): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO card_statement_dates (payment_method_id, period, cut_date, due_date) VALUES (?, ?, ?, ?)
       ON CONFLICT (payment_method_id, period) DO UPDATE SET cut_date = excluded.cut_date, due_date = excluded.due_date`,
      [item.paymentMethodId, item.period, item.cutDate, item.dueDate],
    );
  },

  /** Inserta solo si no existe (para fijar las fechas de un extracto al pagarlo sin pisar un ajuste previo). */
  async insertIfMissing(item: StoredStatementDates): Promise<void> {
    const db = await getDb();
    await db.run(
      'INSERT OR IGNORE INTO card_statement_dates (payment_method_id, period, cut_date, due_date) VALUES (?, ?, ?, ?)',
      [item.paymentMethodId, item.period, item.cutDate, item.dueDate],
    );
  },

  async remove(paymentMethodId: string, period: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM card_statement_dates WHERE payment_method_id = ? AND period = ?', [paymentMethodId, period]);
  },
};
