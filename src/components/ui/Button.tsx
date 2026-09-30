import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

/** `inverse`: botón blanco para ponerlo sobre un fondo de color (la tarjeta de crédito). */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'inverse';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
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

interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `inverse`: enlace blanco subrayado, para ponerlo sobre un fondo de color. */
  tone?: 'default' | 'inverse';
}

/** Botón con aspecto de enlace, para acciones secundarias dentro de un texto, una hoja o una tarjeta de color. */
export function LinkButton({ tone = 'default', className, ...rest }: LinkButtonProps) {
  return <button type="button" className={cx('link', 'link--button', tone === 'inverse' && 'link--inverse', className)} {...rest} />;
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
