import { describe, expect, it } from 'vitest';
import { statementStatus } from './statementStatus';

const TODAY = '2026-10-02';
const base = { dueDate: '2026-10-20', paidCount: 0, unpaidCount: 3, unpaidTotal: 664_600, lastPaidAt: null };

describe('estado de un extracto cerrado', () => {
  it('pagado: con la fecha del último pago, o sin ella', () => {
    expect(statementStatus({ ...base, unpaidCount: 0, paidCount: 3, unpaidTotal: 0, lastPaidAt: '2026-09-29' }, TODAY)).toEqual({ tone: 'paid', label: 'Pagado · 29 sep', partialUnpaid: null });
    expect(statementStatus({ ...base, unpaidCount: 0, paidCount: 3, unpaidTotal: 0 }, TODAY).label).toBe('Pagado');
  });
  it('por pagar con más de 7 días: calma', () => {
    expect(statementStatus(base, TODAY)).toEqual({ tone: 'neutral', label: 'Pago en 18 días · mar 20 oct', partialUnpaid: null });
    expect(statementStatus({ ...base, dueDate: '2026-10-10' }, TODAY).tone).toBe('neutral'); // 8 días
  });
  it('por pagar en 7 días o menos: atención, con los días que faltan', () => {
    expect(statementStatus({ ...base, dueDate: '2026-10-09' }, TODAY)).toMatchObject({ tone: 'warning', label: 'Pago en 7 días · vie 9 oct' });
    expect(statementStatus({ ...base, dueDate: '2026-10-06' }, TODAY).label).toBe('Pago en 4 días · mar 6 oct');
    expect(statementStatus({ ...base, dueDate: '2026-10-03' }, TODAY).label).toBe('Pago mañana · sáb 3 oct');
  });
  it('hoy o vencido: urgente', () => {
    expect(statementStatus({ ...base, dueDate: '2026-10-02' }, TODAY)).toMatchObject({ tone: 'danger', label: 'Vence hoy' });
    expect(statementStatus({ ...base, dueDate: '2026-09-29' }, TODAY)).toMatchObject({ tone: 'danger', label: 'Vencido · hace 3 días' });
    expect(statementStatus({ ...base, dueDate: '2026-10-01' }, TODAY).label).toBe('Vencido · hace 1 día');
  });
  it('pago parcial: informa lo que queda sin pagar', () => {
    expect(statementStatus({ ...base, paidCount: 2, unpaidCount: 1, unpaidTotal: 120_000 }, TODAY).partialUnpaid).toBe(120_000);
  });
});
