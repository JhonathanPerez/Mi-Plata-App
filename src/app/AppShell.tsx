import { Link, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { PageTransition } from '@/components/ui/PageTransition';
import { cx } from '@/lib/cx';
import { haptics } from '@/lib/haptics';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { BottomNav } from './BottomNav';

/** Marco de las 4 pestañas: contenido + navegación inferior + botón flotante "+". */
export function AppShell() {
  const { pathname } = useLocation();
  const scrollReady = useScrollRestoration();
  return (
    <div className="shell">
      {/* Oculto (no display:none, para no perder el alto real) hasta reubicar el scroll: evita
          el salto de "aparece arriba y luego baja" mientras cargan los datos de la lista. */}
      <main className={cx('shell__main', !scrollReady && 'shell__main--pending')}>
        {/* Con `key`, cada pestaña reinicia la animación de entrada. */}
        <PageTransition key={pathname} slide>
          <Outlet />
        </PageTransition>
      </main>
      <Link to="/gasto/nuevo" className="fab" aria-label="Agregar gasto" onClick={() => void haptics.tap()}>
        <Icon name="plus" size={30} />
      </Link>
      <BottomNav />
    </div>
  );
}
