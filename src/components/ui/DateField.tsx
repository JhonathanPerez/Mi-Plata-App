import { useId, type ReactNode } from 'react';
import { addDays, formatWeekdayDate, isValidIsoDate, todayIso } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { Chip } from './Chip';

interface DateFieldProps {
  label: string;
  /** Fecha en formato AAAA-MM-DD (vacía mientras no se elige). */
  value: string;
  onChange: (value: string) => void;
  /** Añade los atajos «Hoy» y «Ayer» antes del campo. */
  quick?: boolean;
  min?: string;
  max?: string;
  /** Sustituye la ayuda con el día de la semana. */
  error?: string;
  /** Contenido extra bajo la ayuda (por ejemplo «Normalmente: …»). */
  children?: ReactNode;
}

/** Campo de fecha: es el único sitio donde se pide una fecha. Ayuda con el día de la semana debajo. */
export function DateField({ label, value, onChange, quick, min, max, error, children }: DateFieldProps) {
  const id = useId();
  const today = todayIso();
  const yesterday = addDays(today, -1);
  return (
    <div className={cx('field', 'date-field', !quick && 'date-field--solo')}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="chip-row">
        {quick && (
          <>
            <Chip selected={value === today} onClick={() => onChange(today)}>
              Hoy
            </Chip>
            <Chip selected={value === yesterday} onClick={() => onChange(yesterday)}>
              Ayer
            </Chip>
          </>
        )}
        <input id={id} className="input input--date" type="date" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
      {error ? (
        <p className="field__error date-field__hint" role="alert">
          {error}
        </p>
      ) : (
        isValidIsoDate(value) && <p className="date-field__hint">{formatWeekdayDate(value)}</p>
      )}
      {children}
    </div>
  );
}
