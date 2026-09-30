import type { ElementType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

type NoticeTone = 'info' | 'warning' | 'danger';

interface NoticeProps {
  /** `info`: dato útil · `warning`: requiere atención · `danger`: algo salió mal o se pasó. */
  tone?: NoticeTone;
  /** Por defecto: `info` para el tono informativo y `warning` para los otros dos. */
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  /** Acción opcional (un botón) a la derecha; en pantallas angostas baja a su propia línea. */
  action?: ReactNode;
  /** Convierte todo el aviso en un enlace y añade una flecha al final. */
  to?: string;
  role?: 'status' | 'alert';
  'aria-label'?: string;
  className?: string;
}

/** Mensaje destacado con icono. Es el único sitio donde vive ese patrón (avisos, pistas, consejos e invitaciones). */
export function Notice({ tone = 'info', icon, title, children, action, to, role, className, 'aria-label': ariaLabel }: NoticeProps) {
  const Tag: ElementType = to ? Link : ariaLabel ? 'section' : 'div';
  return (
    <Tag
      className={cx('notice', `notice--${tone}`, to && 'notice--link', className)}
      role={role}
      aria-label={ariaLabel}
      {...(to ? { to } : {})}
    >
      <Icon name={icon ?? (tone === 'info' ? 'info' : 'warning')} size={20} className="notice__icon" />
      <span className="notice__body">
        {title && <strong className="notice__title">{title}</strong>}
        {children && <span className="notice__text">{children}</span>}
      </span>
      {to ? <Icon name="chevronRight" size={20} className="notice__chevron" /> : action && <span className="notice__action">{action}</span>}
    </Tag>
  );
}
