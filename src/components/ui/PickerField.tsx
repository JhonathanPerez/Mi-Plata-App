import { EmojiTile } from './EmojiTile';
import { Icon } from './Icon';

export interface PickerValue {
  /** Sin `icon` y `color` no se dibuja el cuadro de emoji (por ejemplo, para una regla en texto). */
  icon?: string;
  color?: string;
  name: string;
  description?: string;
}

interface PickerFieldProps {
  label: string;
  /** Texto del enlace cuando todavía no hay nada elegido (por ejemplo "Elegir categoría"). */
  placeholder?: string;
  selected: PickerValue | null;
  error?: string;
  /** Texto de ayuda bajo el campo. */
  hint?: string;
  /** `false` si tocarlo lleva a otra pantalla en vez de abrir una ventana auxiliar. */
  popup?: boolean;
  onOpen: () => void;
}

interface PickerButtonProps {
  selected: PickerValue | null;
  placeholder: string;
  popup: boolean;
  onOpen: () => void;
}

function PickerButton({ selected, placeholder, popup, onOpen }: PickerButtonProps) {
  return (
    <button type="button" className="picker-link" aria-haspopup={popup ? 'dialog' : undefined} onClick={onOpen}>
      {selected ? (
        <>
          {selected.icon && selected.color && <EmojiTile emoji={selected.icon} color={selected.color} />}
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
  );
}

/**
 * Campo que se comporta como un enlace: muestra lo elegido (ícono y nombre, con estilo de vínculo) y al tocarlo
 * abre una ventana auxiliar para cambiarlo. Reemplaza a las cuadrículas de opciones que ocupaban toda la pantalla.
 * Es el único sitio donde vive ese patrón: las reglas del ciclo y los métodos de pago lo reutilizan.
 */
export function PickerField({ label, placeholder = '', selected, error, hint, popup = true, onOpen }: PickerFieldProps) {
  return (
    <fieldset className="fieldset">
      <legend className="field__label">{label}</legend>
      <PickerButton selected={selected} placeholder={placeholder} popup={popup} onOpen={onOpen} />
      {hint && <p className="field__hint">{hint}</p>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
