import { describe, expect, it } from 'vitest';
import { readReturnTarget, readStatsMonth, statsReturnTarget } from './navigationState';

describe('readReturnTarget', () => {
  it('lee a dónde volver, con su estado', () => {
    expect(readReturnTarget({ returnTo: statsReturnTarget('2026-09') })).toEqual({ to: '/estadisticas', state: { yearMonth: '2026-09' } });
  });
  it('el estado es opcional', () => {
    expect(readReturnTarget({ returnTo: { to: '/gastos' } })).toEqual({ to: '/gastos' });
  });
  it('ignora estados vacíos o de otra forma', () => {
    expect(readReturnTarget(null)).toBeUndefined();
    expect(readReturnTarget(undefined)).toBeUndefined();
    expect(readReturnTarget({})).toBeUndefined();
    expect(readReturnTarget({ scrollTo: 'por-categoria' })).toBeUndefined();
    expect(readReturnTarget({ returnTo: 'estadisticas' })).toBeUndefined();
    expect(readReturnTarget({ returnTo: null })).toBeUndefined();
  });
  it('solo acepta rutas internas', () => {
    expect(readReturnTarget({ returnTo: { to: 'https://ejemplo.com' } })).toBeUndefined();
    expect(readReturnTarget({ returnTo: { to: '//ejemplo.com' } })).toBeUndefined();
    expect(readReturnTarget({ returnTo: { to: 42 } })).toBeUndefined();
  });
});

describe('readStatsMonth', () => {
  it('lee el mes guardado', () => {
    expect(readStatsMonth({ yearMonth: '2026-08' })).toBe('2026-08');
  });
  it('ignora lo que no es un mes', () => {
    expect(readStatsMonth(null)).toBeNull();
    expect(readStatsMonth({})).toBeNull();
    expect(readStatsMonth({ yearMonth: '2026-13' })).toBeNull();
    expect(readStatsMonth({ yearMonth: 5 })).toBeNull();
    expect(readStatsMonth({ scrollTo: 'por-categoria' })).toBeNull();
  });
});
