import { PAYMENT_TYPE_LABELS } from '@/config/constants';
import type { PaymentMethodType } from '@/types/models';
import { normalizeText } from './text';

/**
 * "Tarjeta de crédito · •••• 1234" (sin los últimos 4 dígitos si no se guardaron).
 * Los puntos y los dígitos van unidos con un espacio duro para que nunca queden en líneas distintas.
 */
export function describePaymentMethod(type: PaymentMethodType, last4: string | null): string {
  const label = PAYMENT_TYPE_LABELS[type];
  return last4 ? `${label} · ••••\u00a0${last4}` : label;
}

/**
 * Pista de una línea bajo el selector de estado del gasto (máx. 70 caracteres; a 360 dp caben unos 35 sin saltar de renglón).
 * Con tarjeta de crédito el gasto sale de «Por pagar» al pagar el extracto; con cualquier otro método, al marcarlo como pagado.
 */
export function statusHint(paid: boolean, type: PaymentMethodType | null): string {
  if (type === 'credit_card') return paid ? 'Ya pagado: no sale en «Pagar tarjeta»' : 'Por pagar hasta que pagues el extracto';
  return paid ? 'Pagado. Cámbialo si fue fiado' : 'Por pagar hasta que lo marques como pagado';
}

/**
 * Tipo que se lee bajo el nombre en «Métodos de pago». Se omite cuando no aporta nada:
 * si el nombre ya lo dice («Efectivo · Efectivo») o si el tipo es «Otro».
 */
export function methodKindLabel(name: string, type: PaymentMethodType): string | null {
  if (type === 'other') return null;
  const label = PAYMENT_TYPE_LABELS[type];
  return normalizeText(name) === normalizeText(label) ? null : label;
}
