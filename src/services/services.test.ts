import { beforeAll, describe, expect, it } from 'vitest';
import { setDbForTesting } from '@/db/connection';
import { initDatabase } from '@/db';
import { createTestDb } from '@/test/sqliteTestDb';
import { expenseService, validateExpenseInput } from './expenseService';
import { categoryService } from './categoryService';
import { paymentMethodService } from './paymentMethodService';
import { budgetService, computeBudgetStatus } from './budgetService';
import { statsService } from './statsService';
import { backupService, parseBackup } from './backupService';
import { buildExportData, rangeForMonth } from './exportData';
import { importRows } from './importService';
import { settingsService } from './settingsService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;

suite('servicios con SQLite real', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('siembra categorías y métodos por defecto', async () => {
    const categories = await categoryService.list();
    const methods = await paymentMethodService.list();
    expect(categories).toHaveLength(12);
    expect(methods.map((m) => m.name)).toEqual(['Efectivo', 'Davibank', 'Nubank', 'RappiCard', 'Transferencia']);
  });

  it('valida gastos', () => {
    const base = { amount: 35000, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_nubank', date: '2026-09-19', time: null, note: null };
    expect(validateExpenseInput(base)).toEqual({});
    expect(validateExpenseInput({ ...base, amount: 0 }).amount).toBeTruthy();
    expect(validateExpenseInput({ ...base, amount: -5 }).amount).toBeTruthy();
    expect(validateExpenseInput({ ...base, amount: 10.5 }).amount).toBeTruthy();
    expect(validateExpenseInput({ ...base, categoryId: '' }).category).toBeTruthy();
    expect(validateExpenseInput({ ...base, date: '2026-02-30' }).date).toBeTruthy();
    expect(validateExpenseInput({ ...base, time: '25:00' }).time).toBeTruthy();
  });

  it('crea, edita, filtra y elimina gastos', async () => {
    const created = await expenseService.create({
      amount: 35000, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_nubank',
      date: '2026-09-19', time: '13:10', note: '  Almuerzo  ',
    });
    expect(created.note).toBe('Almuerzo');
    await expenseService.create({
      amount: 12000, categoryId: 'cat_transporte', paymentMethodId: 'pm_efectivo',
      date: '2026-09-18', time: null, note: 'Bus a la universidad',
    });
    await expenseService.create({
      amount: 250000, categoryId: 'cat_compras', paymentMethodId: 'pm_rappicard',
      date: '2026-08-30', time: null, note: 'Zapatos',
    });

    expect(await expenseService.list({ from: '2026-09-01', to: '2026-09-30' })).toHaveLength(2);
    expect(await expenseService.list({ categoryIds: ['cat_compras'] })).toHaveLength(1);
    expect(await expenseService.list({ paymentMethodIds: ['pm_nubank', 'pm_efectivo'] })).toHaveLength(2);
    expect(await expenseService.list({ minAmount: 30000 })).toHaveLength(2);
    expect(await expenseService.list({ maxAmount: 20000 })).toHaveLength(1);
    expect((await expenseService.list({ search: 'universidad' }))[0].amount).toBe(12000);
    expect(await expenseService.list({ search: 'ALIMENTACION' })).toHaveLength(1);
    expect(await expenseService.list({ search: '250.000' })).toHaveLength(1);

    const updated = await expenseService.update(created.id, {
      amount: 40000, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_nubank',
      date: '2026-09-19', time: null, note: null,
    });
    expect(updated.amount).toBe(40000);
    expect(updated.note).toBeNull();

    await expect(expenseService.create({
      amount: 100, categoryId: 'no-existe', paymentMethodId: 'pm_nubank', date: '2026-09-19', time: null, note: null,
    })).rejects.toThrow();

    const temp = await expenseService.create({
      amount: 500, categoryId: 'cat_otros', paymentMethodId: 'pm_efectivo', date: '2026-09-01', time: null, note: null,
    });
    await expenseService.remove(temp.id);
    expect(await expenseService.getById(temp.id)).toBeNull();
  });

  it('protege categorías y métodos con gastos', async () => {
    await expect(categoryService.remove('cat_alimentacion')).rejects.toThrow(/no se puede eliminar/);
    await expect(paymentMethodService.remove('pm_nubank')).rejects.toThrow(/no se puede eliminar/);
    const nueva = await categoryService.create({ name: 'Mascotas', icon: '🐾', color: '#2A9D8F' });
    const propia = await categoryService.create({ name: 'Colombia', icon: '🇨🇴', color: '#2A9D8F' });
    expect(propia.icon).toBe('🇨🇴');
    await categoryService.remove(propia.id);
    await expect(categoryService.create({ name: 'Letras', icon: 'abc', color: '#2A9D8F' })).rejects.toThrow(/emoji/);
    await expect(categoryService.create({ name: 'mascotas' })).rejects.toThrow(/Ya existe/);
    await categoryService.remove(nueva.id);
    const tarjeta = await paymentMethodService.create({ name: 'Bancolombia', type: 'credit_card', last4: '1234' });
    expect(tarjeta.last4).toBe('1234');
    await expect(paymentMethodService.create({ name: 'Otra', type: 'credit_card', last4: '12345678' })).rejects.toThrow();
    const efectivo = await paymentMethodService.create({ name: 'Billetera', type: 'cash', last4: '1234' });
    expect(efectivo.last4).toBeNull();
  });

  it('calcula presupuesto y su herencia entre meses', async () => {
    await budgetService.setBudget('2026-08', 3000000);
    expect((await budgetService.getStatus('2026-09')).budget).toBe(3000000);
    expect((await budgetService.getStatus('2026-07')).hasBudget).toBe(false);
    const status = computeBudgetStatus('2026-09', 3000000, 2350000);
    expect(status.available).toBe(650000);
    expect(Math.round(status.percentUsed)).toBe(78);
    expect(status.level).toBe('ok');
    expect(computeBudgetStatus('2026-09', 1000, 1200).level).toBe('over');
    expect(computeBudgetStatus('2026-09', 1000, 1200).overBy).toBe(200);
    expect(computeBudgetStatus('2026-09', 1000, 900).level).toBe('near');
    expect(computeBudgetStatus('2026-09', 0, 900).level).toBe('none');
  });

  it('genera estadísticas del dashboard y del resumen mensual', async () => {
    const now = new Date(2026, 8, 19);
    const dash = await statsService.getDashboard(now);
    expect(dash.todayTotal).toBe(40000);
    expect(dash.monthTotal).toBe(52000);
    expect(dash.topCategory?.name).toBe('Alimentación');
    expect(dash.budget.available).toBe(3000000 - 52000);
    expect(dash.recent.length).toBeGreaterThan(0);

    const summary = await statsService.getMonthlySummary('2026-09', now);
    expect(summary.transactions).toBe(2);
    expect(summary.previousTotal).toBe(250000);
    expect(Math.round(summary.changePercent ?? 0)).toBe(-79);
    expect(summary.daily).toHaveLength(30);
    expect(Math.round(summary.dailyAverage)).toBe(Math.round(52000 / 19));
  });

  it('arma los datos de exportación', async () => {
    const data = await buildExportData(rangeForMonth('2026-09'), new Date(2026, 8, 19));
    expect(data.rows.map((r) => r.amount)).toEqual([12000, 40000]);
    expect(data.rows[0]).toMatchObject({ date: '2026-09-18', category: 'Transporte', method: 'Efectivo', note: 'Bus a la universidad' });
    expect(data.summary.total).toBe(52000);
    expect(data.summary.byMonth).toHaveLength(0);
    const year = await buildExportData({ from: '2026-01-01', to: '2026-12-31', label: 'Año 2026', fileBase: 'x' }, new Date(2026, 8, 19));
    expect(year.summary.byMonth).toHaveLength(2);
  });

  it('importa filas, omite duplicados y crea lo que falta', async () => {
    const rows = [
      { line: 2, date: '2026-09-18', category: 'Transporte', method: 'Efectivo', note: 'Bus a la universidad', amount: 12000, paid: true },
      { line: 3, date: '2026-09-10', category: 'Café', method: 'Tarjeta X', note: null, amount: 8000, paid: true },
    ];
    const result = await importRows(rows);
    expect(result).toMatchObject({ imported: 1, duplicates: 1, createdCategories: 1, createdMethods: 1 });
  });

  it('recuerda si el usuario dejó los valores ocultos', async () => {
    expect(await settingsService.getHideAmounts()).toBe(false);
    await settingsService.setHideAmounts(true);
    expect(await settingsService.getHideAmounts()).toBe(true);
    await settingsService.setHideAmounts(false);
    expect(await settingsService.getHideAmounts()).toBe(false);
  });

  it('respalda y restaura', async () => {
    const backup = await backupService.createBackup();
    const text = JSON.stringify(backup);
    const before = (await expenseService.list()).length;
    await expenseService.create({
      amount: 999, categoryId: 'cat_otros', paymentMethodId: 'pm_efectivo', date: '2026-09-02', time: null, note: 'temporal',
    });
    const result = await backupService.restore(text);
    expect(result.expenses).toBe(before);
    expect((await expenseService.list()).length).toBe(before);
    expect(() => parseBackup('no es json')).toThrow();
    expect(() => parseBackup(JSON.stringify({ format: 'otro' }))).toThrow();
    const broken = JSON.parse(text);
    broken.data.expenses[0].categoryId = 'fantasma';
    expect(() => parseBackup(JSON.stringify(broken))).toThrow();
  });
});
