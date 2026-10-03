import { EmojiTile } from './EmojiTile';
import { Row } from './Row';

interface ItemPreviewProps {
  emoji: string;
  color: string;
  name: string;
  /** Texto gris que se ve mientras todavía no hay nombre. */
  placeholder: string;
  detail?: string;
}

/**
 * Cómo se verá la categoría o el método de pago en su lista, mientras se arma en la hoja de edición:
 * así el icono y el color, que están más abajo, se ven en contexto. Es solo una vista previa, no se toca.
 */
export function ItemPreview({ emoji, color, name, placeholder, detail }: ItemPreviewProps) {
  const label = name.trim();
  return (
    <Row
      as="div"
      variant="card"
      aria-hidden="true"
      leading={<EmojiTile emoji={emoji || '🙂'} color={color} />}
      title={label || <span className="muted">{placeholder}</span>}
      detail={detail}
    />
  );
}
