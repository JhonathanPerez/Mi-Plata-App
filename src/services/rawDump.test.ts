import { beforeAll, describe, expect, it } from 'vitest';
import { initDatabase } from '@/db';
import { getDb, setDbForTesting } from '@/db/connection';
import { RAW_DUMP_FORMAT } from '@/lib/rawDump';
import { cardCycleRepository } from '@/repositories/cardCycleRepository';
import { settingsRepository } from '@/repositories/settingsRepository';
import { createTestDb } from '@/test/sqliteTestDb';
import { backupService, parseBackup } from './backupService';
import { budgetService } from './budgetService';
import { expenseService } from './expenseService';
import { savingsService } from './savingsService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;

// Las tablas que copia la tarea en segundo plano de Android (ver BackupWorker.java / SqliteDumpSource.java).
const TABLES = ['categories', 'payment_methods', 'expenses', 'budgets', 'settings', 'card_statement_dates', 'savings_accounts', 'savings_movements'];

/** Para comparar sin depender del orden en que cada consulta devuelve las filas. */
const sorted = (items: unknown[]) => [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const normalize = (data: Record<string, unknown[]>) => Object.fromEntries(Object.entries(data).map(([key, items]) => [key, sorted(items)]));

suite('un volcado de la base de datos se restaura igual que una copia normal', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('el volcado, ya convertido, tiene exactamente los mismos datos que la copia que arma la app', async () => {
    const account = await savingsService.createAccount({ name: 'Viaje', last4: '1234', icon: '🏦', color: '#2A9D8F', isActive: true }, 500_000);
    await savingsService.addMovement({ accountId: account.id, kind: 'deposit', amount: 120_000, date: '2026-10-05', note: 'Ahorro "del mes" — ñ 🎉' });
    await expenseService.create({ amount: 18_500, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_efectivo', date: '2026-10-10', time: '13:45', note: 'Almuerzo\ncon "comillas" y tildes: áéíóú', observations: 'Con el equipo\ty la jefa' });
    await expenseService.create({ amount: 42_000, categoryId: 'cat_transporte', paymentMethodId: 'pm_nubank', date: '2026-10-12', time: null, note: null, paid: false });
    await budgetService.setBudget('2026-10', 1_500_000);
    await settingsRepository.set('mi_ajuste', 'valor con «comillas» y \\ barra');
    await cardCycleRepository.upsert({ paymentMethodId: 'pm_nubank', period: '2026-10', cutDate: '2026-10-15', dueDate: '2026-11-02' });

    const normal = await backupService.createBackup();
    const db = await getDb();
    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) tables[table] = await db.query(`SELECT * FROM ${table}`);
    // Pasa por texto, como el archivo real que escribe la tarea.
    const dump = JSON.stringify({ format: RAW_DUMP_FORMAT, version: 1, app: 'Mi Plata', exportedAt: normal.exportedAt, tables });

    const parsed = parseBackup(dump);
    expect(normalize(parsed.data as unknown as Record<string, unknown[]>)).toEqual(normalize(normal.data as unknown as Record<string, unknown[]>));
    expect(parsed.data.expenses.length).toBe(2);

    // Y restaurarlo deja la base igual que antes.
    await backupService.restore(dump);
    const after = await backupService.createBackup();
    expect(normalize(after.data as unknown as Record<string, unknown[]>)).toEqual(normalize(normal.data as unknown as Record<string, unknown[]>));
  });
});
