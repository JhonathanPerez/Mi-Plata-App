import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/ui/Icon';

const ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/gastos', label: 'Gastos', icon: 'list' },
  { to: '/estadisticas', label: 'Estadísticas', icon: 'chart' },
  { to: '/ajustes', label: 'Ajustes', icon: 'sliders' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          replace
          className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}
        >
          {({ isActive }) => (
            <>
              {/* Un solo indicador que se desliza de una pestaña a otra. */}
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  className="bottom-nav__indicator"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
              <Icon name={item.icon} size={26} weight={isActive ? 'fill' : 'regular'} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
