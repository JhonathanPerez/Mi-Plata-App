/** Cada cuánto se vuelve a pedir la huella al regresar a la app (segundos). 0 = siempre. */
export const LOCK_DELAY_OPTIONS = [0, 60, 300] as const;
export type LockDelay = (typeof LOCK_DELAY_OPTIONS)[number];
export const DEFAULT_LOCK_DELAY: LockDelay = 0;

export function normalizeLockDelay(value: unknown): LockDelay {
  const number = typeof value === 'string' ? Number(value) : value;
  return (LOCK_DELAY_OPTIONS as readonly unknown[]).includes(number) ? (number as LockDelay) : DEFAULT_LOCK_DELAY;
}

/**
 * ¿Hay que volver a bloquear al regresar de segundo plano?
 * Si el reloj del teléfono retrocedió (tiempo negativo) se bloquea: ante la duda, protege.
 */
export function shouldRelock(backgroundedAt: number, now: number, delaySeconds: number): boolean {
  const elapsedMs = now - backgroundedAt;
  if (elapsedMs < 0) return true;
  return elapsedMs >= delaySeconds * 1000;
}
