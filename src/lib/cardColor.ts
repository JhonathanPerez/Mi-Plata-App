/**
 * Legibilidad del texto blanco sobre el color que la persona elige para su tarjeta.
 * Una capa negra semitransparente oscurece el degradado; esta función calcula cuánta hace falta
 * para que el texto pequeño llegue al contraste mínimo (4.5:1), también donde se aclara con el brillo y los paneles de vidrio.
 */

/** Contraste mínimo de texto normal (WCAG AA). */
const MIN_CONTRAST = 4.5;
/** Capa base: la que lleva toda tarjeta aunque su color ya sea oscuro. */
const BASE_SCRIM = 0.4;
const SCRIM_STEP = 0.05;
const MAX_SCRIM = 0.75;
/** Lo más que se aclara el fondo bajo un texto: el brillo de la esquina o un panel de vidrio (blanco al 24 %). */
const LIGHTEST_OVERLAY = 0.24;

function channels(hex: string): [number, number, number] | null {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contraste del texto blanco sobre `hex` con la capa oscura `scrim` y el peor caso de aclarado encima. */
export function whiteTextContrast(hex: string, scrim: number): number {
  const rgb = channels(hex);
  if (!rgb) return Infinity;
  const darkened = rgb.map((channel) => channel * (1 - scrim));
  const lightest = darkened.map((channel) => channel * (1 - LIGHTEST_OVERLAY) + 255 * LIGHTEST_OVERLAY) as [number, number, number];
  return 1.05 / (luminance(lightest) + 0.05);
}

/** Opacidad (0–1) de la capa negra de una tarjeta: 0.40 como mínimo, más si el color es claro. */
export function cardScrim(hex: string): number {
  let scrim = BASE_SCRIM;
  while (scrim < MAX_SCRIM && whiteTextContrast(hex, scrim) < MIN_CONTRAST) scrim = Math.round((scrim + SCRIM_STEP) * 100) / 100;
  return scrim;
}
