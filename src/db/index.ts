import { getDb } from './connection';
import { runMigrations } from './migrate';
import { seedDefaults } from './seed';

let initPromise: Promise<void> | null = null;

/** Abre la base, aplica migraciones y siembra datos iniciales. Seguro de llamar varias veces. */
export function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const db = await getDb();
      await runMigrations(db);
      await seedDefaults(db);
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}
