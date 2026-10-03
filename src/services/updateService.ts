import { APP_VERSION, SETTING_KEYS, UPDATE_CHECK_INTERVAL_MS, UPDATE_REPO } from '@/config/constants';
import {
  decideUpdate,
  fetchLatestRelease,
  shouldCheckOnStartup,
  shouldPromptAutomatically,
  type AvailableRelease,
  type UpdateDecision,
} from '@/lib/appUpdate';
import { updateBridge, type DownloadProgress } from '@/lib/updateBridge';
import { settingsRepository } from '@/repositories/settingsRepository';

/** Una consulta a GitHub y su veredicto frente a la versión instalada. Lanza `UpdateError` si no se pudo consultar. */
async function check(): Promise<UpdateDecision> {
  const release = await fetchLatestRelease(UPDATE_REPO);
  return decideUpdate(release, APP_VERSION);
}

async function readNumber(key: string): Promise<number | null> {
  const value = Number(await settingsRepository.get(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const updateService = {
  isSupported(): boolean {
    return updateBridge.isSupported();
  },

  /** Búsqueda manual («Comprobar actualizaciones»): siempre consulta y avisa de cualquier fallo. */
  check,

  /**
   * Búsqueda automática al abrir la app. Respeta el intervalo mínimo entre consultas y no insiste con una versión a la que
   * la persona ya dio «Cancelar». Devuelve la versión a ofrecer, o `null` si no hay nada que mostrar. Nunca lanza errores:
   * sin Internet la app sigue como si nada.
   */
  async checkOnStartup(now: number = Date.now()): Promise<AvailableRelease | null> {
    if (!updateBridge.isSupported()) return null;
    try {
      if (!shouldCheckOnStartup(await readNumber(SETTING_KEYS.updateLastCheck), now, UPDATE_CHECK_INTERVAL_MS)) return null;
      const decision = await check();
      await settingsRepository.set(SETTING_KEYS.updateLastCheck, String(now));
      if (decision.status !== 'available') return null;
      const skipped = await settingsRepository.get(SETTING_KEYS.updateSkippedVersion);
      return shouldPromptAutomatically(decision.release.version, skipped) ? decision.release : null;
    } catch (error) {
      console.warn('[actualizaciones] No se pudo buscar al abrir', error);
      return null;
    }
  },

  /** La persona dio «Cancelar»: no se vuelve a avisar de esta versión al abrir la app (Ajustes sigue ofreciéndola). */
  async skipVersion(version: string): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.updateSkippedVersion, version);
  },

  canInstall: () => updateBridge.canInstall(),
  openInstallSettings: () => updateBridge.openInstallSettings(),

  /** Descarga el APK de esta versión. El tamaño esperado permite reutilizar una descarga completa y detectar archivos cortados. */
  download(release: AvailableRelease, onProgress: (progress: DownloadProgress) => void): Promise<void> {
    return updateBridge.download({ url: release.apk.url, size: release.apk.size }, onProgress);
  },

  cancelDownload: () => updateBridge.cancelDownload(),
  install: () => updateBridge.install(),
};
