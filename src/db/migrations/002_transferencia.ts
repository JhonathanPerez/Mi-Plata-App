import type { Migration } from './types';

/**
 * Agrega el método de pago "Transferencia" a las instalaciones que ya existían.
 * En instalaciones nuevas no hace nada: allí lo siembra `config/seeds.ts`.
 * Si ya existe uno con ese nombre (por ejemplo, creado por el usuario), se respeta.
 */
export const migration002: Migration = {
  version: 2,
  name: 'add_transferencia_payment_method',
  statements: [
    {
      sql: `INSERT OR IGNORE INTO payment_methods
              (id, name, type, icon, color, last4, is_active, sort_order, credit_limit, cutoff_day, due_day, created_at, updated_at)
            SELECT 'pm_transferencia', 'Transferencia', 'other', '🏦', '#3D8FD1', NULL, 1,
                   COALESCE((SELECT MAX(sort_order) FROM payment_methods), -1) + 1,
                   NULL, NULL, NULL,
                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'seeded')`,
    },
  ],
};
