import type { Migration } from './types';

/**
 * Gastos detectados automáticamente (notificaciones y SMS) que esperan categoría.
 *  - `status`: 'pending' se muestra en la bandeja; 'accepted' y 'dismissed' solo sirven para no duplicar.
 *  - `raw_text` se vacía al resolver: no se guarda el mensaje del banco más de lo necesario.
 *  - `occurred_at` en milisegundos (INTEGER); `fingerprint` identifica el mismo aviso aunque se republique.
 */
export const migration003: Migration = {
  version: 3,
  name: 'pending_captures',
  statements: [
    `CREATE TABLE IF NOT EXISTS pending_captures (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      bank TEXT,
      amount INTEGER NOT NULL CHECK (amount > 0),
      merchant TEXT,
      last4 TEXT,
      raw_text TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_captures (status, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_pending_fingerprint ON pending_captures (fingerprint, occurred_at)`,
  ],
};
