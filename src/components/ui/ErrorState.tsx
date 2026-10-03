import { Button } from './Button';
import { Icon } from './Icon';

interface ErrorStateProps {
  title?: string;
  /** Una línea que diga qué no se pudo leer. */
  description?: string;
  onRetry: () => void;
}

/** Error al cargar datos: usa la misma forma que un estado vacío, con un icono de advertencia y un botón para reintentar. */
export function ErrorState({ title = 'No pudimos cargar esto', description = 'Inténtalo de nuevo en un momento.', onRetry }: ErrorStateProps) {
  return (
    <div className="empty empty--error" role="alert">
      <div className="empty__icon" aria-hidden="true">
        <Icon name="warning" size={40} />
      </div>
      <h2 className="empty__title">{title}</h2>
      <p className="empty__text">{description}</p>
      <Button variant="secondary" icon="refresh" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
