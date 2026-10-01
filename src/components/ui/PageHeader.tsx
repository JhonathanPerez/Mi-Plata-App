import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './Button';

interface PageHeaderProps {
  title: string;
  /** Línea pequeña bajo el título (por ejemplo, la fecha de hoy en Inicio). */
  subtitle?: string;
  /** Muestra la flecha de regreso (pantallas secundarias). */
  back?: boolean;
  /** Muestra la «X» en vez de la flecha (formularios que se abren encima de la app). */
  close?: boolean;
  /** Texto accesible de la «X»; por defecto «Cerrar». */
  closeLabel?: string;
  /** Acción de la «X»; por defecto vuelve a la pantalla anterior. El formulario la usa para pedir confirmación. */
  onClose?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back, close, closeLabel = 'Cerrar', onClose, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back && <IconButton icon="back" label="Volver" onClick={() => navigate(-1)} />}
      {close && !back && <IconButton icon="close" label={closeLabel} onClick={onClose ?? (() => navigate(-1))} />}
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
