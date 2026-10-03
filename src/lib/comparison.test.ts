import { describe, expect, it } from 'vitest';
import { describeChange, describeComparison, previousMonthLabel } from './comparison';

const money = (value: number) => `$${value}`;
const base = { yearMonth: '2026-10', previousTotal: 100, changeAmount: 50 };

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
    expect(describeComparison({ ...base, previousTotal: 0 }, money)).toEqual({
      direction: 'none',
      text: 'Sin gastos en septiembre para comparar.',
    });
  });

  it('gasto igual', () => {
    expect(describeComparison({ ...base, changeAmount: 0 }, money)).toEqual({
      direction: 'same',
      text: 'Has gastado lo mismo que en septiembre.',
    });
  });

  it('gastó más: monto en positivo, sin porcentaje', () => {
    expect(describeComparison(base, money)).toEqual({
      direction: 'more',
      text: 'Gastaste $50 más que en septiembre.',
    });
  });

  it('gastó menos: monto sin signo, sin porcentaje', () => {
    expect(describeComparison({ ...base, changeAmount: -40 }, money)).toEqual({
      direction: 'less',
      text: 'Has gastado $40 menos que en septiembre.',
    });
  });

  it('en enero compara con diciembre del año anterior', () => {
    expect(describeComparison({ ...base, yearMonth: '2026-01' }, money).text).toBe('Gastaste $50 más que en diciembre 2025.');
    expect(describeComparison({ ...base, yearMonth: '2026-01', changeAmount: -40 }, money).text).toBe('Has gastado $40 menos que en diciembre 2025.');
  });

  it('usa el formato recibido (modo privacidad)', () => {
    expect(describeComparison(base, () => '$ ••••').text).toBe('Gastaste $ •••• más que en septiembre.');
    expect(describeComparison({ ...base, changeAmount: -40 }, () => '$ ••••').text).toBe('Has gastado $ •••• menos que en septiembre.');
  });
});

describe('describeChange', () => {
  it('sin gastos el mes anterior no hay pastilla', () => {
    expect(describeChange({ ...base, previousTotal: 0 }, money)).toBeNull();
  });

  it('gasto igual', () => {
    expect(describeChange({ ...base, changeAmount: 0 }, money)).toEqual({ direction: 'same', text: 'Igual que septiembre' });
  });

  it('gastó más o menos: el monto de la diferencia, sin signo', () => {
    expect(describeChange(base, money)).toEqual({ direction: 'more', text: '$50 vs septiembre' });
    expect(describeChange({ ...base, changeAmount: -40 }, money)).toEqual({ direction: 'less', text: '$40 vs septiembre' });
  });

  it('en enero compara con diciembre del año anterior', () => {
    expect(describeChange({ ...base, yearMonth: '2026-01' }, money)?.text).toBe('$50 vs diciembre 2025');
  });

  it('usa el formato recibido (modo privacidad)', () => {
    expect(describeChange(base, () => '$ ••••')?.text).toBe('$ •••• vs septiembre');
  });
});
