import { useCallback, useEffect, useRef, useState } from 'react';
import { settingsService } from '@/services/settingsService';

/** Veces que se muestra la pista antes de darla por sabida. */
export const SWIPE_HINT_MAX_PLAYS = 3;

/**
 * Pista de que las filas se pueden deslizar. Con `ready` (ya hay filas en pantalla) decide, una sola vez por visita,
 * si toca mostrarla: hasta `SWIPE_HINT_MAX_PLAYS` veces, o ninguna si la persona ya deslizó un gasto (`markLearned`).
 */
export function useSwipeHint(ready: boolean): { showHint: boolean; markLearned: () => void } {
  const [showHint, setShowHint] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    void settingsService
      .getSwipeHintCount()
      .then((count) => {
        if (count >= SWIPE_HINT_MAX_PLAYS) return;
        setShowHint(true);
        return settingsService.setSwipeHintCount(count + 1);
      })
      .catch(() => undefined); // la pista es un extra: si no se puede leer o guardar, simplemente no se muestra
  }, [ready]);

  const markLearned = useCallback(() => {
    setShowHint(false);
    void settingsService.setSwipeHintCount(SWIPE_HINT_MAX_PLAYS).catch(() => undefined);
  }, []);

  return { showHint, markLearned };
}
