import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        <Icon name={icon} size={40} />
      </div>
      <h2 className="empty__title">{title}</h2>
      {description && <p className="empty__text">{description}</p>}
      {action}
    </div>
  );
}
