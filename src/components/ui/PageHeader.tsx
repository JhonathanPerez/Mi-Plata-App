import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './Button';

interface PageHeaderProps {
  title: string;
  /** Muestra la flecha de regreso (pantallas secundarias). */
  back?: boolean;
  actions?: ReactNode;
}

export function PageHeader({ title, back, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back && <IconButton icon="back" label="Volver" onClick={() => navigate(-1)} />}
      <h1 className="page-header__title">{title}</h1>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
