import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Vibración sutil en momentos clave (guardar, desbloquear, descartar…). Solo en la app instalada;
 * en el navegador y en teléfonos sin vibrador no hace nada y nunca lanza errores.
 */
async function run(action: () => Promise<void>): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await action();
  } catch {
    // Sin vibrador o con la vibración desactivada en el sistema: no importa.
  }
}

export const haptics = {
  /** Toque ligero: cambiar de pestaña, elegir una opción, cruzar el umbral de un gesto. */
  tap: (): Promise<void> => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Confirmación: gasto guardado, app desbloqueada. */
  success: (): Promise<void> => run(() => Haptics.notification({ type: NotificationType.Success })),
  /** Advertencia: descartar o borrar. */
  warning: (): Promise<void> => run(() => Haptics.notification({ type: NotificationType.Warning })),
};
