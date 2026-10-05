import { describe, expect, it } from 'vitest';
import { adjustmentFor, balanceOf, describeAccount, insufficientMessage, movementCountLabel, movementTitle, summarizeSavingsMonth, totalsOf, validateMovement, withRunningBalance } from './savings';
import type { SavingsMovement } from '@/types/models';

function movement(partial: Partial<SavingsMovement> & Pick<SavingsMovement, 'id' | 'kind' | 'amount' | 'date'>): SavingsMovement {
  return { accountId: 'acc', note: null, expenseId: null, createdAt: `${partial.date}T10:00:00.000Z`, ...partial };
}

describe('saldo de una cuenta de ahorro', () => {
  const list = [
    movement({ id: 'a', kind: 'deposit', amount: 500_000, date: '2026-09-01' }),
    movement({ id: 'b', kind: 'withdrawal', amount: 120_000, date: '2026-09-05' }),
    movement({ id: 'c', kind: 'deposit', amount: 70_000, date: '2026-09-10' }),
  ];

  it('suma los ingresos y resta los retiros', () => {
    expect(balanceOf(list)).toBe(450_000);
    expect(balanceOf([])).toBe(0);
  });

  it('separa lo ingresado de lo retirado', () => {
    expect(totalsOf(list)).toEqual({ deposited: 570_000, withdrawn: 120_000 });
  });

  it('muestra lo más reciente primero con el saldo que quedó después de cada movimiento', () => {
    const rows = withRunningBalance(list);
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a']);
    expect(rows.map((row) => row.balanceAfter)).toEqual([450_000, 380_000, 500_000]);
  });

  it('acomoda un movimiento con fecha pasada donde le corresponde', () => {
    const late = movement({ id: 'd', kind: 'deposit', amount: 10_000, date: '2026-08-20', createdAt: '2026-09-11T08:00:00.000Z' });
    const rows = withRunningBalance([...list, late]);
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(rows[3].balanceAfter).toBe(10_000);
    expect(rows[0].balanceAfter).toBe(460_000);
  });

  it('a igual fecha respeta el orden en que se registraron', () => {
    const first = movement({ id: 'x', kind: 'deposit', amount: 100, date: '2026-09-01', createdAt: '2026-09-01T08:00:00.000Z' });
    const second = movement({ id: 'y', kind: 'withdrawal', amount: 40, date: '2026-09-01', createdAt: '2026-09-01T09:00:00.000Z' });
    expect(withRunningBalance([second, first]).map((row) => [row.id, row.balanceAfter])).toEqual([['y', 60], ['x', 100]]);
  });
});

describe('validación de un ingreso o retiro', () => {
  const base = { amount: 50_000, date: '2026-09-19', note: null };

  it('acepta un movimiento correcto', () => {
    expect(validateMovement(base)).toEqual({});
  });

  it('rechaza valores que no son pesos enteros positivos', () => {
    expect(validateMovement({ ...base, amount: 0 }).amount).toBeTruthy();
    expect(validateMovement({ ...base, amount: -1 }).amount).toBeTruthy();
    expect(validateMovement({ ...base, amount: 10.5 }).amount).toBeTruthy();
  });

  it('rechaza fechas inválidas y, si hay tope, las futuras', () => {
    expect(validateMovement({ ...base, date: '2026-02-30' }).date).toBeTruthy();
    expect(validateMovement({ ...base, date: '2026-10-05' }, { maxDate: '2026-10-04' }).date).toBeTruthy();
    expect(validateMovement({ ...base, date: '2026-10-04' }, { maxDate: '2026-10-04' })).toEqual({});
  });

  it('limita el largo de la nota', () => {
    expect(validateMovement({ ...base, note: 'a'.repeat(201) }).note).toBeTruthy();
  });
});

describe('textos', () => {
  it('explica cuánto hay cuando no alcanza', () => {
    expect(insufficientMessage('Viaje', 30_000)).toContain('$30.000');
    expect(insufficientMessage('Viaje', 0)).toContain('no tiene saldo');
  });

  it('el título de un movimiento es su nota o, si no tiene, su origen', () => {
    expect(movementTitle({ kind: 'deposit', note: 'Quincena', expenseId: null })).toBe('Quincena');
    expect(movementTitle({ kind: 'withdrawal', note: null, expenseId: 'e1' })).toBe('Pago de un gasto');
    expect(movementTitle({ kind: 'deposit', note: null, expenseId: null })).toBe('Ingreso');
    expect(movementTitle({ kind: 'withdrawal', note: null, expenseId: null })).toBe('Retiro');
  });

  it('la cantidad de movimientos dice «Sin movimientos» cuando no hay ninguno', () => {
    expect(movementCountLabel(0)).toBe('Sin movimientos');
    expect(movementCountLabel(1)).toBe('1 movimiento');
    expect(movementCountLabel(12)).toBe('12 movimientos');
  });
});

