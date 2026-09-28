import { describe, expect, it } from 'vitest';
import { dueLabel, formatDayMonth, periodMonthName, relativeDays, shadeColor } from './statementText';

describe('textos de extractos', () => {
  it('día de la semana, día y mes', () => {
    expect(formatDayMonth('2026-09-30')).toBe('mié 30 sep');
    expect(formatDayMonth('2026-10-20')).toBe('mar 20 oct');
    expect(formatDayMonth('2026-09-20')).toBe('dom 20 sep');
  });
  it('nombre del mes de un periodo', () => {
    expect(periodMonthName('2026-08')).toBe('agosto');
    expect(periodMonthName('2027-01')).toBe('enero');
  });
  it('relativos', () => {
    expect(relativeDays(0)).toBe('hoy');
    expect(relativeDays(1)).toBe('mañana');
    expect(relativeDays(10)).toBe('en 10 días');
    expect(relativeDays(-3)).toBe('hace 3 días');
  });
  it('etiqueta de vencimiento', () => {
    expect(dueLabel('2026-09-20', 0)).toBe('Vence hoy');
    expect(dueLabel('2026-09-17', -3)).toBe('Vencido hace 3 días');
    expect(dueLabel('2026-09-19', -1)).toBe('Vencido hace 1 día');
    expect(dueLabel('2026-10-20', 10)).toBe('Hasta el mar 20 oct · en 10 días');
  });
  it('oscurece colores y respeta entradas inválidas', () => {
    expect(shadeColor('#FFFFFF', 0.5)).toBe('#808080');
    expect(shadeColor('#000000', 0.5)).toBe('#000000');
    expect(shadeColor('rojo', 0.3)).toBe('rojo');
  });
});
