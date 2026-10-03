import type { PaymentMethodType } from '@/types/models';

export const APP_NAME = 'Mi Plata';
export const APP_VERSION = __APP_VERSION__;
export const APP_AUTHOR = '@Jperez.Ortega';
export const DB_NAME = 'miplata';

/** Repositorio de GitHub donde `semantic-release` publica cada versión con su APK (ver README ▸ Actualizaciones). */
export const UPDATE_REPO = 'JhonathanPerez/Mi-Plata-App';
/** La búsqueda automática (al abrir la app y al volver a ella) no se repite antes de este tiempo: GitHub limita a 60 consultas por hora sin cuenta. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Tras «Cancelar», el aviso automático de esa versión no vuelve a salir hasta pasado este tiempo (Ajustes la sigue ofreciendo). */
export const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * Tiempo mínimo que se ve la pantalla de arranque (logo y spinner) al abrir la app.
 * Es lo que tarda el anillo del logo en dibujarse; la huella o el PIN se piden recién después.
 */
export const STARTUP_SPLASH_MS = 1_200;

/** Moneda de la app. Los montos se guardan como enteros en pesos. */
export const CURRENCY = 'COP';
/** 12 dígitos: 999.999.999.999 (dentro del rango seguro de enteros de JS). */
export const MAX_AMOUNT = 999_999_999_999;

export const NOTE_MAX_LENGTH = 200;
export const NAME_MAX_LENGTH = 30;

export const BACKUP_FORMAT = 'mi-plata-backup';
/** v2: estado pagado/por pagar de los gastos, reglas de ciclo de las tarjetas y fechas de extractos. */
export const BACKUP_VERSION = 2;

export const SETTING_KEYS = {
  theme: 'theme',
  lastPaymentMethodId: 'last_payment_method_id',
  seeded: 'seeded',
  biometricLock: 'biometric_lock',
  lockDelaySeconds: 'lock_delay_seconds',
  reminders: 'payment_reminders',
  reminderLeadDays: 'reminder_lead_days',
  reminderHour: 'reminder_hour',
  pendingReminders: 'pending_reminders',
  pendingReminderMinutes: 'pending_reminder_minutes',
  captureApps: 'capture_apps',
  hideAmounts: 'hide_amounts',
  swipeHintCount: 'swipe_hint_count',
  updateLastCheck: 'update_last_check',
  updateSkippedVersion: 'update_skipped_version',
  updateSkippedAt: 'update_skipped_at',
} as const;

export const CATEGORY_COLORS = [
  '#E4572E',
  '#F29E4C',
  '#E9C46A',
  '#8AB17D',
  '#2A9D8F',
  '#3D8FD1',
  '#5C6BC0',
  '#9B5DE5',
  '#D65DB1',
  '#E76F7A',
  '#7A6F66',
  '#4C5C68',
];

/** Los cinco tramos del anillo del logo, tomados de la paleta de categorías. */
export const LOGO_RING_COLORS = [
  CATEGORY_COLORS[0],
  CATEGORY_COLORS[7],
  CATEGORY_COLORS[4],
  CATEGORY_COLORS[5],
  CATEGORY_COLORS[11],
];

export const CATEGORY_ICONS = [
  '🍔', '🛒', '☕', '🍽️', '🍺', '🚌', '🚗', '⛽', '🏠', '💡',
  '🔧', '🧹', '🎬', '🎮', '🎵', '🛍️', '👕', '💇', '🧴', '💊',
  '🏥', '🏋️', '🎓', '📚', '✈️', '🏖️', '🔁', '📱', '🧾', '🎁',
  '🐾', '👶', '💼', '🌱', '🏦', '📦',
];

export const PAYMENT_ICONS = ['💵', '💳', '🏦', '📱', '💰', '🧾'];

export const PAYMENT_TYPE_LABELS: Record<PaymentMethodType, string> = {
  cash: 'Efectivo',
  debit_card: 'Tarjeta débito',
  credit_card: 'Tarjeta de crédito',
  other: 'Otro',
};

export const PAYMENT_TYPES: PaymentMethodType[] = ['cash', 'debit_card', 'credit_card', 'other'];

/** Interruptor de «Categorías» y «Métodos de pago»: el mismo texto en las dos hojas de edición. */
export const VISIBLE_TOGGLE_LABEL = 'Aparece al registrar un gasto';
export const VISIBLE_TOGGLE_HINT = 'Si lo apagas, no sale en la lista al registrar un gasto, pero sus gastos siguen en tu historial.';

export const DEFAULT_CATEGORY_ICON = '📦';
export const DEFAULT_PAYMENT_ICON = '💳';
