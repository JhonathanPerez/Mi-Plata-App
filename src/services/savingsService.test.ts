import { beforeAll, describe, expect, it } from 'vitest';
import { setDbForTesting } from '@/db/connection';
import { initDatabase } from '@/db';
import { createTestDb } from '@/test/sqliteTestDb';
import { addDays, currentYearMonth, todayIso } from '@/lib/dates';
import { backupService, parseBackup } from './backupService';
import { expenseService } from './expenseService';
import { importRows } from './importService';
import { paymentMethodService } from './paymentMethodService';
import { savingsService } from './savingsService';
import { suggestPaymentMethodId } from './captureService';
import { statsService } from './statsService';

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;

const NEW = { last4: null, icon: '🏦', color: '#2A9D8F', isActive: true };
const today = todayIso();

async function methodOf(accountId: string) {
  return (await paymentMethodService.list(true)).find((m) => m.savingsAccountId === accountId)!;
}

async function expectRejects(work: Promise<unknown>, text: string) {
  let message = '';
  try {
    await work;
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message, `debía fallar con «${text}»`).toContain(text);
}

suite('cuentas de ahorro con SQLite real', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('crea cuentas con saldo inicial y su método de pago espejo', async () => {
    const viaje = await savingsService.createAccount({ ...NEW, name: '  Viaje  ' }, 500_000);
    const moto = await savingsService.createAccount({ ...NEW, name: 'Moto' });
    expect(viaje.name).toBe('Viaje');

    const accounts = await savingsService.listAccounts();
    expect(accounts.map((a) => [a.name, a.balance, a.movementCount])).toEqual([['Viaje', 500_000, 1], ['Moto', 0, 0]]);

    const mirror = await methodOf(viaje.id);
    expect(mirror.name).toBe('Viaje');
    expect(mirror.type).toBe('other');
    // El espejo no aparece en «Métodos de pago».
    const managed = await paymentMethodService.listWithCounts();
    expect(managed.some((m) => m.savingsAccountId)).toBe(false);
    expect(moto.id).not.toBe(viaje.id);
  });

  it('no repite nombres entre cuentas ni con métodos de pago', async () => {
    await expectRejects(savingsService.createAccount({ ...NEW, name: 'viaje' }), 'Ya existe');
    await expectRejects(savingsService.createAccount({ ...NEW, name: 'Nubank' }), 'Ya existe');
    await expectRejects(paymentMethodService.create({ name: 'Viaje', type: 'other' }), 'Ya existe');
    await expectRejects(savingsService.createAccount({ ...NEW, name: '   ' }), 'nombre');
    await expectRejects(savingsService.createAccount({ ...NEW, name: 'Nueva' }, -5), 'saldo inicial');
  });

  it('mete y saca plata y lo deja en los movimientos con su saldo', async () => {
    const moto = (await savingsService.listAccounts()).find((a) => a.name === 'Moto')!;
    await savingsService.addMovement({ accountId: moto.id, kind: 'deposit', amount: 300_000, date: '2026-09-01', note: ' Quincena ' });
    await savingsService.addMovement({ accountId: moto.id, kind: 'withdrawal', amount: 100_000, date: '2026-09-05', note: null });

    const detail = (await savingsService.getDetail(moto.id))!;
    expect(detail.balance).toBe(200_000);
    expect(detail.totals).toEqual({ deposited: 300_000, withdrawn: 100_000 });
    expect(detail.movements.map((m) => [m.kind, m.amount, m.balanceAfter, m.note])).toEqual([
      ['withdrawal', 100_000, 200_000, null],
      ['deposit', 300_000, 300_000, 'Quincena'],
    ]);
  });

  it('no deja sacar más de lo que hay ni mover plata con datos inválidos', async () => {
    const moto = (await savingsService.listAccounts()).find((a) => a.name === 'Moto')!;
    await expectRejects(savingsService.addMovement({ accountId: moto.id, kind: 'withdrawal', amount: 200_001, date: '2026-09-06', note: null }), 'solo tiene $200.000');
    await expectRejects(savingsService.addMovement({ accountId: moto.id, kind: 'deposit', amount: 0, date: '2026-09-06', note: null }), 'mayor a $0');
    await expectRejects(savingsService.addMovement({ accountId: moto.id, kind: 'deposit', amount: 10, date: addDays(today, 1), note: null }), 'futura');
    await expectRejects(savingsService.addMovement({ accountId: 'no-existe', kind: 'deposit', amount: 10, date: today, note: null }), 'ya no existe');
    expect((await savingsService.getDetail(moto.id))!.balance).toBe(200_000);
  });

  it('paga un gasto con la cuenta: queda pagado y el retiro aparece en los movimientos', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const mirror = await methodOf(viaje.id);
    const expense = await expenseService.create({
      amount: 180_000, categoryId: 'cat_alimentacion', paymentMethodId: mirror.id,
      date: today, time: null, note: 'Hotel', paid: false,
    });
    // Aunque se pidiera «por pagar», pagar con ahorro es pagar en el acto.
    expect(expense.paidAt).toBe(today);

    const detail = (await savingsService.getDetail(viaje.id))!;
    expect(detail.balance).toBe(320_000);
    expect(detail.expenseCount).toBe(1);
    expect(detail.movements[0]).toMatchObject({ kind: 'withdrawal', amount: 180_000, note: 'Hotel', expenseId: expense.id, date: today });

    // El gasto sale en el historial con el nombre de la cuenta como método.
    const listed = (await expenseService.list({ paymentMethodIds: [mirror.id] }))[0];
    expect(listed.paymentMethodName).toBe('Viaje');
    expect(listed.paidAt).not.toBeNull();
  });

  it('no registra un gasto si la cuenta no alcanza y no deja nada a medias', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const mirror = await methodOf(viaje.id);
    const before = (await expenseService.list({})).length;
    await expectRejects(
      expenseService.create({ amount: 320_001, categoryId: 'cat_alimentacion', paymentMethodId: mirror.id, date: '2026-09-11', time: null, note: 'Mucho' }),
      'solo tiene $320.000',
    );
    expect((await expenseService.list({})).length).toBe(before);
    expect((await savingsService.getDetail(viaje.id))!.balance).toBe(320_000);
  });

  it('al editar el gasto, el retiro se ajusta (el valor propio cuenta como disponible)', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const mirror = await methodOf(viaje.id);
    const expense = (await expenseService.list({ paymentMethodIds: [mirror.id] }))[0];
    const input = { categoryId: expense.categoryId, paymentMethodId: mirror.id, date: expense.date, time: null, note: expense.note };

    await expenseService.update(expense.id, { ...input, amount: 500_000 }); // 180.000 + 320.000 disponibles
    expect((await savingsService.getDetail(viaje.id))!.balance).toBe(0);
    await expectRejects(expenseService.update(expense.id, { ...input, amount: 500_001 }), 'solo tiene $500.000');
    await expenseService.update(expense.id, { ...input, amount: 150_000, note: 'Hotel y desayuno' });

    const detail = (await savingsService.getDetail(viaje.id))!;
    expect(detail.balance).toBe(350_000);
    expect(detail.movements.filter((m) => m.expenseId)).toHaveLength(1);
    expect(detail.movements[0]).toMatchObject({ amount: 150_000, note: 'Hotel y desayuno' });
  });

  it('el gasto pagado con ahorro no se puede pasar a «por pagar» desde el historial', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const expense = (await expenseService.list({ paymentMethodIds: [(await methodOf(viaje.id)).id] }))[0];
    await expectRejects(expenseService.setPaid(expense.id, false), 'cuenta de ahorro');
    await expenseService.setPaid(expense.id, true);
  });

  it('cambiar el método devuelve la plata a la cuenta; volver a elegirla la saca otra vez', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const mirror = await methodOf(viaje.id);
    const expense = (await expenseService.list({ paymentMethodIds: [mirror.id] }))[0];
    const input = { amount: 150_000, categoryId: expense.categoryId, date: expense.date, time: null, note: expense.note };

    await expenseService.update(expense.id, { ...input, paymentMethodId: 'pm_efectivo' });
    expect((await savingsService.getDetail(viaje.id))!.balance).toBe(500_000);
    expect((await savingsService.getDetail(viaje.id))!.expenseCount).toBe(0);

    await expenseService.update(expense.id, { ...input, paymentMethodId: mirror.id });
    expect((await savingsService.getDetail(viaje.id))!.balance).toBe(350_000);
  });

  it('un gasto de otro método con ahorro: por pagar con tarjeta no toca ninguna cuenta', async () => {
    const before = (await savingsService.totalSaved()).total;
    const credit = await expenseService.create({
      amount: 40_000, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_nubank', date: '2026-09-12', time: null, note: 'Cena',
    });
    expect(credit.paidAt).toBeNull();
    expect((await savingsService.totalSaved()).total).toBe(before);
  });

  it('eliminar el gasto devuelve la plata a la cuenta', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const expense = (await expenseService.list({ paymentMethodIds: [(await methodOf(viaje.id)).id] }))[0];
    await expenseService.remove(expense.id);
    const detail = (await savingsService.getDetail(viaje.id))!;
    expect(detail.balance).toBe(500_000);
    expect(detail.movements.some((m) => m.expenseId)).toBe(false);
  });

  it('borrar movimientos manuales: solo si el saldo no queda en negativo; los de gastos se manejan desde el gasto', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    const mirror = await methodOf(viaje.id);
    const paid = await expenseService.create({
      amount: 450_000, categoryId: 'cat_alimentacion', paymentMethodId: mirror.id, date: '2026-09-13', time: null, note: 'Tiquetes',
    });
    const detail = (await savingsService.getDetail(viaje.id))!;
    const opening = detail.movements.find((m) => m.note === 'Saldo inicial')!;
    const linked = detail.movements.find((m) => m.expenseId === paid.id)!;

    await expectRejects(savingsService.removeMovement(opening.id), 'negativo');
    await expectRejects(savingsService.removeMovement(linked.id), 'pagó un gasto');

    const extra = await savingsService.addMovement({ accountId: viaje.id, kind: 'deposit', amount: 20_000, date: today, note: 'Error' });
    await savingsService.removeMovement(extra.id);
    expect((await savingsService.getDetail(viaje.id))!.balance).toBe(50_000);
  });

  it('editar la cuenta actualiza su método espejo; ocultarla la quita de la lista de pago', async () => {
    const moto = (await savingsService.listAccounts()).find((a) => a.name === 'Moto')!;
    await savingsService.updateAccount(moto.id, { name: 'Moto nueva', last4: null, icon: '🏍️', color: '#E4572E', isActive: false });
    const mirror = await methodOf(moto.id);
    expect([mirror.name, mirror.icon, mirror.color, mirror.isActive]).toEqual(['Moto nueva', '🏍️', '#E4572E', false]);
    expect((await savingsService.listAccounts()).map((a) => a.name)).toEqual(['Viaje']);
    expect((await savingsService.listAccounts(true)).map((a) => a.name)).toEqual(['Viaje', 'Moto nueva']);
    // Conservar el mismo nombre al editar no choca con su propio espejo.
    await savingsService.updateAccount(moto.id, { name: 'Moto nueva', last4: null, icon: '🏍️', color: '#E4572E', isActive: true });
    await expectRejects(savingsService.updateAccount(moto.id, { name: 'Viaje', last4: null, icon: '🏍️', color: '#E4572E', isActive: true }), 'Ya existe');
  });

  it('una cuenta que ya pagó gastos no se elimina; una sin gastos sí, con su método y movimientos', async () => {
    const viaje = (await savingsService.listAccounts()).find((a) => a.name === 'Viaje')!;
    await expectRejects(savingsService.removeAccount(viaje.id), 'no se puede eliminar');

    const moto = (await savingsService.listAccounts(true)).find((a) => a.name === 'Moto nueva')!;
    const mirrorId = (await methodOf(moto.id)).id;
    await savingsService.removeAccount(moto.id);
    expect((await savingsService.listAccounts(true)).map((a) => a.name)).toEqual(['Viaje']);
    expect((await paymentMethodService.list(true)).some((m) => m.id === mirrorId)).toBe(false);
    expect(await savingsService.getDetail(moto.id)).toBeNull();
  });

  it('la copia de seguridad guarda y restaura cuentas, movimientos y gastos enlazados', async () => {
    const backup = await backupService.createBackup();
    expect(backup.version).toBe(3);
    expect(backup.data.savingsAccounts.map((a) => a.name)).toEqual(['Viaje']);
    expect(backup.data.savingsMovements.some((m) => m.expenseId)).toBe(true);

    const text = JSON.stringify(backup);
    expect(parseBackup(text).data.savingsMovements).toHaveLength(backup.data.savingsMovements.length);
    const balanceBefore = (await savingsService.listAccounts())[0].balance;

    await savingsService.addMovement({ accountId: backup.data.savingsAccounts[0].id, kind: 'deposit', amount: 1_000, date: today, note: 'Después de la copia' });
    await backupService.restore(text);
    const accounts = await savingsService.listAccounts(true);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].balance).toBe(balanceBefore);
    expect((await methodOf(accounts[0].id)).name).toBe('Viaje');
  });

  it('una copia con enlaces rotos se rechaza y una copia vieja (sin ahorros) se sigue leyendo', async () => {
    const backup = await backupService.createBackup();
    const broken = JSON.parse(JSON.stringify(backup));
    broken.data.savingsMovements[broken.data.savingsMovements.length - 1].accountId = 'fantasma';
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/dañada/);

    const orphanMirror = JSON.parse(JSON.stringify(backup));
    orphanMirror.data.savingsAccounts = [];
    orphanMirror.data.savingsMovements = [];
    expect(() => parseBackup(JSON.stringify(orphanMirror))).toThrow(/dañada/);

    const old = JSON.parse(JSON.stringify(backup));
    old.version = 2;
    delete old.data.savingsAccounts;
    delete old.data.savingsMovements;
    old.data.paymentMethods = old.data.paymentMethods.filter((m: { savingsAccountId?: string | null }) => !m.savingsAccountId);
    old.data.expenses = old.data.expenses.filter((e: { paymentMethodId: string }) => old.data.paymentMethods.some((m: { id: string }) => m.id === e.paymentMethodId));
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.data.savingsAccounts).toEqual([]);
    expect(parsed.data.savingsMovements).toEqual([]);
  });

  it('al importar, un método con el nombre de una cuenta no usa su espejo (no descuenta de la cuenta)', async () => {
    const viaje = (await savingsService.listAccounts())[0];
    const before = viaje.balance;
    await importRows([{ line: 2, date: '2026-09-14', amount: 25_000, category: 'Comida', method: 'Viaje', note: 'Importado', paid: true }]);
    expect((await savingsService.listAccounts())[0].balance).toBe(before);
    const imported = (await expenseService.list({ search: 'Importado' }))[0];
    expect(imported.paymentMethodName).not.toBe('Viaje');
  });

  it('Estadísticas: el resumen del mes coincide con las cuentas y con los gastos pagados con ahorro', async () => {
    const viaje = (await savingsService.listAccounts())[0];
    const mirror = await methodOf(viaje.id);
    const before = await statsService.getSavingsMonth(currentYearMonth());
    expect(before.hasAccounts).toBe(true);
    expect(before.balance).toBe((await savingsService.totalSaved()).total);
    expect(before.accounts.reduce((sum, row) => sum + row.balance, 0)).toBe(before.balance);

    await savingsService.addMovement({ accountId: viaje.id, kind: 'deposit', amount: 80_000, date: today, note: 'Para estadísticas' });
    await savingsService.addMovement({ accountId: viaje.id, kind: 'withdrawal', amount: 10_000, date: today, note: null });
    await expenseService.create({ amount: 30_000, categoryId: 'cat_alimentacion', paymentMethodId: mirror.id, date: today, time: null, note: 'Pago con ahorro' });

    const after = await statsService.getSavingsMonth(currentYearMonth());
    expect(after.deposited - before.deposited).toBe(80_000);
    expect(after.withdrawn - before.withdrawn).toBe(10_000);
    expect(after.spent - before.spent).toBe(30_000);
    expect(after.net - before.net).toBe(40_000);
    expect(after.net).toBe(after.deposited - after.withdrawn - after.spent);
    expect(after.balance - before.balance).toBe(40_000);

    // Lo pagado con ahorro ya está en el total gastado del mes: no se cuenta dos veces ni se pierde.
    const spending = await statsService.getMonthlySummary(currentYearMonth());
    expect(spending.byMethod.find((m) => m.paymentMethodId === mirror.id)?.total).toBeGreaterThanOrEqual(30_000);
  });

  it('Estadísticas: una cuenta oculta deja de contar y sin cuentas activas no hay sección', async () => {
    const accounts = await savingsService.listAccounts(true);
    for (const account of accounts) await savingsService.updateAccount(account.id, { name: account.name, last4: account.last4, icon: account.icon, color: account.color, isActive: false });
    const hidden = await statsService.getSavingsMonth(currentYearMonth());
    expect(hidden.hasAccounts).toBe(false);
    expect(hidden.balance).toBe(0);
    for (const account of accounts) await savingsService.updateAccount(account.id, { name: account.name, last4: account.last4, icon: account.icon, color: account.color, isActive: true });
  });

  it('los últimos 4 dígitos son opcionales, se validan y viajan al método de pago de la cuenta', async () => {
    await expectRejects(savingsService.createAccount({ ...NEW, name: 'Cuenta mala', last4: '12a4' }), '4 dígitos');
    await expectRejects(savingsService.createAccount({ ...NEW, name: 'Cuenta mala', last4: '123' }), '4 dígitos');

    const nequi = await savingsService.createAccount({ ...NEW, name: 'Nequi', last4: ' 4321 ' }, 50_000);
    expect(nequi.last4).toBe('4321');
    expect((await methodOf(nequi.id)).last4).toBe('4321');
    expect((await savingsService.listAccounts()).find((a) => a.id === nequi.id)?.last4).toBe('4321');

    await savingsService.updateAccount(nequi.id, { name: 'Nequi', last4: '9999', icon: '📱', color: '#2A9D8F', isActive: true });
    expect((await methodOf(nequi.id)).last4).toBe('9999');
    await savingsService.updateAccount(nequi.id, { name: 'Nequi', last4: null, icon: '📱', color: '#2A9D8F', isActive: true });
    expect((await methodOf(nequi.id)).last4).toBeNull();
    await savingsService.updateAccount(nequi.id, { name: 'Nequi', last4: '4321', icon: '📱', color: '#2A9D8F', isActive: true });
  });

  it('ajustar saldo: crea el ingreso o el retiro que falta para igualar al banco', async () => {
    const nequi = (await savingsService.listAccounts()).find((a) => a.name === 'Nequi')!;
    expect(nequi.balance).toBe(50_000);

    const up = await savingsService.adjustBalance(nequi.id, 72_500);
    expect([up.kind, up.amount, up.note]).toEqual(['deposit', 22_500, 'Ajuste de saldo']);
    expect((await savingsService.getDetail(nequi.id))!.balance).toBe(72_500);

    const down = await savingsService.adjustBalance(nequi.id, 10_000);
    expect([down.kind, down.amount]).toEqual(['withdrawal', 62_500]);
    expect((await savingsService.getDetail(nequi.id))!.balance).toBe(10_000);

    await savingsService.adjustBalance(nequi.id, 0);
    expect((await savingsService.getDetail(nequi.id))!.balance).toBe(0);
    await expectRejects(savingsService.adjustBalance(nequi.id, 0), 'ya coincide');
    await expectRejects(savingsService.adjustBalance(nequi.id, -1), 'saldo que ves');
    await expectRejects(savingsService.adjustBalance('no-existe', 5), 'ya no existe');
    // El historial conserva lo que pasó: ingreso inicial y tres ajustes.
    expect((await savingsService.getDetail(nequi.id))!.movements).toHaveLength(4);
  });

  it('una compra detectada se sugiere con la cuenta de ahorro solo por sus últimos 4 dígitos', async () => {
    const methods = await paymentMethodService.list(true);
    const nequi = methods.find((m) => m.name === 'Nequi')!;
    expect(suggestPaymentMethodId(methods, { bank: null, last4: '4321' })).toBe(nequi.id);
    // Por el nombre del banco no: «Nequi» como banco no debe mover plata de la cuenta sin que coincidan los dígitos.
    expect(suggestPaymentMethodId(methods, { bank: 'nequi', last4: null })).toBeNull();
    expect(suggestPaymentMethodId(methods, { bank: 'nequi', last4: '0000' })).toBeNull();
  });

  it('la copia de seguridad conserva los últimos 4 dígitos de la cuenta', async () => {
    const backup = await backupService.createBackup();
    expect(backup.data.savingsAccounts.find((a) => a.name === 'Nequi')?.last4).toBe('4321');
    await backupService.restore(JSON.stringify(backup));
    expect((await savingsService.listAccounts()).find((a) => a.name === 'Nequi')?.last4).toBe('4321');
    // Una copia con un dato inválido no rompe: simplemente se descarta.
    const dirty = JSON.parse(JSON.stringify(backup));
    dirty.data.savingsAccounts[0].last4 = 'abcd';
    expect(parseBackup(JSON.stringify(dirty)).data.savingsAccounts[0].last4).toBeNull();
  });
});
