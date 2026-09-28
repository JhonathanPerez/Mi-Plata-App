import { beforeAll, describe, expect, it } from 'vitest';
import { DAVIBANK_CYCLE, NUBANK_CYCLE } from '@/config/seeds';
import { initDatabase } from '@/db';
import { setDbForTesting } from '@/db/connection';
import { runMigrations } from '@/db/migrate';
import { migration001 } from '@/db/migrations/001_init';
import { migration003 } from '@/db/migrations/003_pending_captures';
import { migration004 } from '@/db/migrations/004_paid_status_and_cycles';
import { parseCycleRules } from '@/lib/cycles';
import { createTestDb } from '@/test/sqliteTestDb';
import { backupService, parseBackup } from './backupService';
import { cardService } from './cardService';
import { expenseService } from './expenseService';
import { parseImportRows } from './importService';
import { paymentMethodService } from './paymentMethodService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;
const TODAY = '2026-09-20';
const NU = 'pm_nubank';
const DAVI = 'pm_davibank';
const CASH = 'pm_efectivo';

const add = (methodId: string, date: string, amount: number, paid?: boolean) =>
  expenseService.create({ amount, categoryId: 'cat_otros', paymentMethodId: methodId, date, time: null, note: null, paid });

suite('estado pagado / por pagar y extractos de tarjeta', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('las semillas traen las reglas de Nubank y Davibank', async () => {
    const methods = await paymentMethodService.list();
    expect(methods.find((m) => m.id === NU)?.cycle).toEqual(NUBANK_CYCLE);
    expect(methods.find((m) => m.id === DAVI)?.cycle).toEqual(DAVIBANK_CYCLE);
    expect(methods.find((m) => m.id === CASH)?.cycle).toBeNull();
  });

  it('con tarjeta de crédito arranca por pagar; con efectivo, pagado; se puede forzar', async () => {
    const card = await add(NU, '2026-08-10', 100000);
    const cash = await add(CASH, '2026-08-10', 5000);
    const forcedPaid = await add(NU, '2026-08-11', 7000, true);
    const forcedDue = await add(CASH, '2026-08-11', 9000, false);
    expect(card.paidAt).toBeNull();
    expect(cash.paidAt).toBe('2026-08-10');
    expect(forcedPaid.paidAt).toBe('2026-08-11');
    expect(forcedDue.paidAt).toBeNull();
  });

  it('al editar se conserva el estado; al marcar pagado se pone la fecha de hoy', async () => {
    const e = await add(NU, '2026-08-12', 1000);
    const edited = await expenseService.update(e.id, { amount: 1500, categoryId: 'cat_otros', paymentMethodId: NU, date: '2026-08-12', time: null, note: 'x' });
    expect(edited.paidAt).toBeNull();
    const paid = await expenseService.update(e.id, { amount: 1500, categoryId: 'cat_otros', paymentMethodId: NU, date: '2026-08-12', time: null, note: 'x', paid: true });
    expect(paid.paidAt).not.toBeNull();
    await expenseService.setPaid(e.id, false);
    expect((await expenseService.getById(e.id))?.paidAt).toBeNull();
    await expenseService.setPaid(e.id, true, '2026-09-01');
    expect((await expenseService.getById(e.id))?.paidAt).toBe('2026-09-01');
    await expenseService.remove(e.id);
  });

  it('el filtro por estado separa por pagar y pagados', async () => {
    const due = await expenseService.list({ status: 'due' });
    const paid = await expenseService.list({ status: 'paid' });
    expect(due.every((e) => e.paidAt === null)).toBe(true);
    expect(paid.every((e) => e.paidAt !== null)).toBe(true);
    expect(due.length + paid.length).toBe((await expenseService.list()).length);
  });

  it('Nubank hoy (20 sep): agosto está cerrado y por pagar; septiembre sigue abierto', async () => {
    await add(NU, '2026-08-28', 50000); // agosto
    await add(NU, '2026-09-03', 30000); // septiembre (abierto)
    await add(NU, '2026-09-19', 20000);
    const overview = (await cardService.getOverview(NU, TODAY))!;
    expect(overview.configured).toBe(true);
    const aug = overview.statements.find((s) => s.period === '2026-08')!;
    const sep = overview.statements.find((s) => s.period === '2026-09')!;
    expect(aug).toMatchObject({ cutDate: '2026-08-31', dueDate: '2026-09-20', closed: true, unpaidTotal: 150000 });
    expect(sep).toMatchObject({ cutDate: '2026-09-30', dueDate: '2026-10-20', closed: false, unpaidTotal: 50000 });
    expect(overview.payable.map((s) => s.period)).toEqual(['2026-08']);
    expect(overview.nextDue).toMatchObject({ date: '2026-09-20', amount: 150000, daysLeft: 0, overdue: false });
    expect(overview.unpaidTotal).toBe(200000);
  });

  it('pagar un extracto: marca lo elegido, lo demás sigue por pagar y las fechas quedan fijas', async () => {
    const overview = (await cardService.getOverview(NU, TODAY))!;
    const aug = overview.payable[0];
    const big = aug.expenses.find((e) => e.amount === 100000)!;
    const others = aug.expenses.filter((e) => e.id !== big.id && e.paidAt === null).map((e) => e.id);
    const result = await cardService.payExpenses(NU, others, '2026-09-19', TODAY);
    expect(result.paid).toBe(others.length);

    const after = (await cardService.getOverview(NU, TODAY))!;
    const augAfter = after.statements.find((s) => s.period === '2026-08')!;
    expect(augAfter.unpaidTotal).toBe(100000); // el que se dejó sin marcar
    expect(augAfter.lastPaidAt).toBe('2026-09-19');
    expect(augAfter.fixed).toBe(true);
    expect(after.payable).toHaveLength(1);
    expect(big.paidAt).toBeNull();
  });

  it('un extracto pagado conserva sus fechas aunque cambien las reglas', async () => {
    await paymentMethodService.setCycleRules(NU, { ...NUBANK_CYCLE, cut: { kind: 'day', day: 15 } });
    const after = (await cardService.getOverview(NU, TODAY))!;
    const aug = after.statements.find((s) => s.period === '2026-08')!;
    expect(aug).toMatchObject({ cutDate: '2026-08-31', dueDate: '2026-09-20', fixed: true });
    await paymentMethodService.setCycleRules(NU, NUBANK_CYCLE); // restablece
  });

  it('no deja pagar un extracto abierto ni gastos ajenos o ya pagados', async () => {
    const overview = (await cardService.getOverview(NU, TODAY))!;
    const open = overview.open!.expenses[0];
    await expect(cardService.payExpenses(NU, [open.id], TODAY, TODAY)).rejects.toThrow();
    const paidOne = overview.statements.find((s) => s.period === '2026-08')!.expenses.find((e) => e.paidAt !== null)!;
    await expect(cardService.payExpenses(NU, [paidOne.id], TODAY, TODAY)).rejects.toThrow();
    await expect(cardService.payExpenses(NU, [], TODAY, TODAY)).rejects.toThrow();
    await expect(cardService.payExpenses(NU, [open.id], '2026-12-01', TODAY)).rejects.toThrow(); // fecha futura
    await expect(cardService.payExpenses(DAVI, [paidOne.id], TODAY, TODAY)).rejects.toThrow(); // de otra tarjeta
  });

  it('si el pago falla no se marca nada (todo o nada)', async () => {
    const overview = (await cardService.getOverview(NU, TODAY))!;
    const pending = overview.payable[0].expenses.find((e) => e.paidAt === null)!;
    const open = overview.open!.expenses[0];
    await expect(cardService.payExpenses(NU, [pending.id, open.id], TODAY, TODAY)).rejects.toThrow();
    expect((await expenseService.getById(pending.id))?.paidAt).toBeNull();
  });

  it('Davibank: el corte parte el mes y el ajuste manual avisa qué gastos cambian', async () => {
    await add(DAVI, '2026-09-07', 10000);
    await add(DAVI, '2026-09-09', 20000);
    await add(DAVI, '2026-09-11', 30000);
    await add(DAVI, '2026-09-15', 5000);
    const overview = (await cardService.getOverview(DAVI, TODAY))!;
    const sep = overview.statements.find((s) => s.period === '2026-09')!;
    const oct = overview.statements.find((s) => s.period === '2026-10')!;
    expect(sep).toMatchObject({ cutDate: '2026-09-11', dueDate: '2026-10-13', closed: true, unpaidTotal: 60000 });
    expect(oct).toMatchObject({ cutDate: '2026-10-09', closed: false, unpaidTotal: 5000 });

    const preview = await cardService.previewStatementDates(DAVI, '2026-09', '2026-09-08', '2026-10-13');
    expect(preview.error).toBeNull();
    expect(preview.moved.map((m) => m.expense.amount).sort()).toEqual([20000, 30000]);
    expect(preview.totalBefore).toBe(60000);
    expect(preview.totalAfter).toBe(10000);

    await cardService.setStatementDates(DAVI, '2026-09', '2026-09-08', '2026-10-13');
    const moved = (await cardService.getOverview(DAVI, TODAY))!.statements.find((s) => s.period === '2026-09')!;
    expect(moved).toMatchObject({ cutDate: '2026-09-08', fixed: true, unpaidTotal: 10000 });

    await cardService.resetStatementDates(DAVI, '2026-09');
    expect((await cardService.getOverview(DAVI, TODAY))!.statements.find((s) => s.period === '2026-09')!.cutDate).toBe('2026-09-11');
  });

  it('rechaza fechas incoherentes y pide confirmar si el extracto ya tiene pagos', async () => {
    await expect(cardService.setStatementDates(DAVI, '2026-09', '2026-09-12', '2026-09-10')).rejects.toThrow(); // pago antes del corte
    await expect(cardService.setStatementDates(DAVI, '2026-09', '2026-08-01', '2026-10-13')).rejects.toThrow(); // cruza al anterior

    const sep = (await cardService.getOverview(DAVI, TODAY))!.statements.find((s) => s.period === '2026-09')!;
    await cardService.payExpenses(DAVI, sep.expenses.map((e) => e.id), TODAY, TODAY);
    await expect(cardService.setStatementDates(DAVI, '2026-09', '2026-09-10', '2026-10-13')).rejects.toThrow(); // sin confirmar
    await cardService.setStatementDates(DAVI, '2026-09', '2026-09-10', '2026-10-13', { confirmPaid: true });
  });

  it('el resumen de Inicio agrupa lo que está por pagar por tarjeta', async () => {
    const summary = await cardService.dueSummary(TODAY);
    const nu = summary.cards.find((c) => c.methodId === NU)!;
    expect(nu).toMatchObject({ name: 'Nubank', hasClosedStatement: true, configured: true });
    expect(nu.total).toBe(200000 - 50000);
    expect(summary.total).toBe(summary.cards.reduce((t, c) => t + c.total, 0));
    expect(summary.other.count).toBeGreaterThan(0); // el gasto en efectivo marcado por pagar
  });

  it('las tarjetas se ordenan por urgencia: primero la que vence antes', async () => {
    const overviews = await cardService.listOverviews(TODAY);
    const dues = overviews.map((o) => o.nextDue?.date ?? '9999');
    expect(dues).toEqual([...dues].sort());
  });

  it('setCycleRules valida y solo aplica a tarjetas de crédito', async () => {
    await expect(paymentMethodService.setCycleRules(CASH, NUBANK_CYCLE)).rejects.toThrow();
    const bad = { cut: { kind: 'day' as const, day: 25 }, due: { kind: 'day' as const, day: 10 }, dueNextMonth: false, weekend: 'keep' as const };
    await expect(paymentMethodService.setCycleRules(NU, bad)).rejects.toThrow();
    const cleared = await paymentMethodService.setCycleRules(NU, null);
    expect(cleared.cycle).toBeNull();
    expect((await cardService.getOverview(NU, TODAY))!.configured).toBe(false);
    await paymentMethodService.setCycleRules(NU, NUBANK_CYCLE);
  });

  it('el respaldo conserva estados, reglas y fechas fijas, y una copia antigua se restaura como pagada', async () => {
    const backup = await backupService.createBackup();
    expect(backup.version).toBe(2);
    expect(backup.data.cardStatementDates.length).toBeGreaterThan(0);
    const dueBefore = (await expenseService.list({ status: 'due' })).length;

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.data.paymentMethods.find((m) => m.id === NU)?.cycle).toEqual(NUBANK_CYCLE);
    await backupService.restore(JSON.stringify(backup));
    expect((await expenseService.list({ status: 'due' })).length).toBe(dueBefore);
    expect((await cardService.getOverview(NU, TODAY))!.statements.find((s) => s.period === '2026-08')?.fixed).toBe(true);

    // Copia de la versión 1: sin paidAt ni reglas.
    const old = JSON.parse(JSON.stringify(backup));
    old.version = 1;
    delete old.data.cardStatementDates;
    for (const e of old.data.expenses) delete e.paidAt;
    for (const m of old.data.paymentMethods) delete m.cycle;
    const legacy = parseBackup(JSON.stringify(old));
    expect(legacy.data.expenses.every((e) => e.paidAt === e.date)).toBe(true);
    expect(legacy.data.paymentMethods.every((m) => m.cycle === null)).toBe(true);
    await backupService.restore(JSON.stringify(old));
    expect((await expenseService.list({ status: 'due' })).length).toBe(0);
  });
});

