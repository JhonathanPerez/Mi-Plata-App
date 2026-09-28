import { cx } from '@/lib/cx';
import { isEmoji, lastGrapheme } from '@/lib/text';

interface IconPickerProps {
  icons: string[];
  value: string;
  onChange: (icon: string) => void;
  label: string;
  /** Muestra un campo para escribir o pegar cualquier emoji. */
  allowCustom?: boolean;
}

export function IconPicker({ icons, value, onChange, label, allowCustom }: IconPickerProps) {
  const isCustom = value !== '' && !icons.includes(value);

  return (
    <div className="picker-wrap">
      <div className="picker" role="radiogroup" aria-label={label}>
        {icons.map((icon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={icon === value}
            aria-label={`Icono ${icon}`}
            className={cx('picker__icon', icon === value && 'is-selected')}
            onClick={() => onChange(icon)}
          >
            {icon}
          </button>
        ))}
      </div>

      {allowCustom && (
        <div className="picker-custom">
          <input
            className={cx('picker-custom__input', isCustom && 'is-selected')}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            maxLength={16}
            aria-label="Escribe o pega tu propio emoji"
            placeholder="🙂"
            value={isCustom ? value : ''}
            onChange={(event) => {
              const next = lastGrapheme(event.target.value);
              // Solo emojis: si escriben una letra o número, se ignora.
              if (next === '' || isEmoji(next)) onChange(next);
            }}
          />
          <p className="field__hint">
            ¿Quieres otro? Toca el cuadro y elige cualquier emoji con el teclado de tu teléfono.
          </p>
        </div>
      )}
    </div>
  );
}
