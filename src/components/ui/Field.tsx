import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p className="field__error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
