import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

interface LongPressOptions {
  /** Cuánto hay que mantener presionado para que cuente como "vista previa" (ms). */
  delayMs?: number;
  /** Cuánto se puede mover el dedo antes de cancelar (evita disparos al desplazar o deslizar). */
  moveToleranceX?: number;
  onLongPress: () => void;
}

interface LongPressBind {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onClickCapture: (e: ReactMouseEvent) => void;
}

/**
 * Mantener presionado sobre un elemento dispara `onLongPress` (por ejemplo, para abrir una vista
 * previa que se queda abierta hasta que la cierren aparte). Si el toque se movió (scroll, deslizar)
 * o duró poco (tap normal), no pasa nada especial y el click sigue su curso; si sí llegó a disparar
 * `onLongPress`, el click que sigue al soltar el dedo se descarta para no disparar además la acción
 * normal del elemento (por ejemplo, navegar a editar).
 */
export function useLongPress({ delayMs = 350, moveToleranceX = 10, onLongPress }: LongPressOptions): LongPressBind {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const suppressClick = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const end = useCallback(() => {
    clearTimer();
    start.current = null;
    if (active.current) {
      active.current = false;
      suppressClick.current = true;
    }
  }, [clearTimer]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Por si el gesto anterior terminó en un menú contextual nativo (Android no llega a disparar
      // "click" en ese caso, y la bandera se quedaría marcada para siempre descartando el próximo toque).
      suppressClick.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timer.current = setTimeout(() => {
        active.current = true;
        onLongPress();
      }, delayMs);
    },
    [clearTimer, delayMs, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!start.current || active.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > moveToleranceX) clearTimer();
    },
    [clearTimer, moveToleranceX],
  );

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    // En Android/iOS, mantener presionado puede abrir selección de texto o menú contextual: lo evitamos siempre.
    e.preventDefault();
  }, []);

  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onContextMenu,
    onClickCapture,
  };
}
