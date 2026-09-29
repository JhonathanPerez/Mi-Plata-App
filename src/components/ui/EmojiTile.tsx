import { cssVars } from '@/lib/cssVars';

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
      style={cssVars({ '--tile-color': color })}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
