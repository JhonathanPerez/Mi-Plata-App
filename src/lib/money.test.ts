import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatCOP, formatCOPCompact, formatPercent, parseAmount, parseLooseAmount } from './money';

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
    expect(formatCOPCompact(1250000)).toBe('$1,25 M');
    expect(formatCOPCompact(2000000)).toBe('$2 M');
    expect(formatCOPCompact(900)).toBe('$900');
  });
  it('no redondea los millones hasta cambiar la cifra a ojo', () => {
    expect(formatCOPCompact(1950000)).toBe('$1,95 M');
    expect(formatCOPCompact(1000000)).toBe('$1 M');
    expect(formatCOPCompact(9990000)).toBe('$9,99 M');
    expect(formatCOPCompact(18750000)).toBe('$18,8 M');
    expect(formatCOPCompact(123456789)).toBe('$123 M');
  });
  it('cerca del millón sube de mil a millón sin escribir «$1000 mil»', () => {
    expect(formatCOPCompact(999499)).toBe('$999 mil');
    expect(formatCOPCompact(999500)).toBe('$1 M');
  });
  it('maneja negativos', () => {
    expect(formatCOPCompact(-1950000)).toBe('-$1,95 M');
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

describe('formatPercent', () => {
  it('redondea al entero más cercano', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(4.2)).toBe('4%');
    expect(formatPercent(58.6)).toBe('59%');
    expect(formatPercent(100)).toBe('100%');
  });
  it('no muestra 0 % ni 100 % cuando no lo son', () => {
    // 12.000.000 de 12.035.000 = 99,71 %; 35.000 de 12.035.000 = 0,29 %.
    expect(formatPercent((12_000_000 / 12_035_000) * 100)).toBe('>99%');
    expect(formatPercent((35_000 / 12_035_000) * 100)).toBe('<1%');
  });
});
