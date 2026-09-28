import { describe, expect, it } from 'vitest';
import {
  addMonths,
  adjustForWeekend,
  describeCut,
  describeDue,
  parseCycleRules,
  periodFor,
  resolveRule,
  serializeCycleRules,
  statementDates,
  validateCycleRules,
  type CycleRules,
} from './cycles';

const NUBANK: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };
const DAVIBANK: CycleRules = {
  cut: { kind: 'nth', nth: 2, weekday: 5 },
  due: { kind: 'nth', nth: 2, weekday: 2 },
  dueNextMonth: true,
  weekend: 'keep',
};

describe('resolveRule', () => {
  it('último día del mes, con meses de 28, 29, 30 y 31 días', () => {
    expect(resolveRule({ kind: 'last' }, '2026-02')).toBe('2026-02-28');
    expect(resolveRule({ kind: 'last' }, '2028-02')).toBe('2028-02-29');
    expect(resolveRule({ kind: 'last' }, '2026-09')).toBe('2026-09-30');
    expect(resolveRule({ kind: 'last' }, '2026-10')).toBe('2026-10-31');
  });

  it('día fijo; si el mes es más corto, cae en su último día', () => {
    expect(resolveRule({ kind: 'day', day: 20 }, '2026-10')).toBe('2026-10-20');
    expect(resolveRule({ kind: 'day', day: 31 }, '2026-04')).toBe('2026-04-30');
    expect(resolveRule({ kind: 'day', day: 30 }, '2026-02')).toBe('2026-02-28');
  });

  it('n-ésimo día de la semana', () => {
    expect(resolveRule({ kind: 'nth', nth: 2, weekday: 5 }, '2026-09')).toBe('2026-09-11'); // 2.º viernes
    expect(resolveRule({ kind: 'nth', nth: 2, weekday: 2 }, '2026-10')).toBe('2026-10-13'); // 2.º martes
    expect(resolveRule({ kind: 'nth', nth: 1, weekday: 2 }, '2026-09')).toBe('2026-09-01');
    expect(resolveRule({ kind: 'nth', nth: 4, weekday: 1 }, '2026-09')).toBe('2026-09-28');
    expect(resolveRule({ kind: 'nth', nth: 'last', weekday: 5 }, '2026-09')).toBe('2026-09-25');
    expect(resolveRule({ kind: 'nth', nth: 'last', weekday: 3 }, '2026-09')).toBe('2026-09-30');
  });
});

describe('statementDates: las reglas reales del usuario', () => {
  it('Nubank: corte el último día, pago el 20 del mes siguiente', () => {
    expect(statementDates(NUBANK, '2026-08')).toEqual({ cut: '2026-08-31', due: '2026-09-20' });
    expect(statementDates(NUBANK, '2026-09')).toEqual({ cut: '2026-09-30', due: '2026-10-20' });
    expect(statementDates(NUBANK, '2026-12')).toEqual({ cut: '2026-12-31', due: '2027-01-20' }); // cambia de año
  });

  it('Davibank: corte el 2.º viernes, pago el 2.º martes del mes siguiente', () => {
    expect(statementDates(DAVIBANK, '2026-08')).toEqual({ cut: '2026-08-14', due: '2026-09-08' });
    expect(statementDates(DAVIBANK, '2026-09')).toEqual({ cut: '2026-09-11', due: '2026-10-13' });
    expect(statementDates(DAVIBANK, '2026-10')).toEqual({ cut: '2026-10-09', due: '2026-11-10' });
    expect(statementDates(DAVIBANK, '2026-12')).toEqual({ cut: '2026-12-11', due: '2027-01-12' });
  });
});

describe('fin de semana', () => {
  it('mantener, hábil anterior y hábil siguiente', () => {
    expect(adjustForWeekend('2026-09-20', 'keep')).toBe('2026-09-20'); // domingo
    expect(adjustForWeekend('2026-09-20', 'before')).toBe('2026-09-18'); // viernes
    expect(adjustForWeekend('2026-09-20', 'after')).toBe('2026-09-21'); // lunes
    expect(adjustForWeekend('2026-10-31', 'before')).toBe('2026-10-30'); // sábado → viernes
    expect(adjustForWeekend('2026-10-31', 'after')).toBe('2026-11-02'); // sábado → lunes
    expect(adjustForWeekend('2026-09-22', 'before')).toBe('2026-09-22'); // martes: no cambia
  });

  it('se aplica solo a la fecha de pago, nunca al corte', () => {
    const rules: CycleRules = { ...NUBANK, weekend: 'before' };
    expect(statementDates(rules, '2026-08')).toEqual({ cut: '2026-08-31', due: '2026-09-18' });
    expect(statementDates(rules, '2026-10')).toEqual({ cut: '2026-10-31', due: '2026-11-20' }); // 20 nov = viernes
  });
});

