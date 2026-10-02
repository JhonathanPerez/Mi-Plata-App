/** Qué día (índice) queda bajo un punto horizontal del gráfico: `offsetX` se mide desde el borde izquierdo. Siempre devuelve un índice válido. */
export function indexAtPosition(offsetX: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  const index = Math.floor((offsetX / width) * count);
  return Math.min(count - 1, Math.max(0, index));
}

/** Mueve la selección con el teclado (o un lector de pantalla). Devuelve `null` si la tecla no hace nada aquí. */
export function stepIndex(current: number, key: string, count: number): number | null {
  const last = count - 1;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, current - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(last, current + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
