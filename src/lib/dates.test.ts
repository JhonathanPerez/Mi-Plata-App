import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, daysInMonth, diffDays, elapsedDaysInMonth, formatDayHeading, formatLongDate,
  formatMonthTitle, formatRelativeDate, formatTime, formatWeekdayDate, formatWeekdayDay, isValidIsoDate, monthRange, toIsoDate,
} from './dates';

describe('fechas locales', () => {
  it('toIsoDate usa componentes locales', () => {
    expect(toIsoDate(new Date(2026, 8, 19, 23, 59))).toBe('2026-09-19');
  });
  it('valida fechas', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('19/09/2026')).toBe(false);
  });
  it('calcula meses y rangos', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(daysInMonth('2026-02')).toBe(28);
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
  it('suma días y calcula diferencias', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(diffDays('2026-09-01', '2026-09-19')).toBe(18);
  });
  it('formatea en español', () => {
    expect(formatLongDate('2026-09-19')).toBe('19 septiembre 2026');
    expect(formatWeekdayDate('2026-09-30', new Date(2026, 8, 30))).toBe('miércoles 30 de septiembre');
    expect(formatWeekdayDay('2026-09-30')).toBe('miércoles 30');
    expect(formatWeekdayDay('2026-09-19')).toBe('sábado 19');
    expect(formatWeekdayDate('2025-12-25', new Date(2026, 8, 30))).toBe('jueves 25 de diciembre de 2025');
    expect(formatMonthTitle('2026-09')).toBe('Septiembre 2026');
    expect(formatTime('14:05')).toBe('2:05 p. m.');
    expect(formatTime('00:30')).toBe('12:30 a. m.');
    const now = new Date(2026, 8, 19);
    expect(formatDayHeading('2026-09-19', now)).toBe('Hoy');
    expect(formatDayHeading('2026-09-18', now)).toBe('Ayer');
    expect(formatDayHeading('2026-09-12', now)).toBe('sáb 12 sep');
  });
  it('fecha relativa para listas recientes', () => {
    const now = new Date(2026, 8, 30);
    expect(formatRelativeDate('2026-09-30', now)).toBe('Hoy');
    expect(formatRelativeDate('2026-09-29', now)).toBe('Ayer');
    expect(formatRelativeDate('2026-09-24', now)).toBe('Hace 6 días');
    expect(formatRelativeDate('2026-09-23', now)).toBe('23 sep');
    expect(formatRelativeDate('2026-10-02', now)).toBe('2 oct');
  });
  it('días transcurridos para promedios', () => {
    const now = new Date(2026, 8, 19);
    expect(elapsedDaysInMonth('2026-09', now)).toBe(19);
    expect(elapsedDaysInMonth('2026-08', now)).toBe(31);
    expect(elapsedDaysInMonth('2026-10', now)).toBe(1);
  });
});