describe('periodFor: a qué extracto pertenece un gasto', () => {
  const nu = (period: string) => statementDates(NUBANK, period);
  const davi = (period: string) => statementDates(DAVIBANK, period);

  it('Nubank: todo el mes cae en su extracto y el último día también', () => {
    expect(periodFor('2026-09-01', nu)).toBe('2026-09');
    expect(periodFor('2026-09-20', nu)).toBe('2026-09');
    expect(periodFor('2026-09-30', nu)).toBe('2026-09'); // el día del corte entra a ese extracto
    expect(periodFor('2026-10-01', nu)).toBe('2026-10');
    expect(periodFor('2026-12-31', nu)).toBe('2026-12');
    expect(periodFor('2027-01-01', nu)).toBe('2027-01');
  });

  it('Davibank: el corte parte el mes en dos', () => {
    expect(periodFor('2026-09-10', davi)).toBe('2026-09'); // antes del corte (vie 11)
    expect(periodFor('2026-09-11', davi)).toBe('2026-09'); // el día del corte
    expect(periodFor('2026-09-12', davi)).toBe('2026-10'); // después: siguiente extracto
    expect(periodFor('2026-09-20', davi)).toBe('2026-10');
    expect(periodFor('2026-10-09', davi)).toBe('2026-10');
    expect(periodFor('2026-10-10', davi)).toBe('2026-11');
    expect(periodFor('2026-01-05', davi)).toBe('2026-01');
    expect(periodFor('2026-12-20', davi)).toBe('2027-01'); // cruza de año
  });

  it('respeta fechas ajustadas a mano', () => {
    const adjusted = (period: string) => (period === '2026-09' ? { cut: '2026-09-12' } : davi(period));
    expect(periodFor('2026-09-12', adjusted)).toBe('2026-09');
    expect(periodFor('2026-09-13', adjusted)).toBe('2026-10');
  });
});

describe('addMonths', () => {
  it('suma meses cruzando años', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-09', 15)).toBe('2027-12');
  });
});

describe('validación y persistencia', () => {
  it('reglas coherentes pasan; un pago antes del corte no', () => {
    expect(validateCycleRules(NUBANK)).toBeNull();
    expect(validateCycleRules(DAVIBANK)).toBeNull();
    const bad: CycleRules = { cut: { kind: 'day', day: 25 }, due: { kind: 'day', day: 10 }, dueNextMonth: false, weekend: 'keep' };
    expect(validateCycleRules(bad)).toBeTruthy();
    expect(validateCycleRules({ ...bad, dueNextMonth: true })).toBeNull();
  });

  it('ida y vuelta por JSON, y rechazo de datos dañados', () => {
    expect(parseCycleRules(serializeCycleRules(DAVIBANK))).toEqual(DAVIBANK);
    expect(parseCycleRules(null)).toBeNull();
    expect(parseCycleRules('no es json')).toBeNull();
    expect(parseCycleRules('{"cut":{"kind":"day","day":40},"due":{"kind":"last"},"dueNextMonth":true,"weekend":"keep"}')).toBeNull();
    expect(parseCycleRules('{"cut":{"kind":"nth","nth":5,"weekday":1},"due":{"kind":"last"},"dueNextMonth":true,"weekend":"keep"}')).toBeNull();
  });

  it('describe las reglas en español', () => {
    expect(describeCut(NUBANK)).toBe('El último día de cada mes');
    expect(describeDue(NUBANK)).toBe('El día 20 del mes siguiente');
    expect(describeCut(DAVIBANK)).toBe('El segundo viernes de cada mes');
    expect(describeDue(DAVIBANK)).toBe('El segundo martes del mes siguiente');
    expect(describeDue({ ...NUBANK, due: { kind: 'nth', nth: 'last', weekday: 0 }, dueNextMonth: false })).toBe('El último domingo del mismo mes');
  });
});
