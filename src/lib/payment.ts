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
