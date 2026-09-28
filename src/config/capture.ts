/**
 * Configuración de la captura automática de gastos (notificaciones y SMS).
 *
 * `CAPTURE_SOURCES` es la lista curada que trae la app (para reconocer el banco de un aviso). Cuáles apps
 * se vigilan de verdad lo elige cada quien en Configuración ▸ Captura automática ▸ Elegir apps
 * (ver `captureAppsService.ts`); esa elección, no esta lista, es lo que viaja al lector nativo.
 */

export type BankKey = 'nubank' | 'davivienda' | 'bancolombia' | 'nequi' | 'bbva' | 'rappi';

export interface CaptureSource {
  /** Paquete de Android de la app cuyas notificaciones se leen. */
  pkg: string;
  label: string;
  /** Banco que se asume para lo que llegue de esta app (null = se deduce del texto). */
  bank: BankKey | null;
  kind: 'bank-app' | 'sms-app';
}

/** Una app que el usuario eligió vigilar (paquete + nombre a mostrar). */
export interface CaptureAppChoice {
  pkg: string;
  label: string;
}

export const CAPTURE_SOURCES: CaptureSource[] = [
  // Nu: una sola app para Brasil, México y Colombia.
  { pkg: 'com.nu.production', label: 'Nu (Nubank)', bank: 'nubank', kind: 'bank-app' },
  // Apps de SMS más comunes. Los mensajes del banco llegan como notificación de la app de mensajes.
  { pkg: 'com.google.android.apps.messaging', label: 'Mensajes de Google', bank: null, kind: 'sms-app' },
  { pkg: 'com.samsung.android.messaging', label: 'Mensajes de Samsung', bank: null, kind: 'sms-app' },
  { pkg: 'com.android.mms', label: 'Mensajes (Android)', bank: null, kind: 'sms-app' },
];

/** Selección recomendada la primera vez que se abre la app (antes de que el usuario elija la suya). */
export const DEFAULT_CAPTURE_APPS: CaptureAppChoice[] = CAPTURE_SOURCES.map(({ pkg, label }) => ({ pkg, label }));

/** Nombres de apps elegidas por el usuario que no están en `CAPTURE_SOURCES` (la registra `captureAppsService`). */
let customSourceLabels: Record<string, string> = {};

/** Actualiza el registro de nombres para apps elegidas a mano, así `describeSource` las reconoce. */
export function setCustomSourceLabels(apps: CaptureAppChoice[]): void {
  customSourceLabels = Object.fromEntries(apps.map((app) => [app.pkg, app.label]));
}

/** Nombres con los que un banco puede aparecer en tus métodos de pago (sin tildes, en minúsculas). */
export const BANK_ALIASES: Record<BankKey, string[]> = {
  nubank: ['nubank', 'nu'],
  davivienda: ['davivienda', 'davibank', 'daviplata'],
  bancolombia: ['bancolombia'],
  nequi: ['nequi'],
  bbva: ['bbva'],
  rappi: ['rappicard', 'rappi'],
};

/** Palabras del texto que delatan al banco (ya sin tildes y en minúsculas). */
export const BANK_KEYWORDS: Array<{ bank: BankKey; pattern: RegExp }> = [
  { bank: 'nubank', pattern: /\bnubank\b/ },
  { bank: 'davivienda', pattern: /\b(davivienda|davibank|daviplata)\b/ },
  { bank: 'bancolombia', pattern: /\bbancolombia\b/ },
  { bank: 'nequi', pattern: /\bnequi\b/ },
  { bank: 'bbva', pattern: /\bbbva\b/ },
  { bank: 'rappi', pattern: /\b(rappicard|rappipay)\b/ },
];

export const MANUAL_SOURCE = 'manual';

/** Nombre legible de un origen (paquete o 'manual'). */
export function describeSource(source: string): string {
  if (source === MANUAL_SOURCE) return 'Pegado a mano';
  return CAPTURE_SOURCES.find((item) => item.pkg === source)?.label ?? customSourceLabels[source] ?? 'Notificación';
}

/**
 * Una notificación cuya hora es mucho más vieja que el momento en que se capturó es un mensaje antiguo
 * que la app de SMS volvió a mostrar (historial de la conversación), no una compra nueva.
 */
export const CAPTURE_MAX_LAG_MS = 6 * 60 * 60 * 1000;
/** Misma notificación publicada de nuevo (actualización) dentro de esta ventana = duplicado. */
export const CAPTURE_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
/** Al pegar un mensaje a mano, si ya se vio el mismo texto en este lapso se avisa en vez de duplicar. */
export const CAPTURE_MANUAL_DEDUPE_MS = 24 * 60 * 60 * 1000;
/** Cuánto tiempo se conserva la huella de un pendiente ya resuelto (evita re-detectar el mismo aviso). */
export const CAPTURE_KEEP_RESOLVED_DAYS = 60;
