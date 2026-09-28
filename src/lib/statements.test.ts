import { describe, expect, it } from 'vitest';
import type { CycleRules } from './cycles';
import {
  buildStatements,
  diffAssignments,
  makeDatesFor,
  openStatement,
  payableStatements,
  validateStatementDates,
  type StatementExpense,
} from './statements';

const NUBANK: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };
const DAVIBANK: CycleRules = {
  cut: { kind: 'nth', nth: 2, weekday: 5 },
  due: { kind: 'nth', nth: 2, weekday: 2 },
  dueNextMonth: true,
  weekend: 'keep',
};
const ex = (id: string, date: string, amount: number, paidAt: string | null = null): StatementExpense => ({ id, date, amount, paidAt });
const TODAY = '2026-09-20';

describe('buildStatements: Nubank (corte a fin de mes)', () => {
  const expenses = [
    ex('a', '2026-08-10', 100000, '2026-09-18'), // agosto, pagado
    ex('b', '2026-08-28', 50000), // agosto, sin pagar
    ex('c', '2026-09-03', 30000), // septiembre (abierto)
    ex('d', '2026-09-19', 20000),
  ];
  const views = buildStatements({ rules: NUBANK, fixed: {}, expenses, today: TODAY });

  it('separa agosto (cerrado) de septiembre (abierto)', () => {
    expect(views.map((v) => v.period)).toEqual(['2026-09', '2026-08']);
    const [sep, aug] = views;
    expect(aug).toMatchObject({ cutDate: '2026-08-31', dueDate: '2026-09-20', closed: true, total: 150000, unpaidTotal: 50000, unpaidCount: 1, paidCount: 1, lastPaidAt: '2026-09-18' });
    expect(sep).toMatchObject({ cutDate: '2026-09-30', dueDate: '2026-10-20', closed: false, total: 50000, unpaidTotal: 50000 });
  });

  it('solo se puede pagar lo cerrado; lo abierto espera', () => {
    expect(payableStatements(views).map((v) => v.period)).toEqual(['2026-08']);
    expect(openStatement(views)?.period).toBe('2026-09');
  });

  it('el día del corte el extracto sigue abierto y al día siguiente se cierra', () => {
    const on = buildStatements({ rules: NUBANK, fixed: {}, expenses, today: '2026-09-30' });
    expect(on.find((v) => v.period === '2026-09')?.closed).toBe(false);
    const after = buildStatements({ rules: NUBANK, fixed: {}, expenses, today: '2026-10-01' });
    expect(after.find((v) => v.period === '2026-09')?.closed).toBe(true);
  });

  it('muestra el extracto en curso aunque no tenga gastos', () => {
    const empty = buildStatements({ rules: NUBANK, fixed: {}, expenses: [], today: TODAY });
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ period: '2026-09', total: 0, closed: false });
  });
});

describe('buildStatements: Davibank (corte 2.º viernes)', () => {
  const expenses = [ex('a', '2026-09-08', 40000), ex('b', '2026-09-11', 10000), ex('c', '2026-09-12', 5000), ex('d', '2026-09-19', 8000)];
  const views = buildStatements({ rules: DAVIBANK, fixed: {}, expenses, today: TODAY });

  it('lo del día del corte entra al extracto que cierra; lo posterior, al siguiente', () => {
    const sep = views.find((v) => v.period === '2026-09')!;
    const oct = views.find((v) => v.period === '2026-10')!;
    expect(sep).toMatchObject({ cutDate: '2026-09-11', dueDate: '2026-10-13', closed: true, total: 50000 });
    expect(oct).toMatchObject({ cutDate: '2026-10-09', closed: false, total: 13000 });
  });
});

describe('fechas fijadas a mano', () => {
  it('reemplazan a la regla y marcan el extracto como fijo', () => {
    const fixed = { '2026-09': { cut: '2026-09-12', due: '2026-10-14' } };
    const views = buildStatements({ rules: DAVIBANK, fixed, expenses: [ex('a', '2026-09-12', 5000), ex('b', '2026-09-13', 7000)], today: TODAY });
    const sep = views.find((v) => v.period === '2026-09')!;
    expect(sep).toMatchObject({ cutDate: '2026-09-12', dueDate: '2026-10-14', fixed: true, total: 5000 });
    expect(views.find((v) => v.period === '2026-10')?.total).toBe(7000);
  });
});

describe('diffAssignments: qué gastos cambian de extracto al mover una fecha', () => {
  it('mover el corte de Davibank del 11 al 8 pasa a octubre lo de esos días', () => {
    const expenses = [ex('a', '2026-09-07', 1000), ex('b', '2026-09-09', 2000), ex('c', '2026-09-11', 3000)];
    const before = makeDatesFor(DAVIBANK, {});
    const after = makeDatesFor(DAVIBANK, { '2026-09': { cut: '2026-09-08', due: '2026-10-13' } });
    const moved = diffAssignments(expenses, before, after);
    expect(moved.map((m) => m.expense.id)).toEqual(['b', 'c']);
    expect(moved[0]).toMatchObject({ from: '2026-09', to: '2026-10' });
  });

  it('sin cambios reales no mueve nada', () => {
    const before = makeDatesFor(NUBANK, {});
    expect(diffAssignments([ex('a', '2026-09-20', 1)], before, before)).toEqual([]);
  });
});

describe('validateStatementDates', () => {
  const datesFor = makeDatesFor(DAVIBANK, {});
  it('acepta un ajuste razonable', () => {
    expect(validateStatementDates({ period: '2026-09', cut: '2026-09-12', due: '2026-10-14', datesFor })).toBeNull();
  });
  it('rechaza pago antes del corte y cortes que se cruzan con los vecinos', () => {
    expect(validateStatementDates({ period: '2026-09', cut: '2026-09-12', due: '2026-09-10', datesFor })).toBeTruthy();
    expect(validateStatementDates({ period: '2026-09', cut: '2026-08-10', due: '2026-10-14', datesFor })).toBeTruthy(); // ≤ corte de agosto (14 ago)
    expect(validateStatementDates({ period: '2026-09', cut: '2026-10-20', due: '2026-11-14', datesFor })).toBeTruthy(); // ≥ corte de octubre (9 oct)
  });
});
