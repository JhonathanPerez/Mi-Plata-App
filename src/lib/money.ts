import { MAX_AMOUNT } from '@/config/constants';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1250000 -> "$1.250.000". Sin decimales, sin símbolo de moneda extranjero. */
export function formatCOP(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${groupThousands(Math.abs(rounded).toString())}`;
}

/** Lo que se muestra en lugar de un monto cuando el modo privacidad está activo. */
export const HIDDEN_AMOUNT = '$ ••••••';
/** Igual, para espacios reducidos (centro de la dona). */
export const HIDDEN_AMOUNT_COMPACT = '$ •••';

/** Versión corta para espacios reducidos: $350 mil, $1,3 M. */
export function formatCOPCompact(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (abs >= 999_500) {
    const millions = abs / 1_000_000;
    const text =
      millions >= 100
        ? Math.round(millions).toString()
        : (Math.round(millions * 10) / 10).toString().replace('.', ',');
    return `${sign}$${text} M`;
  }
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)} mil`;
  return `${sign}$${abs}`;
}

/** Texto libre escrito por el usuario -> entero. Solo se conservan los dígitos. */
export function parseAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  if (!digits) return 0;
  return Math.min(Number(digits.slice(0, 12)), MAX_AMOUNT);
}

/** Valor mostrado dentro de un campo de entrada: 35000 -> "35.000" (vacío si es 0). */
export function formatAmountInput(value: number): string {
  return value > 0 ? groupThousands(String(Math.trunc(value))) : '';
}

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT;
}

export function percentOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/**
 * Porcentaje entero que no miente en los extremos: lo que existe pero redondea a 0 se escribe «<1%» y lo que
 * redondea a 100 sin llegar se escribe «>99%». Solo el 0 y el 100 exactos se muestran como «0%» y «100%».
 */
export function formatPercent(value: number): string {
  if (value > 0 && value < 1) return '<1%';
  if (value > 99 && value < 100) return '>99%';
  return `${Math.round(value)}%`;
}

/**
 * Interpreta valores que vienen de archivos externos (Excel): números, "35000", "$35.000", "35.000,50".
 * Devuelve pesos enteros o null si no es interpretable.
 */
export function parseLooseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;

  let text = raw.replace(/[^\d.,-]/g, '');
  if (!text) return null;

  const negative = text.startsWith('-');
  text = text.replace(/-/g, '');

  // Parte decimal (1 o 2 dígitos tras el último separador): se descarta porque COP se guarda entero.
  const decimals = text.match(/[.,](\d{1,2})$/);
  if (decimals) text = text.slice(0, text.length - decimals[0].length);

  const digits = text.replace(/[.,]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return negative ? -value : value;
}
