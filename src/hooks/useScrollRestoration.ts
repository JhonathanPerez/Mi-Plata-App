import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Última posición de scroll conocida por ruta. Vive en memoria del módulo (no en el componente),
 * así que sobrevive a que AppShell se desmonte por completo al entrar a "editar gasto" y se vuelva
 * a montar al volver con Atrás.
 */
const positions = new Map<string, number>();

/**
 * Recuerda dónde iba el scroll de cada pestaña (Inicio, Gastos, etc.) y lo restaura al volver a
 * esa ruta, sin que se alcance a ver el salto.
 *
 * La lista tarda un instante en pintar sus datos (se cargan de forma asíncrona), así que si se
 * restaurara el scroll apenas se monta, el usuario vería primero el inicio de la lista y luego un
 * salto hasta abajo. Para evitarlo, mientras haya una posición pendiente por restaurar, el llamador
 * debe mantener el contenido oculto (con el booleano que devuelve este hook): se va reintentando
 * cuadro a cuadro hasta que el documento ya sea lo bastante alto como para llegar ahí (o hasta un
 * límite corto de intentos), y solo entonces se revela, ya en la posición correcta.
 */
export function useScrollRestoration(): boolean {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(() => (positions.get(pathname) ?? 0) === 0);

  useEffect(() => {
    const target = positions.get(pathname) ?? 0;
    let cancelled = false;
    setReady(target === 0);

    if (target > 0) {
      let attempts = 0;
      const tryRestore = () => {
        if (cancelled) return;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        attempts += 1;
        if (maxScroll >= target || attempts >= 20) {
          window.scrollTo(0, Math.min(target, Math.max(maxScroll, 0)));
          setReady(true);
          return;
        }
        requestAnimationFrame(tryRestore);
      };
      requestAnimationFrame(tryRestore);
    }

    const onScroll = () => positions.set(pathname, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return ready;
}
