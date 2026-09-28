import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { cx } from '@/lib/cx';
import { haptics } from '@/lib/haptics';

export interface PickerOption {
  id: string;
  icon: string;
  color: string;
  name: string;
  /** Línea secundaria (por ejemplo el tipo de tarjeta y sus últimos 4 dígitos). */
  description?: string;
}

interface OptionSheetProps {
  open: boolean;
  title: string;
  options: PickerOption[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Ventana auxiliar (hoja inferior) para elegir una opción con su ícono y su descripción. Al elegir, se cierra sola. */
export function OptionSheet({ open, title, options, value, onSelect, onClose }: OptionSheetProps) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="option-list" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cx('option-row', selected && 'is-selected')}
              onClick={() => {
                void haptics.tap();
                onSelect(option.id);
                onClose();
              }}
            >
              <EmojiTile emoji={option.icon} color={option.color} />
              <span className="option-row__text">
                <span className="option-row__name">{option.name}</span>
                {option.description && <span className="option-row__desc">{option.description}</span>}
              </span>
              {selected && <Icon name="check" size={20} className="option-row__check" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
