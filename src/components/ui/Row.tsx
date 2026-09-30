import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

interface RowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  title: ReactNode;
  /** Línea secundaria bajo el título. */
  detail?: ReactNode;
  /**
   * Más líneas bajo el título y el detalle, en el orden en que se pasen. Cada una se arma con
   * `<span className="row__detail">` (o `row__note`, `row__status`) para heredar el estilo de la fila.
   */
  children?: ReactNode;
  /** Ícono dentro de un cuadro a la izquierda (ajustes). */
  icon?: IconName;
  /** Pieza propia a la izquierda (por ejemplo un `EmojiTile`). */
  leading?: ReactNode;
  /** Monto a la derecha, en la tipografía de cifras de la app. */
  amount?: ReactNode;
  /** Texto pequeño bajo el monto (por ejemplo la fecha). Solo se muestra si hay `amount`. */
  aside?: ReactNode;
  /** Pieza propia a la derecha (casilla, marca de elegido…). */
  trailing?: ReactNode;
  /** Ícono decorativo al final de la fila (flecha, lápiz…). */
  chevron?: IconName;
  /**
   * `list`: dentro de una tarjeta, con divisores entre filas.
   * `flush`: sin margen lateral, para listas dentro de una hoja.
   * `card`: con borde propio y estado elegido, para escoger una opción.
   */
  variant?: 'list' | 'flush' | 'card';
  /** `start` pega el contenido arriba; útil cuando hay líneas de texto que pueden ocupar varios renglones. */
  align?: 'center' | 'start';
  tone?: 'default' | 'danger';
  selected?: boolean;
  /** La fila abre algo al mantenerla presionada: evita que se seleccione el texto o salga el menú del sistema. */
  holdable?: boolean;
}

/** Fila táctil de lista: (ícono) título, detalle y algo a la derecha. Es el único sitio donde vive ese patrón. */
export function Row({
  title,
  detail,
  children,
  icon,
  leading,
  amount,
  aside,
  trailing,
  chevron,
  variant = 'list',
  align = 'center',
  tone = 'default',
  selected,
  holdable,
  className,
  ...rest
}: RowProps) {
  return (
    <button
      type="button"
      className={cx(
        'row',
        `row--${variant}`,
        align === 'start' && 'row--start',
        tone === 'danger' && 'row--danger',
        holdable && 'row--holdable',
        selected && 'is-selected',
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="row__icon">
          <Icon name={icon} size={22} />
        </span>
      )}
      {leading}
      <span className="row__body">
        <span className="row__title">{title}</span>
        {detail && <span className="row__detail">{detail}</span>}
        {children}
      </span>
      {amount !== undefined && (
        <span className="row__side">
          <span className="row__amount">{amount}</span>
          {aside && <span className="row__detail">{aside}</span>}
        </span>
      )}
      {trailing}
      {chevron && <Icon name={chevron} size={20} className="row__chevron" />}
    </button>
  );
}
