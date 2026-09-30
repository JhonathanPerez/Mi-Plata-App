import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'aria-checked'> {
  selected: boolean;
}

/**
 * Píldora elegible. Por defecto es un interruptor (`aria-pressed`); con `role="radio"` expone `aria-checked`,
 * para grupos donde solo cabe una opción.
 */
export function Chip({ selected, className, children, ...rest }: ChipProps) {
  const state = rest.role === 'radio' ? { 'aria-checked': selected } : { 'aria-pressed': selected };
  return (
    <button type="button" className={cx('chip', selected && 'is-selected', className)} {...state} {...rest}>
      {children}
    </button>
  );
}
