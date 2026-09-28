import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatCOP, formatCOPCompact, parseAmount, parseLooseAmount } from './money';

describe('formatCOP', () => {
  it('usa puntos como separador de miles y sin decimales', () => {
    expect(formatCOP(10000)).toBe('$10.000');
    expect(formatCOP(25500)).toBe('$25.500');
    expect(formatCOP(1250000)).toBe('$1.250.000');
    expect(formatCOP(0)).toBe('$0');
    expect(formatCOP(999)).toBe('$999');
  });
  it('maneja negativos', () => {
    expect(formatCOP(-35000)).toBe('-$35.000');
  });
});

describe('formatCOPCompact', () => {
  it('abrevia miles y millones', () => {
    expect(formatCOPCompact(350000)).toBe('$350 mil');
    expect(formatCOPCompact(1250000)).toBe('$1,3 M');
    expect(formatCOPCompact(2000000)).toBe('$2 M');
    expect(formatCOPCompact(900)).toBe('$900');
  });
});

describe('parseAmount / formatAmountInput', () => {
  it('extrae solo dígitos', () => {
    expect(parseAmount('$35.000')).toBe(35000);
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
  });
  it('limita a 12 dígitos', () => {
    expect(parseAmount('99999999999999')).toBe(999999999999);
  });
  it('da formato al campo', () => {
    expect(formatAmountInput(1250000)).toBe('1.250.000');
    expect(formatAmountInput(0)).toBe('');
  });
});

describe('parseLooseAmount', () => {
  it('interpreta valores de Excel', () => {
    expect(parseLooseAmount(35000)).toBe(35000);
    expect(parseLooseAmount('35000')).toBe(35000);
    expect(parseLooseAmount('$35.000')).toBe(35000);
    expect(parseLooseAmount('1.250.000')).toBe(1250000);
    expect(parseLooseAmount('35.000,50')).toBe(35000);
    expect(parseLooseAmount('nada')).toBeNull();
    expect(parseLooseAmount(null)).toBeNull();
  });
});
