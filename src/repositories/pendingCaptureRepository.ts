import { getDb } from '@/db/connection';
import { toPendingCapture } from '@/db/mappers';
import type { PendingCapture, PendingCaptureStatus } from '@/types/models';

const COLUMNS =
  'id, source, bank, amount, merchant, last4, raw_text, occurred_at, fingerprint, status, created_at, resolved_at';

export const pendingCaptureRepository = {
  async insert(item: PendingCapture): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT INTO pending_captures (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      item.id,
      item.source,
      item.bank,
      item.amount,
      item.merchant,
      item.last4,
      item.rawText,
      item.occurredAt,
      item.fingerprint,
      item.status,
      item.createdAt,
      item.resolvedAt,
    ]);
  },

  /** Los más recientes primero. */
  async listPending(): Promise<PendingCapture[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT ${COLUMNS} FROM pending_captures WHERE status = 'pending' ORDER BY occurred_at DESC, created_at DESC`,
    );
    return rows.map(toPendingCapture);
  },

  async countPending(): Promise<number> {
    const db = await getDb();
    const rows = await db.query("SELECT COUNT(*) AS n FROM pending_captures WHERE status = 'pending'");
    return Number(rows[0]?.n ?? 0);
  },

  /** Cuántos hay por categorizar y, si es uno solo, su valor (para el texto del recordatorio). */
  async pendingSummary(): Promise<{ count: number; singleAmount: number | null }> {
    const db = await getDb();
    const rows = await db.query(
      "SELECT COUNT(*) AS n, MAX(amount) AS amount FROM pending_captures WHERE status = 'pending'",
    );
    const count = Number(rows[0]?.n ?? 0);
    return { count, singleAmount: count === 1 ? Number(rows[0]?.amount ?? 0) : null };
  },

  async getPendingById(id: string): Promise<PendingCapture | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${COLUMNS} FROM pending_captures WHERE id = ? AND status = 'pending'`, [id]);
    return rows.length ? toPendingCapture(rows[0]) : null;
  },

  /** ¿Ya existe (en cualquier estado) un aviso con esta huella dentro del rango de tiempo? */
  async existsFingerprint(fingerprint: string, fromMs: number, toMs: number): Promise<boolean> {
    const db = await getDb();
    const rows = await db.query(
      'SELECT COUNT(*) AS n FROM pending_captures WHERE fingerprint = ? AND occurred_at BETWEEN ? AND ?',
      [fingerprint, fromMs, toMs],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  },

  /** Marca como resuelto y borra el texto original: solo queda la huella para no volver a detectarlo. */
  async resolve(id: string, status: Exclude<PendingCaptureStatus, 'pending'>, resolvedAt: string): Promise<void> {
    const db = await getDb();
    await db.run("UPDATE pending_captures SET status = ?, raw_text = '', resolved_at = ? WHERE id = ?", [
      status,
      resolvedAt,
      id,
    ]);
  },

  async pruneResolvedBefore(isoTimestamp: string): Promise<void> {
    const db = await getDb();
    await db.run("DELETE FROM pending_captures WHERE status <> 'pending' AND resolved_at < ?", [isoTimestamp]);
  },
};
