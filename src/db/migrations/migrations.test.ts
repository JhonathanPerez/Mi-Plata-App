import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_METHODS } from '@/config/seeds';
import { runMigrations } from '@/db/migrate';
import { seedDefaults } from '@/db/seed';
import { createTestDb } from '@/test/sqliteTestDb';
import { migration001 } from './001_init';

const suite = createTestDb() ? describe : describe.skip;

suite('migración 002: método de pago Transferencia', () => {
  it('se agrega una sola vez a una instalación existente', async () => {
    const db = createTestDb()!;

    // Simula una instalación anterior: esquema v1 + semillas antiguas (sin Transferencia).
    await db.execute(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const statement of migration001.statements) await db.execute(statement as string);
    await db.run("INSERT INTO schema_migrations VALUES (1, 'init', '2026-01-01T00:00:00.000Z')");
    await db.run("INSERT INTO settings (key, value) VALUES ('seeded', '1')");
    const old = DEFAULT_PAYMENT_METHODS.filter((m) => m.id !== 'pm_transferencia');
    await db.runMany(
      `INSERT INTO payment_methods (id, name, type, icon, color, last4, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 1, ?, 'x', 'x')`,
      old.map((m, i) => [m.id, m.name, m.type, m.icon, m.color, i]),
    );

    await runMigrations(db);
    await runMigrations(db); // idempotente
    const rows = await db.query<{ name: string; sort_order: number; type: string }>(
      'SELECT name, sort_order, type FROM payment_methods ORDER BY sort_order',
    );
    expect(rows.map((r) => r.name)).toEqual(['Efectivo', 'Davibank', 'Nubank', 'RappiCard', 'Transferencia']);
    expect(rows[4].sort_order).toBe(4);
  });

  it('respeta una "Transferencia" creada por el usuario', async () => {
    const db = createTestDb()!;
    await db.execute(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const statement of migration001.statements) await db.execute(statement as string);
    await db.run("INSERT INTO schema_migrations VALUES (1, 'init', '2026-01-01T00:00:00.000Z')");
    await db.run("INSERT INTO settings (key, value) VALUES ('seeded', '1')");
    await db.run(
      "INSERT INTO payment_methods (id, name, type, icon, color, is_active, sort_order, created_at, updated_at) VALUES ('mia', 'transferencia', 'other', '💸', '#111111', 1, 0, 'x', 'x')",
    );
    await runMigrations(db);
    const rows = await db.query<{ id: string }>('SELECT id FROM payment_methods');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('mia');
  });

  it('en una instalación nueva la siembra queda en el orden correcto y sin duplicados', async () => {
    const db = createTestDb()!;
    await runMigrations(db);
    await seedDefaults(db);
    const rows = await db.query<{ name: string }>('SELECT name FROM payment_methods ORDER BY sort_order');
    expect(rows.map((r) => r.name)).toEqual(['Efectivo', 'Davibank', 'Nubank', 'RappiCard', 'Transferencia']);
  });
});
