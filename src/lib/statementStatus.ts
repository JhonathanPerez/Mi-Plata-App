import { diffDays, formatShortDate } from './dates';
import { relativeDays } from './statementText';
import type { IsoDate } from '@/types/models';

/** `paid` pagado · `neutral` por pagar con más de 7 días · `warning` vence en 7 días o menos · `danger` vence hoy o ya venció. */
export type StatementTone = 'paid' | 'neutral' | 'warning' | 'danger';

export interface StatementStatus {
  tone: StatementTone;
  /** Texto de la pastilla: «Pagado · 29 sep», «Por pagar», «Por pagar · en 4 días», «Vence hoy», «Vencido · hace 3 días». */
  label: string;
  /** Lo que falta por pagar cuando el extracto se pagó solo en parte; null si no aplica. */
  partialUnpaid: number | null;
}

interface StatementLike {
  dueDate: IsoDate;
  paidCount: number;
  unpaidCount: number;
  unpaidTotal: number;
  lastPaidAt: IsoDate | null;
}

/**
 * Estado de un extracto cerrado. Usa los mismos umbrales que «Por pagar» en Inicio y las tarjetas
 * (más de 7 días es calma, 7 o menos pide atención, hoy o vencido es urgente), así las pantallas dicen lo mismo.
 */
export function statementStatus(statement: StatementLike, today: IsoDate): StatementStatus {
  if (statement.unpaidCount === 0) {
    return { tone: 'paid', label: statement.lastPaidAt ? `Pagado · ${formatShortDate(statement.lastPaidAt)}` : 'Pagado', partialUnpaid: null };
  }
  const partialUnpaid = statement.paidCount > 0 ? statement.unpaidTotal : null;
  const days = diffDays(today, statement.dueDate);
  if (days < 0) return { tone: 'danger', label: `Vencido · hace ${-days} ${-days === 1 ? 'día' : 'días'}`, partialUnpaid };
  if (days === 0) return { tone: 'danger', label: 'Vence hoy', partialUnpaid };
  if (days <= 7) return { tone: 'warning', label: `Por pagar · ${relativeDays(days)}`, partialUnpaid };
  return { tone: 'neutral', label: 'Por pagar', partialUnpaid };
}
