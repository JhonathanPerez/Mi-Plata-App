import { useId } from 'react';
import { motion } from 'motion/react';
import { cx } from '@/lib/cx';
import { haptics } from '@/lib/haptics';

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  /** `primary`: la opción elegida se marca con el color de la marca (por defecto, solo con una píldora elevada). */
  tone?: 'neutral' | 'primary';
}

/** Selector de opciones con una "píldora" que se desliza hasta la opción elegida. */
export function Segmented<T extends string>({ value, options, onChange, label, tone = 'neutral' }: SegmentedProps<T>) {
  const thumbId = useId();
  return (
    <div className={cx('segmented', tone === 'primary' && 'segmented--primary')} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx('segmented__item', active && 'is-active')}
            onClick={() => {
              if (!active) void haptics.tap();
              onChange(option.value);
            }}
          >
            {active && (
              <motion.span
                layoutId={thumbId}
                className="segmented__thumb"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            <span className="segmented__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
