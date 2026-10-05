import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_METHODS } from '@/config/seeds';
import { runMigrations } from '@/db/migrate';
import { seedDefaults } from '@/db/seed';
import { createTestDb } from '@/test/sqliteTestDb';
import { migration001 } from './001_init';
import { migrations } from './index';

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

suite('migración 006: cuentas de ahorro', () => {
  it('una instalación existente conserva sus gastos y gana las tablas de ahorro', async () => {
    const db = createTestDb()!;
    await db.execute(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    // Instalación en la versión 5: se aplican a mano las migraciones 1 a 5 y se guardan datos reales.
    for (const migration of migrations.filter((m) => m.version <= 5)) {
      for (const statement of migration.statements) {
        if (typeof statement === 'string') await db.execute(statement);
        else await db.run(statement.sql, statement.params ?? []);
      }
      await db.run('INSERT INTO schema_migrations VALUES (?, ?, ?)', [migration.version, migration.name, '2026-01-01T00:00:00.000Z']);
    }
    await db.run(
      "INSERT INTO categories (id, name, icon, color, is_active, sort_order, created_at, updated_at) VALUES ('c1', 'Comida', '🍔', '#111111', 1, 0, 'x', 'x')",
    );
    await db.run(
      "INSERT INTO payment_methods (id, name, type, icon, color, is_active, sort_order, created_at, updated_at) VALUES ('m1', 'Efectivo', 'cash', '💵', '#222222', 1, 0, 'x', 'x')",
    );
    await db.run(
      "INSERT INTO expenses (id, amount, category_id, payment_method_id, expense_date, created_at, updated_at, paid_at) VALUES ('e1', 9000, 'c1', 'm1', '2026-09-01', 'x', 'x', '2026-09-01')",
    );

    await runMigrations(db);
    await runMigrations(db); // idempotente

    const methods = await db.query<{ id: string; savings_account_id: string | null }>('SELECT id, savings_account_id FROM payment_methods');
    expect(methods).toEqual([{ id: 'm1', savings_account_id: null }]);
    expect(await db.query('SELECT id FROM expenses')).toHaveLength(1);
    expect(await db.query('SELECT id FROM savings_accounts')).toHaveLength(0);
    expect(await db.query('SELECT id FROM savings_movements')).toHaveLength(0);
  });

  it('las reglas de la base protegen los movimientos', async () => {
    const db = createTestDb()!;
    await runMigrations(db);
    await db.run("INSERT INTO savings_accounts (id, name, icon, color, created_at, updated_at) VALUES ('a1', 'Viaje', '🐷', '#111111', 'x', 'x')");
    const insert = (id: string, kind: string, amount: number, accountId = 'a1') =>
      db.run(
        'INSERT INTO savings_movements (id, account_id, kind, amount, movement_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, accountId, kind, amount, '2026-09-01', 'x'],
      );
    await insert('ok', 'deposit', 1000);
    await expectFails(insert('cero', 'deposit', 0));
    await expectFails(insert('tipo', 'transfer', 10));
    await expectFails(insert('huerfano', 'deposit', 10, 'no-existe'));
    // Dos cuentas no pueden compartir nombre, sin importar mayúsculas.
    await expectFails(db.run("INSERT INTO savings_accounts (id, name, icon, color, created_at, updated_at) VALUES ('a2', 'VIAJE', '🐷', '#111111', 'x', 'x')"));
    // Borrar la cuenta borra sus movimientos.
    await db.run("DELETE FROM savings_accounts WHERE id = 'a1'");
    expect(await db.query('SELECT id FROM savings_movements')).toHaveLength(0);
  });

  it('borrar un gasto borra el retiro que lo pagó', async () => {
    const db = createTestDb()!;
    await runMigrations(db);
    await seedDefaults(db);
    await db.run("INSERT INTO savings_accounts (id, name, icon, color, created_at, updated_at) VALUES ('a1', 'Viaje', '🐷', '#111111', 'x', 'x')");
    await db.run(
      "INSERT INTO expenses (id, amount, category_id, payment_method_id, expense_date, created_at, updated_at, paid_at) VALUES ('e1', 500, 'cat_alimentacion', 'pm_efectivo', '2026-09-01', 'x', 'x', '2026-09-01')",
    );
    await db.run(
      "INSERT INTO savings_movements (id, account_id, kind, amount, movement_date, expense_id, created_at) VALUES ('m1', 'a1', 'withdrawal', 500, '2026-09-01', 'e1', 'x')",
    );
    // Un gasto solo puede tener un retiro.
    await expectFails(
      db.run("INSERT INTO savings_movements (id, account_id, kind, amount, movement_date, expense_id, created_at) VALUES ('m2', 'a1', 'withdrawal', 500, '2026-09-01', 'e1', 'x')"),
    );
    await db.run("DELETE FROM expenses WHERE id = 'e1'");
    expect(await db.query('SELECT id FROM savings_movements')).toHaveLength(0);
  });
});

suite('migración 007: últimos 4 dígitos de la cuenta de ahorro', () => {
  it('una cuenta que ya existía queda sin dígitos y se pueden guardar después', async () => {
    const db = createTestDb()!;
    await db.execute(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    for (const migration of migrations.filter((m) => m.version <= 6)) {
      for (const statement of migration.statements) {
        if (typeof statement === 'string') await db.execute(statement);
        else await db.run(statement.sql, statement.params ?? []);
      }
      await db.run('INSERT INTO schema_migrations VALUES (?, ?, ?)', [migration.version, migration.name, '2026-01-01T00:00:00.000Z']);
    }
    await db.run("INSERT INTO savings_accounts (id, name, icon, color, created_at, updated_at) VALUES ('a1', 'Bancolombia', '🏦', '#111111', 'x', 'x')");

    await runMigrations(db);
    await runMigrations(db); // idempotente
    expect(await db.query('SELECT name, last4 FROM savings_accounts')).toEqual([{ name: 'Bancolombia', last4: null }]);
    await db.run("UPDATE savings_accounts SET last4 = '1234' WHERE id = 'a1'");
    expect(await db.query('SELECT last4 FROM savings_accounts')).toEqual([{ last4: '1234' }]);
  });
});

async function expectFails(work: Promise<unknown>): Promise<void> {
  let failed = false;
  try {
    await work;
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
}
