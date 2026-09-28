import type { ComponentProps } from 'react';
import NumberFlow from '@number-flow/react';
import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { cx } from '@/lib/cx';
import { HIDDEN_AMOUNT, HIDDEN_AMOUNT_COMPACT, formatCOP, formatCOPCompact } from '@/lib/money';

/** El tipo de `format` que acepta NumberFlow (más estrecho que Intl.NumberFormatOptions). */
type NumberFlowFormat = NonNullable<ComponentProps<typeof NumberFlow>['format']>;

/**
 * Formato en pesos: puntos de miles siempre (también en 4 cifras: "1.062", que el formato es-CO por
 * defecto escribiría "1062") y sin decimales.
 */
const COP_FORMAT = { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as NumberFlowFormat;

interface MoneyProps {
  value: number;
  className?: string;
}

/** Un monto en pesos cuyas cifras "ruedan" al cambiar (por ejemplo al registrar un gasto). Respeta el modo privacidad. */
export function Money({ value, className }: MoneyProps) {
  const { hidden } = usePrivacy();
  if (hidden) {
    return (
      <span className={cx(className, 'amount-mask')} role="img" aria-label="Valor oculto">
        {HIDDEN_AMOUNT}
      </span>
    );
  }
  return <NumberFlow className={className} value={Math.round(value)} locales="es-CO" prefix="$" format={COP_FORMAT} />;
}

interface AmountProps {
  value: number;
  /** Versión corta ($350 mil) para espacios reducidos. */
  compact?: boolean;
}

/** Monto como texto simple (sin animación de cifras), enmascarado cuando el modo privacidad está activo. */
export function Amount({ value, compact }: AmountProps) {
  const { hidden } = usePrivacy();
  if (hidden) {
    return (
      <span className="amount-mask" role="img" aria-label="Valor oculto">
        {compact ? HIDDEN_AMOUNT_COMPACT : HIDDEN_AMOUNT}
      </span>
    );
  }
  return <>{compact ? formatCOPCompact(value) : formatCOP(value)}</>;
}
