import { useEffect, useState } from 'react';

/**
 * `true` mientras la persona baja por la pantalla; vuelve a `false` al subir o al estar cerca del inicio.
 * Sirve para esconder el botón flotante y que no tape los montos de la lista. `resetKey` (la ruta) lo reinicia.
 */
export function useHideOnScroll(resetKey: string, minDelta = 10, topZone = 80): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y <= topZone) setHidden(false);
      else if (delta > minDelta) setHidden(true);
      else if (delta < -minDelta) setHidden(false);
      else return;
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [resetKey, minDelta, topZone]);

  return hidden;
}
