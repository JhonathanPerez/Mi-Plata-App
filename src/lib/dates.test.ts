import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, clampYearMonth, daysInMonth, diffDays, elapsedDaysInMonth, formatDayHeading, formatLongDate,
  formatMonthTitle, formatShortDate, formatTime, formatWeekdayDate, formatWeekdayDay, isValidIsoDate, isYearMonth, monthRange, toIsoDate,
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
  it('fecha corta siempre con día y mes, también para hoy y ayer', () => {
    expect(formatShortDate('2026-09-30')).toBe('30 sep');
    expect(formatShortDate('2026-09-29')).toBe('29 sep');
    expect(formatShortDate('2026-10-02')).toBe('2 oct');
  });
  it('días transcurridos para promedios', () => {
    const now = new Date(2026, 8, 19);
    expect(elapsedDaysInMonth('2026-09', now)).toBe(19);
    expect(elapsedDaysInMonth('2026-08', now)).toBe(31);
    expect(elapsedDaysInMonth('2026-10', now)).toBe(1);
  });
});

describe('clampYearMonth', () => {
  it('deja pasar el mes del tope y los anteriores', () => {
    expect(clampYearMonth('2026-10', '2026-10')).toBe('2026-10');
    expect(clampYearMonth('2026-09', '2026-10')).toBe('2026-09');
    expect(clampYearMonth('2025-12', '2026-01')).toBe('2025-12');
  });
  it('baja al tope un mes que aún no llega, también si cambia el año', () => {
    expect(clampYearMonth('2026-11', '2026-10')).toBe('2026-10');
    expect(clampYearMonth('2027-01', '2026-12')).toBe('2026-12');
  });
});

describe('isYearMonth', () => {
  it('acepta meses con forma AAAA-MM', () => {
    expect(isYearMonth('2026-01')).toBe(true);
    expect(isYearMonth('2026-12')).toBe(true);
  });
  it('rechaza lo demás', () => {
    expect(isYearMonth('2026-00')).toBe(false);
    expect(isYearMonth('2026-13')).toBe(false);
    expect(isYearMonth('2026-1')).toBe(false);
    expect(isYearMonth('2026-10-05')).toBe(false);
    expect(isYearMonth('octubre')).toBe(false);
    expect(isYearMonth(null)).toBe(false);
    expect(isYearMonth(202610)).toBe(false);
  });
});
