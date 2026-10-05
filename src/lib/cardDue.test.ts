import { describe, expect, it } from 'vitest';
import { cycleProgress, dueSpoken, dueTone, summarizeCardsDue } from './cardDue';
import type { CardOverview } from '@/services/cardService';

const NOW = new Date(2026, 9, 2); // 2 oct 2026

describe('urgencia del vencimiento', () => {
  it('más de 7 días es calma; de 1 a 7 atención; hoy o vencido urgente', () => {
    expect(dueTone(30)).toBe('neutral');
    expect(dueTone(8)).toBe('neutral');
    expect(dueTone(7)).toBe('warning');
    expect(dueTone(1)).toBe('warning');
    expect(dueTone(0)).toBe('danger');
    expect(dueTone(-3)).toBe('danger');
  });
});

describe('resumen de tarjetas por pagar', () => {
  const overview = (payable: number[]) => ({ payable: payable.map((unpaidTotal) => ({ unpaidTotal })) }) as unknown as CardOverview;

  it('suma solo los extractos cerrados y cuenta las tarjetas con pagos pendientes', () => {
    expect(summarizeCardsDue([overview([664_600]), overview([]), overview([100_000, 50_000])])).toEqual({ total: 814_600, cardCount: 2 });
  });
  it('sin pagos pendientes queda en cero', () => {
    expect(summarizeCardsDue([overview([]), overview([])])).toEqual({ total: 0, cardCount: 0 });
    expect(summarizeCardsDue([])).toEqual({ total: 0, cardCount: 0 });
  });
});

describe('avance del ciclo abierto', () => {
  it('días transcurridos desde el corte anterior sobre la duración del ciclo', () => {
    expect(cycleProgress({ today: '2026-09-20', previousCut: '2026-09-08', cut: '2026-10-08' })).toEqual({ elapsed: 12, total: 30, daysLeft: 18, ratio: 0.4 });
  });
  it('el día del corte el ciclo está completo y antes del corte anterior queda en cero', () => {
    expect(cycleProgress({ today: '2026-10-08', previousCut: '2026-09-08', cut: '2026-10-08' })?.ratio).toBe(1);
    expect(cycleProgress({ today: '2026-09-01', previousCut: '2026-09-08', cut: '2026-10-08' })?.elapsed).toBe(0);
  });
  it('fechas que no forman un ciclo no dibujan barra', () => {
    expect(cycleProgress({ today: '2026-10-02', previousCut: '2026-10-08', cut: '2026-10-08' })).toBeNull();
  });
});

describe('vencimiento en voz alta', () => {
  it('fecha completa, hoy y vencido', () => {
    expect(dueSpoken('2026-10-06', 4, NOW)).toBe('vence el martes 6 de octubre');
    expect(dueSpoken('2026-10-02', 0, NOW)).toBe('pago hoy');
    expect(dueSpoken('2026-09-29', -3, NOW)).toBe('venció hace 3 días');
    expect(dueSpoken('2026-10-01', -1, NOW)).toBe('venció hace 1 día');
  });
});
