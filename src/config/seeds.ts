import type { CycleRules } from '@/lib/cycles';
import type { PaymentMethodType } from '@/types/models';

export interface CategorySeed {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface PaymentMethodSeed {
  id: string;
  name: string;
  type: PaymentMethodType;
  icon: string;
  color: string;
  /** Reglas de corte y pago (solo tarjetas de crédito). */
  cycle?: CycleRules;
}

/** Nubank: corte el último día de cada mes; pago el día 20 del mes siguiente. */
export const NUBANK_CYCLE: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };
/** Davibank: corte el segundo viernes de cada mes; pago máximo el segundo martes del mes siguiente. */
export const DAVIBANK_CYCLE: CycleRules = {
  cut: { kind: 'nth', nth: 2, weekday: 5 },
  due: { kind: 'nth', nth: 2, weekday: 2 },
  dueNextMonth: true,
  weekend: 'keep',
};

/**
 * Categorías iniciales. Para agregar una por defecto basta con añadir una línea aquí
 * (solo se siembran en la primera ejecución; el usuario puede crear más desde la app).
 */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { id: 'cat_alimentacion', name: 'Alimentación', icon: '🍔', color: '#E4572E' },
  { id: 'cat_transporte', name: 'Transporte', icon: '🚌', color: '#3D8FD1' },
  { id: 'cat_vivienda', name: 'Vivienda', icon: '🏠', color: '#7A6F66' },
  { id: 'cat_servicios', name: 'Servicios', icon: '💡', color: '#E9C46A' },
  { id: 'cat_entretenimiento', name: 'Entretenimiento', icon: '🎬', color: '#9B5DE5' },
  { id: 'cat_compras', name: 'Compras', icon: '🛍️', color: '#D65DB1' },
  { id: 'cat_salud', name: 'Salud', icon: '💊', color: '#2A9D8F' },
  { id: 'cat_educacion', name: 'Educación', icon: '🎓', color: '#5C6BC0' },
  { id: 'cat_viajes', name: 'Viajes', icon: '✈️', color: '#F29E4C' },
  { id: 'cat_suscripciones', name: 'Suscripciones', icon: '🔁', color: '#8AB17D' },
  { id: 'cat_deudas', name: 'Deudas', icon: '🧾', color: '#E76F7A' },
  { id: 'cat_otros', name: 'Otros', icon: '📦', color: '#4C5C68' },
];

/** Métodos de pago iniciales. Para una tarjeta nueva por defecto, añade una línea. */
export const DEFAULT_PAYMENT_METHODS: PaymentMethodSeed[] = [
  { id: 'pm_efectivo', name: 'Efectivo', type: 'cash', icon: '💵', color: '#2A9D8F' },
  { id: 'pm_davibank', name: 'Davibank', type: 'credit_card', icon: '💳', color: '#E4572E', cycle: DAVIBANK_CYCLE },
  { id: 'pm_nubank', name: 'Nubank', type: 'credit_card', icon: '💳', color: '#9B5DE5', cycle: NUBANK_CYCLE },
  { id: 'pm_rappicard', name: 'RappiCard', type: 'credit_card', icon: '💳', color: '#F29E4C' },
  { id: 'pm_transferencia', name: 'Transferencia', type: 'other', icon: '🏦', color: '#3D8FD1' },
];
