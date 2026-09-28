import type { Migration } from './types';

/**
 * Estado "pagado / por pagar" de los gastos y reglas de corte y pago de las tarjetas.
 *  - `expenses.paid_at`: fecha en que se le pagó al banco; NULL = por pagar. Lo que ya estaba registrado
 *    queda como pagado (se toma la fecha del gasto) para no llenar de pendientes falsos.
 *  - `payment_methods.cycle_rules`: reglas de corte y pago en JSON (ver `lib/cycles.ts`).
 *  - `card_statement_dates`: fechas de un extracto que el usuario ajustó a mano o que quedaron fijas al pagarlo.
 * Nubank y Davibank reciben las reglas que indicó el usuario (solo si aún no tenían ninguna).
 * Los textos JSON están escritos a mano a propósito: una migración publicada nunca debe cambiar.
 */
const NUBANK = '{"cut":{"kind":"last"},"due":{"kind":"day","day":20},"dueNextMonth":true,"weekend":"keep"}';
const DAVIBANK =
  '{"cut":{"kind":"nth","nth":2,"weekday":5},"due":{"kind":"nth","nth":2,"weekday":2},"dueNextMonth":true,"weekend":"keep"}';

export const migration004: Migration = {
  version: 4,
  name: 'paid_status_and_card_cycles',
  statements: [
    'ALTER TABLE expenses ADD COLUMN paid_at TEXT',
    'UPDATE expenses SET paid_at = expense_date',
    'CREATE INDEX IF NOT EXISTS idx_expenses_unpaid ON expenses (payment_method_id, expense_date) WHERE paid_at IS NULL',
    'ALTER TABLE payment_methods ADD COLUMN cycle_rules TEXT',
    `CREATE TABLE IF NOT EXISTS card_statement_dates (
      payment_method_id TEXT NOT NULL,
      period TEXT NOT NULL,
      cut_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      PRIMARY KEY (payment_method_id, period),
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
    )`,
    {
      sql: "UPDATE payment_methods SET cycle_rules = ? WHERE id = 'pm_nubank' AND type = 'credit_card' AND cycle_rules IS NULL",
      params: [NUBANK],
    },
    {
      sql: "UPDATE payment_methods SET cycle_rules = ? WHERE id = 'pm_davibank' AND type = 'credit_card' AND cycle_rules IS NULL",
      params: [DAVIBANK],
    },
  ],
};
