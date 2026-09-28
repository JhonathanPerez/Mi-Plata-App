import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from '@/config/seeds';
import { SETTING_KEYS } from '@/config/constants';
import { serializeCycleRules } from '@/lib/cycles';
import { nowIso } from '@/lib/ids';
import type { Db } from './types';

/**
 * Inserta las categorías y métodos de pago iniciales solo una vez.
 * Si el usuario elimina alguno, no vuelve a aparecer.
 */
export async function seedDefaults(db: Db): Promise<void> {
  const flag = await db.query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SETTING_KEYS.seeded]);
  if (flag.length > 0) return;

  const now = nowIso();
  await db.transaction(async () => {
    await db.runMany(
      `INSERT OR IGNORE INTO categories (id, name, icon, color, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      DEFAULT_CATEGORIES.map((c, index) => [c.id, c.name, c.icon, c.color, index, now, now]),
    );
    await db.runMany(
      `INSERT OR IGNORE INTO payment_methods
         (id, name, type, icon, color, last4, is_active, sort_order, credit_limit, cutoff_day, due_day, cycle_rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 1, ?, NULL, NULL, NULL, ?, ?, ?)`,
      DEFAULT_PAYMENT_METHODS.map((m, index) => [
        m.id, m.name, m.type, m.icon, m.color, index, m.cycle ? serializeCycleRules(m.cycle) : null, now, now,
      ]),
    );
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [SETTING_KEYS.seeded, '1']);
  });
}
