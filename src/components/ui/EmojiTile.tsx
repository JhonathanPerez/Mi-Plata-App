interface EmojiTileProps {
  emoji: string;
  color: string;
  size?: 'sm' | 'md';
}

/** Icono redondeado con el color de la categoría o del método de pago. */
export function EmojiTile({ emoji, color, size = 'md' }: EmojiTileProps) {
  return (
    <span
      className={`emoji-tile emoji-tile--${size}`}
      style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, borderColor: color }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
