import { DEFAULT_CAPTURE_APPS, setCustomSourceLabels, type CaptureAppChoice } from '@/config/capture';
import { SETTING_KEYS } from '@/config/constants';
import { captureBridge, type InstalledApp } from '@/lib/notificationCapture';
import { settingsRepository } from '@/repositories/settingsRepository';

function parseStored(raw: string | null): CaptureAppChoice[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    const list = value.filter(
      (item): item is CaptureAppChoice =>
        !!item && typeof item === 'object' && typeof item.pkg === 'string' && typeof item.label === 'string',
    );
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/**
 * Qué apps vigila la captura automática: la elección del usuario (Configuración ▸ Captura automática),
 * o las recomendadas (`DEFAULT_CAPTURE_APPS`) hasta que elija la suya. Esta lista, no `CAPTURE_SOURCES`,
 * es la que se manda al lector nativo.
 */
export const captureAppsService = {
  async getSelected(): Promise<CaptureAppChoice[]> {
    const stored = parseStored(await settingsRepository.get(SETTING_KEYS.captureApps));
    const list = stored ?? DEFAULT_CAPTURE_APPS;
    setCustomSourceLabels(list);
    return list;
  },

  /** Guarda la elección y la aplica de inmediato en el lector nativo. */
  async setSelected(apps: CaptureAppChoice[]): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.captureApps, JSON.stringify(apps));
    setCustomSourceLabels(apps);
    await captureBridge.setPackages(apps.map((app) => app.pkg));
  },

  /** Apps instaladas en el teléfono, para elegir cuáles vigilar. Vacío fuera de Android. */
  listInstalledApps(): Promise<InstalledApp[]> {
    return captureBridge.listApps();
  },
};
