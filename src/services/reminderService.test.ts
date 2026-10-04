import { beforeAll, describe, expect, it } from 'vitest';
import { initDatabase } from '@/db';
import { setDbForTesting } from '@/db/connection';
import { createTestDb } from '@/test/sqliteTestDb';
import { cardService } from './cardService';
import { expenseService } from './expenseService';
import { pendingCaptureRepository } from '@/repositories/pendingCaptureRepository';
import { paymentMethodService } from './paymentMethodService';
import { reminderService } from './reminderService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;
const NOW = new Date(2026, 8, 20, 10, 0, 0); // 20 sep 2026, 10:00 hora local
const NU = 'pm_nubank';
const DAVI = 'pm_davibank';
const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
const add = (methodId: string, date: string, amount: number) =>
  expenseService.create({ amount, categoryId: 'cat_otros', paymentMethodId: methodId, date, time: null, note: null });

suite('avisos de pago con datos reales', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
    await add(NU, '2026-08-28', 50000); // extracto de agosto (vence hoy)
    await add(NU, '2026-09-03', 30000); // ciclo de septiembre (abierto)
    await add(DAVI, '2026-09-09', 20000); // extracto de septiembre de Davibank (cerró el 11 sep)
    await add(DAVI, '2026-09-11', 30000);
    await add(DAVI, '2026-09-15', 5000); // ciclo abierto de Davibank
  });

  it('por defecto los avisos vienen apagados, 1 día antes y el mismo día, a las 9:00', async () => {
    expect(await reminderService.getSettings()).toEqual({ enabled: false, leadDays: [1, 0], hour: 9 });
    expect(await reminderService.buildPlan(NOW)).toEqual([]);
  });

  it('guarda y normaliza los ajustes', async () => {
    await reminderService.setEnabled(true);
    await reminderService.setLeadDays([0, 3, 1, 1]);
    await reminderService.setHour(18);
    expect(await reminderService.getSettings()).toEqual({ enabled: true, leadDays: [3, 1, 0], hour: 18 });
    await reminderService.setHour(7); // hora no ofrecida → 9:00
    await reminderService.setLeadDays([]); // vacío → valor por defecto
    expect(await reminderService.getSettings()).toEqual({ enabled: true, leadDays: [1, 0], hour: 9 });
  });

  it('el plan sale de los extractos reales: lo cerrado con monto y lo abierto sin cifra', async () => {
    await reminderService.setLeadDays([1, 0]);
    await reminderService.setHour(18);
    const plan = await reminderService.buildPlan(NOW);
    expect(plan.map((p) => `${p.methodId} ${p.period} ${stamp(p.at)}`)).toEqual([
      'pm_nubank 2026-08 2026-09-20 18:00', // vence hoy y son las 10:00: todavía llega esta tarde
      'pm_davibank 2026-09 2026-10-12 18:00',
      'pm_davibank 2026-09 2026-10-13 18:00',
      'pm_nubank 2026-09 2026-10-19 18:00',
      'pm_nubank 2026-09 2026-10-20 18:00',
      'pm_davibank 2026-10 2026-11-09 18:00', // ciclo abierto de Davibank (corta el 9 oct, se paga el 10 nov)
      'pm_davibank 2026-10 2026-11-10 18:00',
    ]);
    expect(plan[0]).toMatchObject({ title: 'Hoy vence el pago de Nubank', body: 'Tu extracto de agosto ($50.000) vence hoy.' });
    expect(plan[1].body).toBe('Tu extracto de septiembre ($50.000) vence mañana.');
    expect(plan[3].body).toBe('El pago de Nubank vence mañana. Revisa cuánto debes antes de pagar.'); // ciclo abierto: sin cifra
  });

  it('al pagar un extracto se le quitan sus avisos', async () => {
    const overview = (await cardService.getOverview(NU, '2026-09-20'))!;
    const aug = overview.payable[0];
    await cardService.payExpenses(NU, aug.expenses.filter((e) => e.paidAt === null).map((e) => e.id), '2026-09-20', '2026-09-20');
    const plan = await reminderService.buildPlan(NOW);
    expect(plan.some((p) => p.methodId === NU && p.period === '2026-08')).toBe(false);
    expect(plan.some((p) => p.methodId === NU && p.period === '2026-09')).toBe(true); // el ciclo abierto sigue
  });

  it('una tarjeta sin reglas de corte y pago no genera avisos', async () => {
    await paymentMethodService.setCycleRules(DAVI, null);
    const plan = await reminderService.buildPlan(NOW);
    expect(plan.some((p) => p.methodId === DAVI)).toBe(false);
  });

  it('apagado, no hay nada que programar', async () => {
    await reminderService.setEnabled(false);
    expect(await reminderService.buildPlan(NOW)).toEqual([]);
  });

  it('el recordatorio de pendientes dice el valor si hay una sola compra y cuántas si hay varias', async () => {
    const capture = (id: string, amount: number) =>
      pendingCaptureRepository.insert({
        id,
        source: 'manual',
        bank: null,
        amount,
        merchant: null,
        last4: null,
        rawText: `compra ${id}`,
        occurredAt: NOW.getTime(),
        fingerprint: `fp_${id}`,
        status: 'pending',
        createdAt: NOW.toISOString(),
        resolvedAt: null,
      });
    await reminderService.setPendingEnabled(true);
    expect(await reminderService.buildPendingPlan(NOW)).toEqual([]); // sin pendientes no hay avisos

    await capture('pc_1', 25000);
    expect((await reminderService.buildPendingPlan(NOW))[0].body).toBe('Tienes una compra por $25.000 pendiente por categorizar');

    await capture('pc_2', 8000);
    expect((await reminderService.buildPendingPlan(NOW))[0].body).toBe('Tienes 2 compras pendientes por categorizar');
    expect(await reminderService.countPending()).toBe(2);
  });
});
