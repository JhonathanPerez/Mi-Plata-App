import { beforeAll, describe, expect, it } from 'vitest';
import { setDbForTesting } from '@/db/connection';
import { initDatabase } from '@/db';
import { createTestDb } from '@/test/sqliteTestDb';
import { captureService, suggestPaymentMethodId, type RawCaptureEvent } from './captureService';
import { expenseService } from './expenseService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;
const NU = 'com.nu.production';
const SMS = 'com.google.android.apps.messaging';
const NOW = Date.UTC(2026, 8, 19, 15, 0, 0);

const event = (over: Partial<RawCaptureEvent> = {}): RawCaptureEvent => ({
  pkg: NU,
  title: 'Compra aprobada',
  text: 'Pagaste $25.000 en RAPPI con tu tarjeta terminada en 1234',
  time: NOW,
  capturedAt: NOW + 1000,
  ...over,
});

suite('captura automática con SQLite real', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('la migración crea la tabla y arranca vacía', async () => {
    expect(await captureService.countPending()).toBe(0);
  });

  it('guarda un aviso de compra con valor, comercio, banco y tarjeta', async () => {
    const summary = await captureService.ingestEvents([event()]);
    expect(summary).toEqual({ added: 1, skipped: 0 });
    const [item] = await captureService.listPending();
    expect(item).toMatchObject({ amount: 25000, merchant: 'Rappi', bank: 'nubank', last4: '1234', source: NU });
    expect(item.rawText).toBe('Compra aprobada — Pagaste $25.000 en RAPPI con tu tarjeta terminada en 1234');
  });

  it('la misma notificación republicada no se duplica', async () => {
    const summary = await captureService.ingestEvents([event({ time: NOW + 30_000, capturedAt: NOW + 31_000 })]);
    expect(summary).toEqual({ added: 0, skipped: 1 });
    expect(await captureService.countPending()).toBe(1);
  });

  it('el mismo texto mucho después sí es otra compra', async () => {
    const later = NOW + 60 * 60 * 1000;
    const summary = await captureService.ingestEvents([event({ time: later, capturedAt: later })]);
    expect(summary.added).toBe(1);
    expect(await captureService.countPending()).toBe(2);
  });

  it('descarta lo que no es un gasto y el historial viejo de SMS', async () => {
    const summary = await captureService.ingestEvents([
      event({ pkg: SMS, title: 'Mamá', text: 'Recibiste $50.000 de Juan' }),
      event({ pkg: SMS, title: 'Bancolombia', text: 'Tu código para autorizar la compra por $9.000 es 123456' }),
      event({ pkg: SMS, title: 'Bancolombia', text: 'Compra por $70.000 en EXITO', time: NOW - 24 * 3600 * 1000 }),
    ]);
    expect(summary).toEqual({ added: 0, skipped: 3 });
    expect(await captureService.countPending()).toBe(2);
  });

  it('pegar un mensaje: lo agrega, avisa del duplicado y explica los rechazos', async () => {
    const text = 'Bancolombia le informa Compra por $52.900 en MERCADO LIBRE T.Cre *4321';
    const first = await captureService.addFromText(text, NOW);
    expect(first.status).toBe('added');
    expect((await captureService.addFromText(text, NOW + 3600_000)).status).toBe('duplicate');
    expect(await captureService.addFromText('Hola, ¿cómo estás?', NOW)).toEqual({ status: 'rejected', reason: 'no-amount' });
    expect(await captureService.countPending()).toBe(3);
  });

  it('categorizar crea el gasto, resuelve el aviso y borra el texto original', async () => {
    const pending = (await captureService.listPending()).find((p) => p.merchant === 'Mercado Libre')!;
    const expense = await expenseService.create(
      { amount: pending.amount, categoryId: 'cat_compras', paymentMethodId: 'pm_nubank', date: '2026-09-19', time: '10:05', note: pending.merchant },
      { fromPendingId: pending.id },
    );
    expect(expense.amount).toBe(52900);
    expect(await captureService.getPending(pending.id)).toBeNull();
    expect(await captureService.countPending()).toBe(2);

    const rows = await testDb!.query<{ raw_text: string; status: string }>(
      'SELECT raw_text, status FROM pending_captures WHERE id = ?',
      [pending.id],
    );
    expect(rows[0]).toMatchObject({ raw_text: '', status: 'accepted' });

    // Aunque la app de SMS republique el mensaje, no reaparece.
    const again = await captureService.addFromText('Bancolombia le informa Compra por $52.900 en MERCADO LIBRE T.Cre *4321', NOW + 5000);
    expect(again.status).toBe('duplicate');
  });

  it('si el gasto no es válido, el aviso sigue pendiente (todo o nada)', async () => {
    const pending = (await captureService.listPending())[0];
    await expect(
      expenseService.create(
        { amount: 0, categoryId: 'cat_compras', paymentMethodId: 'pm_nubank', date: '2026-09-19', time: null, note: null },
        { fromPendingId: pending.id },
      ),
    ).rejects.toThrow();
    expect(await captureService.getPending(pending.id)).toBeTruthy();
  });

  it('descartar resuelve el aviso; la limpieza borra solo lo viejo y resuelto', async () => {
    const [pending] = await captureService.listPending();
    await captureService.dismiss(pending.id);
    expect(await captureService.getPending(pending.id)).toBeNull();

    await captureService.pruneOld(Date.now()); // recién resuelto: se conserva
    const kept = await testDb!.query('SELECT id FROM pending_captures WHERE id = ?', [pending.id]);
    expect(kept).toHaveLength(1);

    await captureService.pruneOld(Date.now() + 61 * 86_400_000);
    const gone = await testDb!.query('SELECT id FROM pending_captures WHERE id = ?', [pending.id]);
    expect(gone).toHaveLength(0);
    expect(await captureService.countPending()).toBe(1); // el pendiente vivo no se toca
  });
});

describe('suggestPaymentMethodId', () => {
  const methods = [
    { id: 'pm_efectivo', name: 'Efectivo', last4: null, isActive: true },
    { id: 'pm_davibank', name: 'Davibank', last4: null, isActive: true },
    { id: 'pm_nubank', name: 'Nubank', last4: '1234', isActive: true },
    { id: 'pm_otra', name: 'Otra Nu', last4: '9999', isActive: true },
    { id: 'pm_vieja', name: 'Bancolombia', last4: null, isActive: false },
  ];

  it('prioriza los últimos 4 dígitos', () => {
    expect(suggestPaymentMethodId(methods, { bank: null, last4: '9999' })).toBe('pm_otra');
  });
  it('si no, usa el banco (Davivienda ↔ Davibank)', () => {
    expect(suggestPaymentMethodId(methods, { bank: 'davivienda', last4: null })).toBe('pm_davibank');
    expect(suggestPaymentMethodId(methods, { bank: 'nubank', last4: '0000' })).toBe('pm_nubank');
  });
  it('ignora métodos ocultos y devuelve null sin coincidencia clara', () => {
    expect(suggestPaymentMethodId(methods, { bank: 'bancolombia', last4: null })).toBeNull();
    expect(suggestPaymentMethodId(methods, { bank: null, last4: null })).toBeNull();
  });
});
