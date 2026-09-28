import { describe, expect, it } from 'vitest';
import { parseImportedDate, parseImportRows } from './importService';

describe('parseImportedDate', () => {
  it('entiende varios formatos', () => {
    expect(parseImportedDate('19/09/2026')).toBe('2026-09-19');
    expect(parseImportedDate('2026-09-19')).toBe('2026-09-19');
    expect(parseImportedDate(new Date(Date.UTC(2026, 8, 19)))).toBe('2026-09-19');
    expect(parseImportedDate(46284)).toBe('2026-09-19');
    expect(parseImportedDate('31/02/2026')).toBeNull();
    expect(parseImportedDate('hola')).toBeNull();
  });
});

describe('parseImportRows', () => {
  it('lee el formato exportado por la app y omite la fila Total', () => {
    const grid = [
      ['Fecha', 'Categoría', 'Descripción', 'Método de pago', 'Valor'],
      [new Date(Date.UTC(2026, 8, 19)), 'Alimentación', 'Almuerzo', 'Nubank', 35000],
      ['20/09/2026', 'Transporte', '', 'Efectivo', '$12.500'],
      [],
      ['Total', '', '', '', 47500],
      ['32/13/2026', 'X', '', 'Y', 100],
    ];
    const result = parseImportRows(grid);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ date: '2026-09-19', category: 'Alimentación', note: 'Almuerzo', method: 'Nubank', amount: 35000 });
    expect(result.rows[1]).toMatchObject({ date: '2026-09-20', note: null, amount: 12500 });
    expect(result.errors).toHaveLength(1);
  });
  it('falla si no hay encabezados reconocibles', () => {
    expect(() => parseImportRows([['a', 'b'], [1, 2]])).toThrow();
  });
});
