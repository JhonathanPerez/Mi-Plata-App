import { BANK_KEYWORDS, CAPTURE_SOURCES, type BankKey } from '@/config/capture';
import { MAX_AMOUNT } from '@/config/constants';
import { parseLooseAmount } from '@/lib/money';
import { normalizeText } from '@/lib/text';

/**
 * Extrae valor, comercio y tarjeta del texto de una notificación o SMS de un banco.
 *
 * Es una función pura (sin base de datos ni Capacitor) para poder probarla con mensajes reales.
 * Los bancos redactan distinto y cambian el texto sin avisar, así que el parser es tolerante:
 *   - El VALOR es lo único obligatorio (un monto en pesos, ignorando saldos y cupos).
 *   - El COMERCIO es opcional: si no se reconoce queda vacío y lo completas al categorizar.
 * Si un mensaje real no se detecta, agrégalo como caso en `parseNotification.test.ts` y ajusta las listas.
 */

export interface CaptureInput {
  /** Paquete Android de la app que mostró la notificación ('manual' si se pegó el texto). */
  pkg: string;
  title: string;
  text: string;
}

export interface ParsedCapture {
  /** Pesos enteros. */
  amount: number;
  merchant: string | null;
  bank: BankKey | null;
  /** Últimos 4 dígitos de la tarjeta, si el mensaje los trae. */
  last4: string | null;
}

export type ParseFailure = 'no-amount' | 'ignored' | 'income' | 'not-expense';
export type ParseResult = { ok: true; value: ParsedCapture } | { ok: false; reason: ParseFailure };

/** Por debajo de esto casi seguro es un valor mal leído (por ejemplo, un precio en dólares). */
export const MIN_CAPTURE_AMOUNT = 100;
const MAX_MERCHANT_LENGTH = 60;
const MAX_MERCHANT_WORDS = 6;

const FAILURE_MESSAGES: Record<ParseFailure, string> = {
  'no-amount': 'No encontré un valor en pesos en ese mensaje.',
  ignored: 'Parece un aviso (código, oferta, recordatorio o compra rechazada), no un gasto.',
  income: 'Parece un ingreso o un pago recibido, no un gasto.',
  'not-expense': 'No parece una compra, un pago ni un retiro.',
};

export function describeFailure(reason: ParseFailure): string {
  return FAILURE_MESSAGES[reason];
}

// ---------- Clasificación por palabras (sobre texto sin tildes y en minúsculas) ----------

/**
 * Códigos de un solo uso ("tu código es 123456", "clave dinámica…").
 * Ojo: NO basta con la palabra "clave" o "no compartas": muchos SMS de compras legítimas terminan con
 * "nunca compartas tu clave". Por eso se exige el patrón "… es 123456" o un nombre típico de OTP.
 */
const SECURITY =
  /\b(codigo|clave|token|otp)\b.{0,80}\b(es|sera)\s*:?\s*\d{4,8}\b|\b(clave dinamica|clave temporal|codigo de seguridad|codigo de verificacion|codigo unico|otp)\b/;
/** Publicidad. */
const PROMO = /\b(oferta|promocion|promo|preaprobad[oa]|aprovecha|solicita|te prestamos|obten|sorteo|participa)\b/;
/** Recordatorios de pago (todavía no es un gasto). */
const REMINDER =
  /\b(vence|vencimiento|fecha limite|extracto|factura disponible|recordatorio|recuerda|pago minimo|paga antes|estas al dia)\b/;
/** Operaciones que no se concretaron. */
const REJECTED =
  /\b(rechazad[oa]|declinad[oa]|no aprobad[oa]|fallid[oa]|cancelad[oa]|anulad[oa]|no pudimos|no se pudo)\b/;
