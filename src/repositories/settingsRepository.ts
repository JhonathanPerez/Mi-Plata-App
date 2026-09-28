import { getDb } from '@/db/connection';

export const settingsRepository = {
  async get(key: string): Promise<string | null> {
    const db = await getDb();
    const rows = await db.query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length ? String(rows[0].value) : null;
  },

  async set(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  },

  async remove(key: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM settings WHERE key = ?', [key]);
  },

  async listAll(): Promise<Array<{ key: string; value: string }>> {
    const db = await getDb();
    const rows = await db.query<{ key: string; value: string }>('SELECT key, value FROM settings ORDER BY key');
    return rows.map((row) => ({ key: String(row.key), value: String(row.value) }));
  },
};
