import { useId, useRef, type ReactNode } from 'react';
import { addDays, formatWeekdayDate, isValidIsoDate, todayIso } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { Chip } from './Chip';
import { Icon } from './Icon';

interface DateFieldProps {
  label: string;
  /** Fecha en formato AAAA-MM-DD (vacía mientras no se elige). */
  value: string;
  onChange: (value: string) => void;
  /** Muestra los atajos «Hoy», «Ayer» y «Otra fecha» (este abre el calendario) en vez del campo nativo. */
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
  const labelId = `${id}-label`;
  const nativeRef = useRef<HTMLInputElement>(null);
  const today = todayIso();
  const yesterday = addDays(today, -1);

  const openCalendar = () => {
    const input = nativeRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // WebViews sin showPicker(): el clic sobre el campo nativo también abre el calendario.
      input.focus();
      input.click();
    }
  };

  const hint = error ? (
    <p className="field__error date-field__hint" role="alert">
      {error}
    </p>
  ) : (
    isValidIsoDate(value) && <p className="date-field__hint">{formatWeekdayDate(value)}</p>
  );

  if (!quick) {
    return (
      <div className="field date-field date-field--solo">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <div className="chip-row">
          <input id={id} className="input input--date" type="date" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
        {hint}
        {children}
      </div>
    );
  }

  return (
    <div className="field date-field">
      <span className="field__label" id={labelId}>
        {label}
      </span>
      <div className="chip-row" role="group" aria-labelledby={labelId}>
        <Chip selected={value === today} onClick={() => onChange(today)}>
          Hoy
        </Chip>
        <Chip selected={value === yesterday} onClick={() => onChange(yesterday)}>
          Ayer
        </Chip>
        <span className="date-field__other">
          <Chip selected={value !== today && value !== yesterday} onClick={openCalendar}>
            <Icon name="calendar" size={18} />
            Otra fecha
          </Chip>
          <input
            ref={nativeRef}
            className="date-field__native"
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            min={min}
            max={max}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      </div>
      {hint}
      {children}
    </div>
  );
}