describe('resumen de ahorros del mes', () => {
  const account = (id: string, name: string, isActive = true) => ({ id, name, icon: '🐷', color: '#2A9D8F', isActive });
  const move = (id: string, accountId: string, kind: 'deposit' | 'withdrawal', amount: number, date: string, expenseId: string | null = null) =>
    movement({ id, accountId, kind, amount, date, expenseId });
  const range = { from: '2026-09-01', to: '2026-09-30', previousFrom: '2026-08-01', previousTo: '2026-08-31' };

  const accounts = [account('v', 'Viaje'), account('m', 'Moto'), account('o', 'Oculta', false)];
  const movements = [
    move('1', 'v', 'deposit', 500_000, '2026-08-10'),
    move('2', 'v', 'deposit', 200_000, '2026-09-03'),
    move('3', 'v', 'withdrawal', 150_000, '2026-09-12', 'e1'), // pagó un gasto
    move('4', 'v', 'withdrawal', 50_000, '2026-09-20'), // retiro manual
    move('5', 'm', 'deposit', 100_000, '2026-09-25'),
    move('6', 'o', 'deposit', 999_999, '2026-09-02'), // cuenta oculta: no cuenta
    move('7', 'v', 'deposit', 70_000, '2026-10-02'), // mes siguiente: no cuenta
  ];

  it('separa lo metido, lo retirado a mano y lo que pagó gastos, y la suma cuadra con el neto', () => {
    const summary = summarizeSavingsMonth({ accounts, movements, ...range });
    expect(summary.deposited).toBe(300_000);
    expect(summary.withdrawn).toBe(50_000);
    expect(summary.spent).toBe(150_000);
    expect(summary.net).toBe(summary.deposited - summary.withdrawn - summary.spent);
    expect(summary.net).toBe(100_000);
    expect(summary.hasActivity).toBe(true);
  });

  it('compara con el mes anterior y calcula el saldo al cerrar el mes', () => {
    const summary = summarizeSavingsMonth({ accounts, movements, ...range });
    expect(summary.previousNet).toBe(500_000);
    // Viaje: 500 + 200 − 150 − 50 = 500.000; Moto: 100.000; la oculta y el mes siguiente no cuentan.
    expect(summary.balance).toBe(600_000);
  });

  it('reparte el total entre las cuentas, de mayor a menor saldo', () => {
    const { accounts: rows } = summarizeSavingsMonth({ accounts, movements, ...range });
    expect(rows.map((row) => [row.name, row.balance, row.deposited, row.withdrawn])).toEqual([
      ['Viaje', 500_000, 200_000, 200_000],
      ['Moto', 100_000, 100_000, 0],
    ]);
    expect(rows.map((row) => Math.round(row.percent))).toEqual([83, 17]);
  });

  it('un mes pasado muestra el saldo de entonces, sin lo que vino después', () => {
    const august = summarizeSavingsMonth({ accounts, movements, from: '2026-08-01', to: '2026-08-31', previousFrom: '2026-07-01', previousTo: '2026-07-31' });
    expect(august.balance).toBe(500_000);
    expect(august.net).toBe(500_000);
    expect(august.accounts.map((row) => row.name)).toEqual(['Viaje']);
  });

  it('un mes sin movimientos conserva el saldo pero no marca actividad', () => {
    const quiet = summarizeSavingsMonth({ accounts, movements, from: '2026-11-01', to: '2026-11-30', previousFrom: '2026-10-01', previousTo: '2026-10-31' });
    expect(quiet.hasActivity).toBe(false);
    expect(quiet.net).toBe(0);
    expect(quiet.balance).toBe(670_000);
  });

  it('sin cuentas activas no hay sección que mostrar', () => {
    const none = summarizeSavingsMonth({ accounts: [account('o', 'Oculta', false)], movements, ...range });
    expect(none.hasAccounts).toBe(false);
    expect(none.accounts).toEqual([]);
    expect(none.balance).toBe(0);
  });

  it('un ahorro neto negativo es posible (se sacó más de lo que se metió)', () => {
    const summary = summarizeSavingsMonth({
      accounts: [account('v', 'Viaje')],
      movements: [move('a', 'v', 'deposit', 300_000, '2026-08-01'), move('b', 'v', 'withdrawal', 200_000, '2026-09-05')],
      ...range,
    });
    expect(summary.net).toBe(-200_000);
    expect(summary.balance).toBe(100_000);
  });
});

describe('cuadrar con el banco y mostrar la cuenta', () => {
  it('el ajuste es un ingreso si el banco tiene más y un retiro si tiene menos', () => {
    expect(adjustmentFor(100_000, 130_000)).toEqual({ kind: 'deposit', amount: 30_000 });
    expect(adjustmentFor(100_000, 40_000)).toEqual({ kind: 'withdrawal', amount: 60_000 });
    expect(adjustmentFor(0, 5_000)).toEqual({ kind: 'deposit', amount: 5_000 });
    expect(adjustmentFor(100_000, 100_000)).toBeNull();
  });

  it('la descripción de la cuenta lleva los últimos 4 dígitos solo si existen', () => {
    expect(describeAccount(null)).toBe('Cuenta de ahorro');
    expect(describeAccount('1234')).toBe('Cuenta de ahorro · ••••\u00a01234');
  });
});