describe('importación con columna Estado', () => {
  it('sin la columna todo entra pagado; con ella se respeta', () => {
    const base = [
      ['Fecha', 'Categoría', 'Descripción', 'Método de pago', 'Valor'],
      ['2026-09-01', 'Otros', 'a', 'Nubank', 1000],
    ];
    expect(parseImportRows(base).rows[0].paid).toBe(true);
    const withStatus = [
      ['Fecha', 'Categoría', 'Descripción', 'Método de pago', 'Valor', 'Estado'],
      ['2026-09-01', 'Otros', 'a', 'Nubank', 1000, 'Por pagar'],
      ['2026-09-02', 'Otros', 'b', 'Nubank', 2000, 'Pagado'],
      ['2026-09-03', 'Otros', 'c', 'Nubank', 3000, ''],
    ];
    expect(parseImportRows(withStatus).rows.map((r) => r.paid)).toEqual([false, true, true]);
  });
});

const migrationSuite = testDb ? describe : describe.skip;
migrationSuite('migración 004 sobre una instalación existente', () => {
  it('lo ya registrado queda pagado y solo Nubank/Davibank reciben reglas (sin pisar las del usuario)', async () => {
    const db = createTestDb()!;
    await db.execute('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const statement of migration001.statements) await db.execute(statement as string);
    await db.run("INSERT INTO schema_migrations VALUES (1, 'init', 'x'), (2, 'a', 'x'), (3, 'b', 'x')");
    await db.execute(migration003.statements[0] as string); // pending_captures con su esquema real (la 003 ya estaba aplicada)
    const now = '2026-01-01T00:00:00.000Z';
    await db.run(`INSERT INTO categories (id, name, icon, color, is_active, sort_order, created_at, updated_at) VALUES ('c', 'C', '🍔', '#111111', 1, 0, ?, ?)`, [now, now]);
    await db.run(
      `INSERT INTO payment_methods (id, name, type, icon, color, is_active, sort_order, created_at, updated_at) VALUES
        ('pm_nubank', 'Nubank', 'credit_card', '💳', '#111111', 1, 0, ?, ?),
        ('pm_davibank', 'Davibank', 'credit_card', '💳', '#222222', 1, 1, ?, ?),
        ('pm_efectivo', 'Efectivo', 'cash', '💵', '#333333', 1, 2, ?, ?)`,
      [now, now, now, now, now, now],
    );
    await db.run(`INSERT INTO expenses (id, amount, category_id, payment_method_id, expense_date, created_at, updated_at) VALUES ('e1', 1000, 'c', 'pm_nubank', '2026-08-15', ?, ?)`, [now, now]);

    await runMigrations(db);
    await runMigrations(db); // idempotente
    const expense = await db.query<{ paid_at: string }>("SELECT paid_at FROM expenses WHERE id = 'e1'");
    expect(expense[0].paid_at).toBe('2026-08-15');
    const rules = await db.query<{ id: string; cycle_rules: string | null }>('SELECT id, cycle_rules FROM payment_methods ORDER BY id');
    const byId = new Map(rules.map((r) => [r.id, r.cycle_rules]));
    expect(parseCycleRules(byId.get('pm_nubank'))).toEqual(NUBANK_CYCLE);
    expect(parseCycleRules(byId.get('pm_davibank'))).toEqual(DAVIBANK_CYCLE);
    expect(byId.get('pm_efectivo')).toBeNull();
  });

  it('el JSON de la migración coincide con las semillas (no se desincronizan)', () => {
    const params = migration004.statements.flatMap((s) => (typeof s === 'string' ? [] : (s.params ?? [])));
    expect(params.map((p) => parseCycleRules(String(p)))).toEqual([NUBANK_CYCLE, DAVIBANK_CYCLE]);
  });
});
