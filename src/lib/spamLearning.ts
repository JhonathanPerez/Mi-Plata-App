import { normalizeText } from '@/lib/text';

/**
 * Aprendizaje local de mensajes de publicidad, a partir de lo que el usuario reporta manualmente.
 *
 * No es un modelo de IA: es un contador de frases. Cada reporte aporta fragmentos de 2 a 4 palabras
 * del mensaje (sin el valor en pesos, sin el comercio ni cifras); cuando una misma frase aparece en
 * varios reportes distintos, se vuelve parte del filtro de publicidad. Es deliberadamente simple:
 * corre entero en el teléfono, no manda nada a ningún lado y es fácil de revisar o de borrar.
 *
 * Umbral: una frase hace falta verla en REPORT_THRESHOLD reportes *distintos* (no solo repetida dentro
 * del mismo mensaje) antes de usarse para filtrar, para no aprender algo de un solo mensaje ambiguo.
 */
export const REPORT_THRESHOLD = 2;
/** Una frase que ya viene de una app o banco no debería crecer sin límite. */
const MAX_LEARNED_PHRASES = 300;
const MIN_PHRASE_WORDS = 2;
const MAX_PHRASE_WORDS = 4;
const MIN_WORD_LENGTH = 3;

/** Palabras demasiado comunes o ya cubiertas por otros filtros: aprenderlas no aporta y ensucia la lista. */
const NOISE_WORDS = new Set([
  'con', 'para', 'por', 'una', 'unas', 'unos', 'del', 'las', 'los', 'que', 'tus', 'sus', 'tu', 'su', 'en', 'de',
  'la', 'el', 'un', 'y', 'o', 'a', 'al', 'es', 'ya', 'mas', 'muy', 'hoy', 'este', 'esta', 'estos', 'estas',
  'nuestro', 'nuestra', 'desde', 'hasta', 'sobre', 'entre', 'todo', 'toda', 'todos', 'todas', 'tienes', 'tener',
  'banco', 'tarjeta', 'tarj', 'cuenta', 'saldo', 'cupo', 'disponible', 'gracias', 'nequi', 'daviplata',
]);

/** Deja solo palabras (sin dígitos, sin $, sin puntuación) para no aprender montos, fechas ni tarjetas. */
function toWords(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-záéíóúñ]+/)
    .filter((word) => word.length >= MIN_WORD_LENGTH && !/^\d+$/.test(word));
}

/**
 * Frases candidatas de un mensaje: todas las combinaciones de 2 a 4 palabras seguidas, sin números ni
 * palabras sueltas del ruido de arriba. Deliberadamente no incluye el comercio ni el monto: esos ya se quitan
 * porque el texto se tokeniza por palabras (sin dígitos) y el nombre del comercio varía de un mensaje a otro,
 * así que no se repite entre reportes y nunca llega al umbral.
 */
export function extractCandidatePhrases(rawText: string): string[] {
  const words = toWords(rawText);
  const phrases = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let len = MIN_PHRASE_WORDS; len <= MAX_PHRASE_WORDS; len += 1) {
      const slice = words.slice(start, start + len);
      if (slice.length < len) break;
      if (slice.some((word) => NOISE_WORDS.has(word))) continue;
      phrases.add(slice.join(' '));
    }
  }
  return [...phrases];
}

export interface LearnedPhraseRow {
  phrase: string;
  reportCount: number;
}

/** Frases con suficientes reportes distintos como para usarse en el filtro. */
export function phrasesAboveThreshold(rows: LearnedPhraseRow[]): string[] {
  return rows.filter((row) => row.reportCount >= REPORT_THRESHOLD).map((row) => row.phrase);
}

/** ¿Ya hay espacio para aprender frases nuevas, o la lista llegó a su tope? */
export function hasRoomToLearn(totalPhrases: number): boolean {
  return totalPhrases < MAX_LEARNED_PHRASES;
}

function escapeForRegex(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construye el patrón que el parser suma a su filtro de publicidad, a partir de las frases ya aprendidas.
 * Cada frase se busca como palabras completas seguidas (con cualquier espacio en blanco entre ellas), sobre
 * el mismo texto sin tildes que usa el resto del parser. `null` si todavía no hay ninguna frase aprendida.
 */
export function buildLearnedPromoPattern(phrases: string[]): RegExp | null {
  if (phrases.length === 0) return null;
  const alternatives = phrases.map((phrase) => phrase.split(' ').map(escapeForRegex).join('\\s+'));
  return new RegExp(`\\b(${alternatives.join('|')})\\b`);
}
