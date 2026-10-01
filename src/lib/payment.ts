import { PAYMENT_TYPE_LABELS } from '@/config/constants';
import type { PaymentMethodType } from '@/types/models';

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
 * Con tarjeta de crédito explica cuándo deja de estar por pagar; con otros métodos, qué significa el estado elegido.
 */
export function statusHint(paid: boolean, type: PaymentMethodType | null): string {
  if (type === 'credit_card') return paid ? 'Ya pagado: no sale en «Pagar tarjeta»' : 'Por pagar hasta que pagues el extracto';
  return paid ? 'Pagado. Cámbialo si fue fiado' : 'Pendiente hasta que lo marques pagado';
}
