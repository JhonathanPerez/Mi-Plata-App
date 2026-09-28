import { captureBridge } from '@/lib/notificationCapture';
import { captureAppsService } from './captureAppsService';
import { captureService, type IngestSummary } from './captureService';

let running: Promise<IngestSummary> | null = null;
let configured = false;

const NOTHING: IngestSummary = { added: 0, skipped: 0 };

/**
 * Recoge lo que capturó el teléfono desde la última vez y lo convierte en pendientes.
 * Nunca lanza errores: si algo falla, la app sigue funcionando y se reintenta en la próxima apertura.
 * Si ya hay una sincronización en curso, se comparte su resultado (evita trabajo doble).
 */
export function syncCapturedNotifications(): Promise<IngestSummary> {
  if (!captureBridge.isSupported()) return Promise.resolve(NOTHING);
  if (running) return running;

  running = (async () => {
    try {
      // Las apps vigiladas (elegidas en Configuración) se envían una vez por arranque; si el usuario las
      // cambia después, captureAppsService.setSelected() las reenvía de inmediato por su cuenta.
      if (!configured) {
        const apps = await captureAppsService.getSelected();
        await captureBridge.setPackages(apps.map((app) => app.pkg));
        configured = true;
      }
      const events = await captureBridge.drain();
      const summary = await captureService.ingestEvents(events);
      await captureService.pruneOld();
      return summary;
    } catch (error) {
      console.warn('[captura] No se pudo sincronizar', error);
      return NOTHING;
    } finally {
      running = null;
    }
  })();
  return running;
}
