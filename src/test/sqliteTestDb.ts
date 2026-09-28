import { createRequire } from 'node:module';
import type { Db, SqlValue } from '@/db/types';

/**
 * Base de datos SQLite en memoria para pruebas, usando node:sqlite (Node 22.5+).
 * Devuelve null si el runtime no la trae, y las pruebas de integración se omiten.
 */
export function createTestDb(): Db | null {
  let sqlite: { DatabaseSync: new (path: string) => any };
  try {
    const require = createRequire(import.meta.url);
    sqlite = require('node:sqlite');
  } catch {
    return null;
  }

  const raw = new sqlite.DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  let depth = 0;

  const db: Db = {
    async execute(sql: string) {
      raw.exec(sql);
    },
    async run(sql: string, params: SqlValue[] = []) {
      raw.prepare(sql).run(...params);
    },
    async runMany(sql: string, rows: SqlValue[][]) {
      const statement = raw.prepare(sql);
      for (const row of rows) statement.run(...row);
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async transaction<T>(work: () => Promise<T>) {
      if (depth > 0) return work();
      raw.exec('BEGIN');
      depth += 1;
      try {
        const result = await work();
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
  return db;
}
