import { describe, expect, it } from 'vitest';
import { categoryHistoryPath, parseHistoryParams } from './historyLink';

describe('categoryHistoryPath', () => {
  it('lleva la categoría y el mes', () => {
    expect(categoryHistoryPath('cat-1', '2026-10')).toBe('/gastos?categoria=cat-1&mes=2026-10');
  });
  it('codifica ids con caracteres especiales', () => {
    expect(categoryHistoryPath('a b&c', '2026-10')).toBe('/gastos?categoria=a+b%26c&mes=2026-10');
  });
});

describe('parseHistoryParams', () => {
  const parse = (query: string) => parseHistoryParams(new URLSearchParams(query));

  it('sin parámetros todo queda por defecto', () => {
    expect(parse('')).toEqual({ status: 'all', categoryId: null, yearMonth: null });
  });
  it('reconoce Por pagar', () => {
    expect(parse('estado=por-pagar').status).toBe('due');
    expect(parse('estado=otra-cosa').status).toBe('all');
  });
  it('lee categoría y mes', () => {
    expect(parse('categoria=cat-1&mes=2026-10')).toEqual({ status: 'all', categoryId: 'cat-1', yearMonth: '2026-10' });
  });
  it('ignora un mes inválido', () => {
    expect(parse('mes=2026-13').yearMonth).toBeNull();
    expect(parse('mes=octubre').yearMonth).toBeNull();
    expect(parse('mes=2026-1').yearMonth).toBeNull();
  });
  it('ignora una categoría vacía', () => {
    expect(parse('categoria=').categoryId).toBeNull();
  });
  it('ida y vuelta con categoryHistoryPath', () => {
    const query = categoryHistoryPath('cat 1/x', '2026-02').split('?')[1];
    expect(parse(query)).toEqual({ status: 'all', categoryId: 'cat 1/x', yearMonth: '2026-02' });
  });
});