/** Dinero que entra, devoluciones y pagos a tu propia tarjeta (no son un gasto nuevo). */
const INCOME =
  /\b(recibiste|recibido|recibida|te enviaron|te transfirieron|te consignaron|te pagaron|te depositaron|abono|abonaste|abonaron|deposito|depositaron|consignacion|ingreso|reembolso|devolucion|reversion|reverso|rendimientos?|cashback|pago de tu tarjeta|pago a tu tarjeta|pagaste tu tarjeta|pagaste tu factura)\b/;
/** Palabras que describen que se gastó dinero. */
const SPEND =
  /\b(compra|compras|compraste|pagaste|pago|pagos|retiro|retiraste|transferiste|enviaste|envio|consumo|cargo|debito|debitaron|debitamos|transaccion|avance|cobro|suscripcion|renovacion|pse)\b/;
const TRANSFER_LIKE = /\b(transferiste|enviaste|envio|pagaste|transferencia|giro)\b/;

// ---------- Valor ----------

const AMOUNT_RE =
  /(?:\$|\bcop\s?)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+)\s?(?:cop\b|pesos\b)/gi;
/** Lo que aparece justo antes de un monto que NO es el gasto (saldo, cupo, pago mínimo…). */
const NOT_THE_SPEND_BEFORE =
  /(saldo|cupo|disponible|limite|minimo|acumulad[oa]|puntos|total a pagar|deuda)\D{0,25}$/;
/** Símbolos de otra moneda pegados al $ (US$, R$, €…). */
const FOREIGN_BEFORE = /(\bus|\busd|\beur|\bmxn|\bbrl|\bcad|\bgbp|€|£|\br)\s?$/;
/** "9.99" o "45,50": un precio con centavos, típico de dólares y no de pesos. */
const CENTS_FORMAT = /^\d{1,3}[.,]\d{2}$/;

interface AmountMatch {
  amount: number;
  /** El texto numérico tal como apareció ("25.000"), para ubicarlo entre las palabras. */
  numeric: string;
}

/** Valida un número ya extraído: sin centavos, entero y dentro del rango razonable de un gasto en pesos. */
function toValidAmount(numeric: string): number | null {
  if (CENTS_FORMAT.test(numeric)) return null;
  const amount = parseLooseAmount(numeric);
  if (amount === null || !Number.isInteger(amount)) return null;
  if (amount < MIN_CAPTURE_AMOUNT || amount > MAX_AMOUNT) return null;
  return amount;
}

/** Valor marcado como dinero: "$25.000", "COP 25.000" o "25.000 pesos". */
function findMarkedAmount(text: string): AmountMatch | null {
  for (const match of text.matchAll(AMOUNT_RE)) {
    const numeric = match[1] ?? match[2];
    if (!numeric || match.index === undefined) continue;

    const before = normalizeText(text.slice(Math.max(0, match.index - 30), match.index));
    if (NOT_THE_SPEND_BEFORE.test(before)) continue;
    if (FOREIGN_BEFORE.test(before.slice(-6))) continue;

    const amount = toValidAmount(numeric);
    if (amount === null) continue;
    return { amount, numeric };
  }
  return null;
}

/** Cualquier número (con separadores de miles o sin ellos), para los mensajes que no traen "$". */
const BARE_NUMBER_RE = /\d[\d.,]*/g;
/** "25.000", "1.250.000", "1,250,000" (opcionalmente con decimales): claramente un valor y no un código. */
const FORMATTED_NUMBER = /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/;
/** "25000": solo cuenta como valor si una palabra de gasto lo precede (evita códigos, teléfonos, referencias). */
const PLAIN_NUMBER = /^\d{3,}$/;
const SPEND_CUE_BEFORE =
  /\b(por|valor|vlr|monto|total|compra|compraste|pagaste|pago|retiro|retiraste|transferiste|enviaste|consumo|cargo|debito|debitaron|cobro)(\s+de)?\s*:?\s*$/;
/** Lo que aparece justo después de un número que NO son pesos ("1.500 puntos", "3.000 usd"). */
const NOT_PESOS_AFTER = /^\s?(puntos|pts|cuotas|meses|dias|usd|eur|euros|dolar|dolares|km|%)/;

