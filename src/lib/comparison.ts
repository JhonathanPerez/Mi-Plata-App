import type { YearMonth } from '@/types/models';
import { MONTH_NAMES, addMonths, formatMonthTitle } from './dates';

export interface ComparisonInput {
  yearMonth: YearMonth;
  previousTotal: number;
  changeAmount: number;
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

/** La frase que compara el mes con el anterior, siempre en pesos (nunca en porcentaje): «Gastaste … más» si gastó más y «Has gastado … menos» si gastó menos y «Has gastado lo mismo» si gastó igual. `formatAmount` respeta el modo privacidad (viene de `useAmountFormat`). */
export function describeComparison(input: ComparisonInput, formatAmount: (value: number) => string): Comparison {
  const label = previousMonthLabel(input.yearMonth);
  if (input.previousTotal === 0) return { direction: 'none', text: `Sin gastos en ${label} para comparar.` };
  if (input.changeAmount === 0) return { direction: 'same', text: `Has gastado lo mismo que en ${label}.` };

  const amount = formatAmount(Math.abs(input.changeAmount));
  if (input.changeAmount > 0) return { direction: 'more', text: `Gastaste ${amount} más que en ${label}.` };
  return { direction: 'less', text: `Has gastado ${amount} menos que en ${label}.` };
}

/** La versión corta de la comparación, para la pastilla del hero de Inicio (`null` cuando no hay con qué comparar). */
export function describeChange(input: ComparisonInput, formatAmount: (value: number) => string): Comparison | null {
  if (input.previousTotal === 0) return null;
  const label = previousMonthLabel(input.yearMonth);
  if (input.changeAmount === 0) return { direction: 'same', text: `Igual que ${label}` };
  return { direction: input.changeAmount > 0 ? 'more' : 'less', text: `${formatAmount(Math.abs(input.changeAmount))} vs ${label}` };
}
