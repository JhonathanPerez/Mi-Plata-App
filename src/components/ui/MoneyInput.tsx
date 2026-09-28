import { formatAmountInput, parseAmount } from '@/lib/money';
import { cx } from '@/lib/cx';

interface MoneyInputProps {
  id: string;
  value: number;
  onChange: (value: number) => void;
  label: string;
  error?: string;
  autoFocus?: boolean;
  size?: 'hero' | 'md';
}

/** Campo de pesos: teclado numérico, puntos de miles en vivo y solo enteros. */
export function MoneyInput({ id, value, onChange, label, error, autoFocus, size = 'md' }: MoneyInputProps) {
  return (
    <div className={cx('money', `money--${size}`, error && 'money--error')}>
      <label className="money__label" htmlFor={id}>
        {label}
      </label>
      <div className="money__box">
        <span className="money__symbol" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          className="money__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={formatAmountInput(value)}
          onChange={(event) => onChange(parseAmount(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