/**
 * Plan B cuando el mensaje no trae "$", "COP" ni "pesos" ("Compra por 25.000 en TIENDA"). Es más estricto que el
 * valor marcado: descarta fechas, horas, tarjetas y códigos, y no repite números que ya venían con un símbolo de
 * moneda (esos ya se evaluaron y se rechazaron a propósito: saldos, dólares…).
 */
function findBareAmount(text: string): AmountMatch | null {
  for (const match of text.matchAll(BARE_NUMBER_RE)) {
    if (match.index === undefined) continue;
    // Se quita la puntuación final ("… por 25.000.") para quedarse solo con el número.
    const numeric = match[0].replace(/[.,]+$/, '');
    const start = match.index;
    const end = start + numeric.length;

    // Pegado a letras, "*", "#", "/" o ":" → parte de una referencia, tarjeta, fecha u hora.
    if (/[\w*#/:]/.test(text[start - 1] ?? '')) continue;
    // Seguido de "/" o ":" (fecha, hora) o de "-dígito" (rango, fecha).
    const next = text[end] ?? '';
    if (next === '/' || next === ':' || (next === '-' && /\d/.test(text[end + 1] ?? ''))) continue;

    const before = normalizeText(text.slice(Math.max(0, start - 30), start));
    if (/[$€£]\s?$/.test(before) || /\bcop\s?$/.test(before)) continue;
    if (NOT_THE_SPEND_BEFORE.test(before)) continue;
    if (FOREIGN_BEFORE.test(before.slice(-6))) continue;
    if (NOT_PESOS_AFTER.test(normalizeText(text.slice(end, end + 14)))) continue;

    const formatted = FORMATTED_NUMBER.test(numeric);
    if (!formatted && !(PLAIN_NUMBER.test(numeric) && SPEND_CUE_BEFORE.test(before))) continue;

    const amount = toValidAmount(numeric);
    if (amount === null) continue;
    return { amount, numeric };
  }
  return null;
}

function findAmount(text: string): AmountMatch | null {
  return findMarkedAmount(text) ?? findBareAmount(text);
}

// ---------- Comercio ----------

/** Palabras que cierran el nombre del comercio ("… en RAPPI con tu tarjeta …"). */
const STOP_WORDS = new Set([
  'con', 'usando', 'desde', 'por', 'hoy', 'ayer', 'tarjeta', 'tarj', 'tc', 'td', 'terminada', 'terminado',
  'cuotas', 'cuota', 'aprobada', 'aprobado', 'exitosa', 'exitoso', 'fue', 'ha', 'sido', 'saldo', 'cupo',
  'disponible', 'inquietudes', 'llama', 'llame', 'gracias', 'ref', 'referencia', 'autorizacion', 'aut', 'recibo',
]);
const BOUNDARY_TOKEN = /^[.\-–—|:;,]+$/;
const CARD_MASK = /^\*+\d/;
const DATE_TOKEN = /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?[.,;]?$/;
const TIME_TOKEN = /^\d{1,2}:\d{2}/;
const T_CARD = /^t\.(cre|deb)/;
const DAY_WORDS = /^(\d{1,2}([/-]|$)|dia|lunes|martes|miercoles|jueves|viernes|sabado|domingo)/;

/** Tras "en": estas palabras indican que NO viene un comercio ("en tu tarjeta", "en 3 cuotas"…). */
const EN_NOT_MERCHANT = new Set([
  'tu', 'su', 'tus', 'sus', 'cuotas', 'cuota', 'efectivo', 'total', 'linea', 'pesos', 'dolares', 'cop', 'usd',
  'proceso', 'curso', 'resumen', 'nu', 'cajero',
]);
const ARTICLES = new Set(['la', 'el', 'un', 'una', 'este', 'esta', 'los', 'las']);
const EN_ARTICLE_NOT_MERCHANT = new Set([
  'app', 'aplicacion', 'cuenta', 'tarjeta', 'cajero', 'exterior', 'fecha', 'hora', 'resumen', 'cupo', 'dia',
  'mes', 'semana', 'tiempo', 'cuotas', 'plazo',
]);
const A_NOT_MERCHANT = new Set([
  'las', 'la', 'tu', 'su', 'el', 'un', 'una', 'traves', 'partir', 'nombre', 'cuenta', 'favor', 'tiempo',
]);
const LABELS = new Set(['comercio', 'establecimiento', 'negocio', 'lugar']);
/** Prefijos de pasarelas de pago que preceden al nombre real ("PAYU *UBER"). */
const PROCESSOR_PREFIX = /^(payu|merpago|mercadopago|mp|pp|sq|tst|dlocal|dlo|epayco|wompi|bold|zonapagos)\s?\*\s?/i;

const wordKey = (raw: string): string => normalizeText(raw).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

function isMerchantAfterEn(keys: string[], index: number): boolean {
  const next = keys[index + 1];
  if (!next) return false;
  if (EN_NOT_MERCHANT.has(next) || /^\d+$/.test(next)) return false;
  if (ARTICLES.has(next)) {
    const following = keys[index + 2];
    if (following && EN_ARTICLE_NOT_MERCHANT.has(following)) return false;
  }
  return true;
}

function findMerchantStart(tokens: string[], keys: string[], amountIndex: number, transferLike: boolean): number | null {
  // 1) "Comercio: X"
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (LABELS.has(keys[i])) {
      let start = i + 1;
      while (start < tokens.length && BOUNDARY_TOKEN.test(tokens[start])) start += 1;
      if (start < tokens.length) return start;
    }
  }
  // 2) "… en X"
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (keys[i] === 'en' && isMerchantAfterEn(keys, i)) return i + 1;
  }
  // 3) "Pagaste $X a Juan Pérez" (solo en pagos y transferencias, después del valor)
  if (transferLike) {
    for (let i = Math.max(0, amountIndex + 1); i < tokens.length - 1; i += 1) {
      if ((keys[i] === 'a' || keys[i] === 'para') && !A_NOT_MERCHANT.has(keys[i + 1])) return i + 1;
    }
  }
  return null;
}

