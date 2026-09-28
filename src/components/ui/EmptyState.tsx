import type { ReactNode } from 'react';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ emoji, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__emoji" aria-hidden="true">
        {emoji}
      </div>
      <h2 className="empty__title">{title}</h2>
      {description && <p className="empty__text">{description}</p>}
      {action}
    </div>
  );
}
