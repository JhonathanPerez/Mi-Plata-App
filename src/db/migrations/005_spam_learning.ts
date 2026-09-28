import type { Migration } from './types';

/**
 * Reportar un pendiente como publicidad:
 *  - `pending_captures.status` gana el valor 'spam' (se separa de 'dismissed' para saber cuáles alimentaron
 *    el aprendizaje). El CHECK va sobre la columna, así que hay que recrear la tabla; SQLite no permite
 *    alterar un CHECK con ALTER TABLE.
 *  - `learned_spam_phrases`: frases de 2 a 4 palabras vistas en mensajes reportados como publicidad, con
 *    cuántos reportes *distintos* las contienen. Nunca guarda el mensaje completo, solo fragmentos de texto
 *    (sin el valor en pesos ni el comercio, que se quitan antes de guardarlos). Cuando una frase junta varios
 *    reportes, el parser empieza a tratarla como aviso de publicidad.
 */
export const migration005: Migration = {
  version: 5,
  name: 'spam_learning',
  statements: [
    `CREATE TABLE pending_captures_new (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      bank TEXT,
      amount INTEGER NOT NULL CHECK (amount > 0),
      merchant TEXT,
      last4 TEXT,
      raw_text TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'spam')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    `INSERT INTO pending_captures_new
       SELECT id, source, bank, amount, merchant, last4, raw_text, occurred_at, fingerprint, status, created_at, resolved_at
       FROM pending_captures`,
    'DROP TABLE pending_captures',
    'ALTER TABLE pending_captures_new RENAME TO pending_captures',
    'CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_captures (status, occurred_at)',
    'CREATE INDEX IF NOT EXISTS idx_pending_fingerprint ON pending_captures (fingerprint, occurred_at)',
    `CREATE TABLE IF NOT EXISTS learned_spam_phrases (
      phrase TEXT PRIMARY KEY NOT NULL,
      report_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    )`,
  ],
};
