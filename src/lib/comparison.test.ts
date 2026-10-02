import { describe, expect, it } from 'vitest';
import { MAX_SHOWN_PERCENT, describeComparison, previousMonthLabel } from './comparison';

const money = (value: number) => `$${value}`;
const base = { yearMonth: '2026-10', previousTotal: 100, changeAmount: 50, changePercent: 50 };

describe('previousMonthLabel', () => {
  it('es solo el nombre del mes cuando cae en el mismo año', () => {
    expect(previousMonthLabel('2026-10')).toBe('septiembre');
    expect(previousMonthLabel('2026-02')).toBe('enero');
  });
  it('añade el año cuando el mes anterior es de otro año', () => {
    expect(previousMonthLabel('2026-01')).toBe('diciembre 2025');
  });
});

describe('describeComparison', () => {
  it('sin gastos el mes anterior no compara', () => {
    expect(describeComparison({ ...base, previousTotal: 0, changePercent: null }, money)).toEqual({
      direction: 'none',
      text: 'Sin gastos en septiembre para comparar.',
    });
  });

  it('gasto igual', () => {
    expect(describeComparison({ ...base, changeAmount: 0, changePercent: 0 }, money)).toEqual({
      direction: 'same',
      text: 'Igual que en septiembre.',
    });
  });

  it('gastó más: monto en positivo y porcentaje', () => {
    expect(describeComparison(base, money)).toEqual({
      direction: 'more',
      text: 'Gastaste $50 más que en septiembre (50%).',
    });
  });

  it('gastó menos: monto sin signo y porcentaje sin signo', () => {
    expect(describeComparison({ ...base, changeAmount: -40, changePercent: -40 }, money)).toEqual({
      direction: 'less',
      text: 'Gastaste $40 menos que en septiembre (40%).',
    });
  });

  it('redondea el porcentaje', () => {
    expect(describeComparison({ ...base, changePercent: 12.6 }, money).text).toContain('(13%)');
    expect(describeComparison({ ...base, changePercent: 12.4 }, money).text).toContain('(12%)');
  });

  it('omite el porcentaje por encima de 999 %, pero no en el límite', () => {
    expect(describeComparison({ ...base, changePercent: MAX_SHOWN_PERCENT }, money).text).toContain('(999%)');
    expect(describeComparison({ ...base, changePercent: 1382 }, money).text).toBe('Gastaste $50 más que en septiembre.');
  });

  it('omite el porcentaje cuando redondea a 0 %', () => {
    expect(describeComparison({ ...base, changeAmount: 1, changePercent: 0.3 }, money).text).toBe('Gastaste $1 más que en septiembre.');
  });

  it('en enero compara con diciembre del año anterior', () => {
    expect(describeComparison({ ...base, yearMonth: '2026-01' }, money).text).toBe('Gastaste $50 más que en diciembre 2025 (50%).');
  });

  it('usa el formato recibido (modo privacidad)', () => {
    expect(describeComparison(base, () => '$ ••••').text).toBe('Gastaste $ •••• más que en septiembre (50%).');
  });
});
