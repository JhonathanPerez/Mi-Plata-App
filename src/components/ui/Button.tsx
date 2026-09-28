import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  loading,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {icon && <Icon name={icon} size={20} />}
      <span>{loading ? 'Un momento…' : children}</span>
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
}

export function IconButton({ icon, label, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={22} />
    </button>
  );
}
