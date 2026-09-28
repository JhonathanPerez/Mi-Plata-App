/** Minúsculas y sin tildes, para búsquedas y comparaciones tolerantes. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

type SegmenterCtor = new (
  locale?: string,
  options?: { granularity: 'grapheme' },
) => { segment(text: string): Iterable<{ segment: string }> };

/** Divide en "caracteres visibles" (un emoji con tono de piel o una bandera cuenta como uno). */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

/** Último carácter visible escrito (lo que el usuario acaba de teclear o pegar). */
export function lastGrapheme(text: string): string {
  const parts = graphemes(text.trim());
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/** ¿Contiene un emoji? (incluye banderas y teclas tipo 1️⃣) */
export function isEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(value);
}
