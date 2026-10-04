import { formatCOP } from './money';

/**
 * Texto del aviso de "nuevo gasto detectado" (sin lógica de Capacitor, para poder probarlo).
 * El lado nativo (`CaptureListenerService.java`) muestra el mismo texto apenas llega el mensaje; si cambias
 * el título o el cuerpo aquí, cámbialos también allí (`DETECTED_TITLE` y `detectedBody`).
 */
export const CAPTURE_NOTIFICATION_TITLE = 'Nuevo gasto detectado 💵';

/**
 * "Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo."
 * Si no se pudo reconocer el comercio, solo el valor: "Nueva compra por $25.000. Abre Mi Plata para categorizarlo."
 */
export function captureNotificationBody(amount: number, merchant?: string | null): string {
  const where = merchant?.trim() ? ` en ${merchant.trim()}` : '';
  return `Nueva compra por ${formatCOP(amount)}${where}. Abre Mi Plata para categorizarlo.`;
}
