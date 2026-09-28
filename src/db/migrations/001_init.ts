import type { Migration } from './types';

/**
 * Esquema inicial.
 *  - IDs: TEXT (UUID). Sirven para sincronizar en la nube o fusionar copias sin colisiones.
 *  - Dinero: INTEGER en pesos (nunca REAL).
 *  - Fechas: TEXT ISO ("YYYY-MM-DD"); hora opcional "HH:MM"; marcas de tiempo en ISO UTC.
 *  - Eliminar una categoría o método con gastos está bloqueado por la base (ON DELETE RESTRICT).
 */
export const migration001: Migration = {
  version: 1,
  name: 'init',
  statements: [
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      type TEXT NOT NULL CHECK (type IN ('cash', 'debit_card', 'credit_card', 'other')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      last4 TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      credit_limit INTEGER,
      cutoff_day INTEGER,
      due_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
      payment_method_id TEXT NOT NULL REFERENCES payment_methods (id) ON DELETE RESTRICT,
      expense_date TEXT NOT NULL,
      expense_time TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_method ON expenses (payment_method_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON expenses (category_id, expense_date)`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY NOT NULL,
      year_month TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
  ],
};
