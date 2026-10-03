import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

interface PromptCardProps {
  icon: IconName;
  title: ReactNode;
  /** Una frase bajo el título. */
  text?: ReactNode;
  /** `info`: invitación normal · `warning`: algo impide que funcione (por ejemplo un permiso bloqueado). */
  tone?: 'info' | 'warning';
  /** Lo que se gana al aceptar, entre el título y el botón. */
  children?: ReactNode;
  /** Botón principal, a todo el ancho. */
  action?: ReactNode;
  'aria-label'?: string;
}

/**
 * Invitación a activar algo (avisos, permisos): icono grande, título, lo que se gana y un botón ancho.
 * Es más grande que un `Notice` a propósito: pide una decisión, no solo informa.
 */
export function PromptCard({ icon, title, text, tone = 'info', children, action, 'aria-label': ariaLabel }: PromptCardProps) {
  return (
    <section className={cx('prompt', tone === 'warning' && 'prompt--warning')} aria-label={ariaLabel}>
      <div className="prompt__head">
        <span className="prompt__badge" aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
        <div className="prompt__text">
          <h2 className="prompt__title">{title}</h2>
          {text && <p className="prompt__lead">{text}</p>}
        </div>
      </div>
      {children}
      {action}
    </section>
  );
}
