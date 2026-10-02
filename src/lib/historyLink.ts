import type { Id, YearMonth } from '@/types/models';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Enlace a Gastos con una categoría y un mes ya elegidos (desde Estadísticas). */
export function categoryHistoryPath(categoryId: Id, yearMonth: YearMonth): string {
  return `/gastos?${new URLSearchParams({ categoria: categoryId, mes: yearMonth }).toString()}`;
}

export interface HistoryParams {
  status: 'all' | 'due';
  categoryId: Id | null;
  /** null cuando no viene o no es un mes válido. */
  yearMonth: YearMonth | null;
}

/** Lee lo que Gastos acepta por la dirección: `estado=por-pagar`, `categoria=<id>` y `mes=AAAA-MM`. Lo inválido se ignora. */
export function parseHistoryParams(params: URLSearchParams): HistoryParams {
  const month = params.get('mes');
  return {
    status: params.get('estado') === 'por-pagar' ? 'due' : 'all',
    categoryId: params.get('categoria') || null,
    yearMonth: month !== null && YEAR_MONTH.test(month) ? month : null,
  };
}
