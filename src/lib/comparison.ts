import type { YearMonth } from '@/types/models';
import { MONTH_NAMES, addMonths, formatMonthTitle } from './dates';

/** Con variaciones enormes (de $1.000 a $50.000, +4900 %) el porcentaje solo mete ruido: se omite. */
export const MAX_SHOWN_PERCENT = 999;

export interface ComparisonInput {
  yearMonth: YearMonth;
  previousTotal: number;
  changeAmount: number;
  /** null cuando el mes anterior no tiene gastos. */
  changePercent: number | null;
}

/** `none`: no hay mes anterior con qué comparar · `same`: igual · `more` / `less`: gastó más / menos. */
export type ComparisonDirection = 'none' | 'same' | 'more' | 'less';

export interface Comparison {
  direction: ComparisonDirection;
  text: string;
}

/** «agosto»; el año solo se repite cuando el mes anterior cae en otro año (enero → «diciembre 2025»). */
export function previousMonthLabel(yearMonth: YearMonth): string {
  const previous = addMonths(yearMonth, -1);
  if (previous.slice(0, 4) === yearMonth.slice(0, 4)) return MONTH_NAMES[Number(previous.slice(5, 7)) - 1];
  return formatMonthTitle(previous).toLowerCase();
}

/** La frase que compara el mes con el anterior. `formatAmount` respeta el modo privacidad (viene de `useAmountFormat`). */
export function describeComparison(input: ComparisonInput, formatAmount: (value: number) => string): Comparison {
  const label = previousMonthLabel(input.yearMonth);
  if (input.previousTotal === 0) return { direction: 'none', text: `Sin gastos en ${label} para comparar.` };
  if (input.changeAmount === 0) return { direction: 'same', text: `Igual que en ${label}.` };

  const more = input.changeAmount > 0;
  const percent = Math.abs(Math.round(input.changePercent ?? 0));
  // Menos de 1 % redondea a «0 %» (no informa) y más de 999 % es ruido: en ambos casos solo va el monto.
  const percentText = percent >= 1 && percent <= MAX_SHOWN_PERCENT ? ` (${percent}%)` : '';
  return {
    direction: more ? 'more' : 'less',
    text: `Gastaste ${formatAmount(Math.abs(input.changeAmount))} ${more ? 'más' : 'menos'} que en ${label}${percentText}.`,
  };
}

/** La versión corta de la comparación, para la pastilla del hero de Inicio (`null` cuando no hay con qué comparar). */
export function describeChange(input: ComparisonInput, formatAmount: (value: number) => string): Comparison | null {
  if (input.previousTotal === 0) return null;
  const label = previousMonthLabel(input.yearMonth);
  if (input.changeAmount === 0) return { direction: 'same', text: `Igual que ${label}` };

  const percent = Math.abs(Math.round(input.changePercent ?? 0));
  // Mismo criterio que `describeComparison`: menos de 1 % o más de 999 % no informan, así que va el monto.
  const size = percent >= 1 && percent <= MAX_SHOWN_PERCENT ? `${percent}%` : formatAmount(Math.abs(input.changeAmount));
  return { direction: input.changeAmount > 0 ? 'more' : 'less', text: `${size} vs ${label}` };
}
