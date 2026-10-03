import type { YearMonth } from '@/types/models';
import { isYearMonth } from './dates';

/** A dónde debe volver «Atrás» (y con qué estado) cuando una pantalla se abre desde otra que no es la anterior en la pila. */
export interface ReturnTarget {
  to: string;
  state?: unknown;
}

/** Lo que Estadísticas deja al salir hacia otra pestaña: volver a Estadísticas, en el mismo mes. */
export function statsReturnTarget(yearMonth: YearMonth): ReturnTarget {
  return { to: '/estadisticas', state: { yearMonth } };
}

/** Lee `returnTo` del estado de la ubicación. Ese estado viene del historial del navegador: se valida en vez de fiarse de él. */
export function readReturnTarget(state: unknown): ReturnTarget | undefined {
  const value = (state as { returnTo?: unknown } | null)?.returnTo;
  if (typeof value !== 'object' || value === null) return undefined;
  const { to, state: inner } = value as { to?: unknown; state?: unknown };
  // Solo rutas internas de la app.
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) return undefined;
  return inner === undefined ? { to } : { to, state: inner };
}

/** El mes que Estadísticas debe mostrar al abrirse, si lo trae el estado de la ubicación. */
export function readStatsMonth(state: unknown): YearMonth | null {
  const month = (state as { yearMonth?: unknown } | null)?.yearMonth;
  return isYearMonth(month) ? month : null;
}
