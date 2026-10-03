import { describe, expect, it } from 'vitest';
import { describeLockDelay, normalizeLockDelay, shouldRelock } from './lockPolicy';

describe('shouldRelock', () => {
  it('con retardo 0 siempre bloquea al volver', () => {
    expect(shouldRelock(1000, 1000, 0)).toBe(true);
    expect(shouldRelock(1000, 1500, 0)).toBe(true);
  });
  it('con retardo, solo bloquea si estuvo fuera suficiente tiempo', () => {
    expect(shouldRelock(0, 59_999, 60)).toBe(false);
    expect(shouldRelock(0, 60_000, 60)).toBe(true);
    expect(shouldRelock(0, 200_000, 300)).toBe(false);
    expect(shouldRelock(0, 300_000, 300)).toBe(true);
  });
  it('si el reloj retrocedió, bloquea', () => {
    expect(shouldRelock(10_000, 5_000, 300)).toBe(true);
  });
});

describe('normalizeLockDelay', () => {
  it('acepta solo los valores permitidos', () => {
    expect(normalizeLockDelay('60')).toBe(60);
    expect(normalizeLockDelay(300)).toBe(300);
    expect(normalizeLockDelay('0')).toBe(0);
    expect(normalizeLockDelay('999')).toBe(0);
    expect(normalizeLockDelay(null)).toBe(0);
    expect(normalizeLockDelay('abc')).toBe(0);
  });
});

describe('describeLockDelay', () => {
  it('resume cuándo se vuelve a pedir', () => {
    expect(describeLockDelay(0)).toBe('se pide siempre');
    expect(describeLockDelay(60)).toBe('se pide tras 1 min');
    expect(describeLockDelay(300)).toBe('se pide tras 5 min');
  });
});
