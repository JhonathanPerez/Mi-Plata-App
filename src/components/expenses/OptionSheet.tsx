import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/Row';
import { Sheet } from '@/components/ui/Sheet';
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
            <Row
              key={option.id}
              variant="card"
              role="radio"
              aria-checked={selected}
              selected={selected}
              leading={<EmojiTile emoji={option.icon} color={option.color} />}
              title={option.name}
              detail={option.description}
              trailing={selected ? <Icon name="check" size={20} className="row__check" /> : undefined}
              onClick={() => {
                void haptics.tap();
                onSelect(option.id);
                onClose();
              }}
            />
          );
        })}
      </div>
    </Sheet>
  );
}