function collectMerchant(tokens: string[], keys: string[], start: number): string {
  const words: string[] = [];
  for (let i = start; i < tokens.length && words.length < MAX_MERCHANT_WORDS; i += 1) {
    const raw = tokens[i];
    const key = keys[i];
    if (BOUNDARY_TOKEN.test(raw)) break;
    if (CARD_MASK.test(raw) || DATE_TOKEN.test(raw) || TIME_TOKEN.test(raw) || raw.startsWith('$')) break;
    if (STOP_WORDS.has(key) || T_CARD.test(key)) break;
    if (key === 'en' && words.length > 0) break;
    if (key === 'el' && words.length > 0 && DAY_WORDS.test(keys[i + 1] ?? '')) break;
    if (key === 'a' && words.length > 0 && keys[i + 1] === 'las') break;
    words.push(raw);
    // Un punto o coma al final del nombre cierra la frase.
    if (/[.,;:]$/.test(raw)) break;
  }
  return words.join(' ');
}

function toDisplayCase(text: string): string {
  const hasLowercase = /[a-záéíóúñü]/.test(text);
  if (!hasLowercase) {
    return text.toLowerCase().replace(/(^|[\s*/-])([a-záéíóúñü])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanMerchant(value: string): string | null {
  let text = value.replace(/^[\s.,;:!\-–—*"'()]+|[\s.,;:!\-–—*"'()]+$/g, '');
  text = text.replace(PROCESSOR_PREFIX, '').replace(/\s{2,}/g, ' ').trim();
  if (text.length < 2 || /^[\d\s.,*-]+$/.test(text)) return null;
  if (text.length > MAX_MERCHANT_LENGTH) text = text.slice(0, MAX_MERCHANT_LENGTH).trim();
  return toDisplayCase(text);
}

function extractMerchant(original: string, numeric: string, transferLike: boolean): string | null {
  const tokens = original.split(' ');
  const keys = tokens.map(wordKey);
  const amountIndex = tokens.findIndex((token) => token.includes(numeric));
  const start = findMerchantStart(tokens, keys, amountIndex, transferLike);
  if (start === null) return null;
  return cleanMerchant(collectMerchant(tokens, keys, start));
}

// ---------- Tarjeta y banco ----------

function extractLast4(original: string): string | null {
  const patterns = [
    /\*+\s?(\d{4})\b/,
    /terminad[ao]\s+en\s+(\d{4})\b/i,
    /(?:tarjeta|tarj\.?|t\.\s?(?:cre|deb)\.?|\btc\b|\btd\b)\D{0,12}?(\d{4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = original.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function detectBank(pkg: string, titleFold: string, textFold: string): BankKey | null {
  const fromApp = CAPTURE_SOURCES.find((source) => source.pkg === pkg)?.bank;
  if (fromApp) return fromApp;
  // El remitente (título) manda: un SMS de Bancolombia puede mencionar "Nequi" como destino.
  for (const haystack of [titleFold, textFold]) {
    for (const { bank, pattern } of BANK_KEYWORDS) {
      if (pattern.test(haystack)) return bank;
    }
  }
  return null;
}

// ---------- API ----------

/** Une título y cuerpo con un punto (sirve de límite al buscar el comercio) y normaliza espacios. */
function prepare(input: CaptureInput): string {
  const parts = [input.title, input.text]
    .map((part) => (part ?? '').normalize('NFC').trim())
    .filter((part) => part.length > 0);
  return parts
    .join(' . ')
    .replace(/\s*[\r\n]+\s*/g, ' . ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim();
}

export function parseCapture(input: CaptureInput, learnedPromo?: RegExp | null): ParseResult {
  const original = prepare(input);
  const fold = normalizeText(original);

  // Los avisos (códigos, publicidad, recordatorios, rechazos) se descartan primero: así el motivo que se
  // le explica al usuario es el correcto aunque el aviso también traiga un monto.
  // `learnedPromo`: frases que el usuario ha reportado como publicidad varias veces (ver `lib/spamLearning.ts`).
  if (
    SECURITY.test(fold) ||
    PROMO.test(fold) ||
    REMINDER.test(fold) ||
    REJECTED.test(fold) ||
    learnedPromo?.test(fold)
  ) {
    return { ok: false, reason: 'ignored' };
  }

  const found = findAmount(original);
  if (!found) return { ok: false, reason: 'no-amount' };

  if (INCOME.test(fold)) return { ok: false, reason: 'income' };
  if (!SPEND.test(fold)) return { ok: false, reason: 'not-expense' };

  const titleFold = normalizeText(input.title ?? '');
  return {
    ok: true,
    value: {
      amount: found.amount,
      merchant: extractMerchant(original, found.numeric, TRANSFER_LIKE.test(fold)),
      bank: detectBank(input.pkg, titleFold, fold),
      last4: extractLast4(original),
    },
  };
}

/** Texto que se guarda para que puedas verificar qué dijo el banco. */
export function displayText(input: Pick<CaptureInput, 'title' | 'text'>): string {
  return [input.title, input.text]
    .map((part) => (part ?? '').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(' — ');
}

/**
 * Huella del CUERPO del mensaje (FNV-1a de 32 bits sobre el texto sin tildes ni espacios repetidos).
 * Sirve para no crear dos pendientes con el mismo aviso; no incluye el título para que un mensaje
 * pegado a mano coincida con el mismo mensaje capturado de la notificación.
 */
export function fingerprintOf(text: string): string {
  const base = normalizeText(text).replace(/\s+/g, ' ');
  let hash = 0x811c9dc5;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${base.length}`;
}
