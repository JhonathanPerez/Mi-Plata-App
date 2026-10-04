import { formatCOP } from "./money";

/**
 * Textos de los avisos de captura automática (sin lógica de Capacitor, para poder probarlos).
 * El lado nativo muestra los mismos textos con la app cerrada (`CaptureListenerService.java` el aviso al instante y
 * `PendingReminderReceiver.java` el recordatorio de pendientes); si cambias un título o un cuerpo aquí, cámbialo también allí.
 */

/** Gemelo en Java: `DETECTED_TITLE` (el emoji de dólar, U+1F4B2, va allí como escape). */
export const CAPTURE_NOTIFICATION_TITLE = "Nuevo gasto detectado 💸";

/**
 * "Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo."
 * Si no se pudo reconocer el comercio, solo el valor: "Nueva compra por $25.000. Abre Mi Plata para categorizarlo."
 */
export function captureNotificationBody(
  amount: number,
  merchant?: string | null,
): string {
  const where = merchant?.trim() ? ` en ${merchant.trim()}` : "";
  return `Nueva compra por ${formatCOP(amount)}${where}. Abre Mi Plata para categorizarlo.`;
}

/** Gemelo en Java: `REMINDER_TITLE`. */
export const PENDING_REMINDER_TITLE = "Gastos por categorizar";

/**
 * Cuerpo del recordatorio de gastos pendientes. Gemelo en Java: `reminderBody`.
 *  - una sola compra: "Tienes una compra por $25.000 pendiente por categorizar."
 *  - varias:          "Tienes 3 compras pendientes por categorizar."
 * Si es una sola y no se conoce su valor, no se inventa una cifra: "Tienes una compra pendiente por categorizar."
 */
export function pendingReminderBody(
  count: number,
  singleAmount?: number | null,
): string {
  if (count === 1) {
    return singleAmount && singleAmount > 0
      ? `Tienes una compra por ${formatCOP(singleAmount)} pendiente por categorizar.`
      : "Tienes una compra pendiente por categorizar.";
  }
  return `Tienes ${count} compras pendientes por categorizar.`;
}
