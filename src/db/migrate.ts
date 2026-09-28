import { nowIso } from '@/lib/ids';
import { migrations } from './migrations';
import type { Db } from './types';

export async function runMigrations(db: Db): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
  const done = new Set(applied.map((row) => Number(row.version)));

  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => !done.has(m.version));

  for (const migration of pending) {
    await db.transaction(async () => {
      for (const statement of migration.statements) {
        if (typeof statement === 'string') await db.execute(statement);
        else await db.run(statement.sql, statement.params ?? []);
      }
      await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        nowIso(),
      ]);
    });
  }
}
