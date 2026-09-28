import { cx } from '@/lib/cx';
import { Icon } from './Icon';

interface ColorPickerProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  label: string;
}

export function ColorPicker({ colors, value, onChange, label }: ColorPickerProps) {
  return (
    <div className="picker" role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={`Color ${color}`}
          className={cx('picker__color', color === value && 'is-selected')}
          style={{ background: color }}
          onClick={() => onChange(color)}
        >
          {color === value && <Icon name="check" size={18} />}
        </button>
      ))}
    </div>
  );
}
