import { EmojiTile } from './EmojiTile';
import { Icon } from './Icon';

export interface PickerValue {
  icon: string;
  color: string;
  name: string;
  description?: string;
}

interface PickerFieldProps {
  label: string;
  /** Texto del enlace cuando todavía no hay nada elegido (por ejemplo "Elegir categoría"). */
  placeholder: string;
  selected: PickerValue | null;
  error?: string;
  onOpen: () => void;
}

/**
 * Campo que se comporta como un enlace: muestra lo elegido (ícono y nombre, con estilo de vínculo) y al tocarlo
 * abre una ventana auxiliar para cambiarlo. Reemplaza a las cuadrículas de opciones que ocupaban toda la pantalla.
 */
export function PickerField({ label, placeholder, selected, error, onOpen }: PickerFieldProps) {
  return (
    <fieldset className="fieldset">
      <legend className="field__label">{label}</legend>
      <button type="button" className="picker-link" aria-haspopup="dialog" onClick={onOpen}>
        {selected ? (
          <>
            <EmojiTile emoji={selected.icon} color={selected.color} />
            <span className="picker-link__text">
              <span className="picker-link__name">{selected.name}</span>
              {selected.description && <span className="picker-link__desc">{selected.description}</span>}
            </span>
            <span className="picker-link__action">
              Cambiar
              <Icon name="chevronRight" size={16} />
            </span>
          </>
        ) : (
          <>
            <span className="picker-link__text">
              <span className="picker-link__name picker-link__name--empty">{placeholder}</span>
            </span>
            <Icon name="chevronRight" size={18} className="picker-link__chevron" />
          </>
        )}
      </button>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
