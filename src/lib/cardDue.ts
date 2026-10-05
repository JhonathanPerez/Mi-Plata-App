import { addMonths, statementDates } from './cycles';
import { diffDays, formatWeekdayDate } from './dates';
import type { CardOverview } from '@/services/cardService';
import type { IsoDate } from '@/types/models';

/** Urgencia de un vencimiento: la misma en Inicio («Por pagar») y en Tarjetas. */
export type DueTone = 'neutral' | 'warning' | 'danger';

/** Más de 7 días es calma; 7 o menos pide atención; hoy o vencido es urgente. */
export function dueTone(daysLeft: number): DueTone {
  if (daysLeft <= 0) return 'danger';
  return daysLeft <= 7 ? 'warning' : 'neutral';
}

export interface CardsDueSummary {
  /** Suma de los extractos cerrados por pagar de todas las tarjetas (lo mismo que muestra cada tarjeta en «Por pagar»). */
  total: number;
  /** Tarjetas con al menos un extracto por pagar. */
  cardCount: number;
}

/** Resumen de la pantalla Tarjetas. Se calcula con los extractos ya cargados: no hace otra consulta. */
export function summarizeCardsDue(overviews: CardOverview[]): CardsDueSummary {
  let total = 0;
  let cardCount = 0;
  for (const overview of overviews) {
    if (overview.payable.length === 0) continue;
    cardCount += 1;
    total += overview.payable.reduce((sum, statement) => sum + statement.unpaidTotal, 0);
  }
  return { total, cardCount };
}

export interface CycleProgress {
  /** Días transcurridos desde el corte anterior. */
  elapsed: number;
  /** Duración del ciclo en días. */
  total: number;
  /** Días que faltan para el corte. */
  daysLeft: number;
  /** Avance de 0 a 1. */
  ratio: number;
}

/** Avance entre dos cortes. Devuelve null si las fechas no forman un ciclo válido. */
export function cycleProgress(input: { today: IsoDate; previousCut: IsoDate; cut: IsoDate }): CycleProgress | null {
  const total = diffDays(input.previousCut, input.cut);
  if (total <= 0) return null;
  const elapsed = Math.min(total, Math.max(0, diffDays(input.previousCut, input.today)));
  return { elapsed, total, daysLeft: total - elapsed, ratio: elapsed / total };
}

/**
 * Avance del ciclo abierto de una tarjeta. El corte anterior sale del extracto del mes previo si existe
 * (puede tener fechas ajustadas a mano) y, si no, de la regla de la tarjeta.
 */
export function openCycleProgress(overview: CardOverview, today: IsoDate): CycleProgress | null {
  const { open, method, statements } = overview;
  if (!open || !method.cycle) return null;
  const previous = addMonths(open.period, -1);
  const previousCut = statements.find((statement) => statement.period === previous)?.cutDate ?? statementDates(method.cycle, previous).cut;
  return cycleProgress({ today, previousCut, cut: open.cutDate });
}

/** Cómo se dice el vencimiento en voz alta: «vence el martes 6 de octubre», «pago hoy», «venció hace 3 días». */
export function dueSpoken(dueDate: IsoDate, daysLeft: number, now: Date = new Date()): string {
  if (daysLeft < 0) return `venció hace ${-daysLeft} ${-daysLeft === 1 ? 'día' : 'días'}`;
  if (daysLeft === 0) return 'pago hoy';
  return `vence el ${formatWeekdayDate(dueDate, now)}`;
}
