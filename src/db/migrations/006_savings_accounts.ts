import type { Migration } from './types';

/**
 * Cuentas de ahorro y sus movimientos.
 *  - `savings_accounts`: las cuentas que la persona quiera (nombre, icono y color). El saldo NO se guarda: se calcula
 *    siempre sumando los movimientos, así nunca puede quedar desfasado.
 *  - `savings_movements`: cada ingreso ('deposit') o retiro ('withdrawal') con su fecha y nota. Un retiro que nace de
 *    pagar un gasto con la cuenta lleva `expense_id`: al borrar el gasto, el retiro se borra con él (CASCADE) y la plata vuelve.
 *  - `payment_methods.savings_account_id`: cada cuenta tiene un método de pago «espejo» (tipo 'other'). Así un gasto pagado
 *    con ahorro entra al historial, a las estadísticas y a la exportación como cualquier otro, sin tocar esas consultas.
 *    El índice único garantiza un solo espejo por cuenta.
 * No hay FOREIGN KEY de `payment_methods` hacia `savings_accounts` a propósito: SQLite no permite agregar una restricción
 * con ALTER TABLE y evitamos dependencias circulares al restaurar copias.
 */
export const migration006: Migration = {
  version: 6,
  name: 'savings_accounts',
  statements: [
    `CREATE TABLE IF NOT EXISTS savings_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS savings_movements (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL REFERENCES savings_accounts (id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      movement_date TEXT NOT NULL,
      note TEXT,
      expense_id TEXT REFERENCES expenses (id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_savings_movements_account ON savings_movements (account_id, movement_date)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_movements_expense ON savings_movements (expense_id) WHERE expense_id IS NOT NULL',
    'ALTER TABLE payment_methods ADD COLUMN savings_account_id TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_savings ON payment_methods (savings_account_id) WHERE savings_account_id IS NOT NULL',
  ],
};
