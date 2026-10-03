import { APP_VERSION, SETTING_KEYS, UPDATE_CHECK_INTERVAL_MS, UPDATE_REPO, UPDATE_SNOOZE_MS } from '@/config/constants';
import {
  decideUpdate,
  fetchLatestRelease,
  isConclusiveDecision,
  shouldCheckAutomatically,
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
   * Búsqueda automática, al abrir la app y al volver a ella. Respeta el intervalo mínimo entre consultas y no insiste con una
   * versión a la que la persona dio «Cancelar» hace menos de un día. Devuelve la versión a ofrecer, o `null` si no hay nada
   * que mostrar. Nunca lanza errores: sin Internet la app sigue como si nada.
   *
   * La hora de la consulta solo se anota si GitHub dio una respuesta definitiva: con un error o con una versión «en preparación»
   * (su APK aún se compila) la próxima apertura vuelve a preguntar en vez de esperar todo el intervalo.
   */
  async checkAutomatically(now: number = Date.now()): Promise<AvailableRelease | null> {
    if (!updateBridge.isSupported()) return null;
    try {
      if (!shouldCheckAutomatically(await readNumber(SETTING_KEYS.updateLastCheck), now, UPDATE_CHECK_INTERVAL_MS)) return null;
      const decision = await check();
      if (isConclusiveDecision(decision)) await settingsRepository.set(SETTING_KEYS.updateLastCheck, String(now));
      if (decision.status !== 'available') return null;
      const skipped = await settingsRepository.get(SETTING_KEYS.updateSkippedVersion);
      const skippedAt = await readNumber(SETTING_KEYS.updateSkippedAt);
      return shouldPromptAutomatically(decision.release.version, skipped, skippedAt, now, UPDATE_SNOOZE_MS) ? decision.release : null;
    } catch (error) {
      console.warn('[actualizaciones] No se pudo buscar automáticamente', error);
      return null;
    }
  },

  /** La persona dio «Cancelar»: el aviso automático de esta versión descansa un día (Ajustes sigue ofreciéndola). */
  async skipVersion(version: string, now: number = Date.now()): Promise<void> {
    await settingsRepository.set(SETTING_KEYS.updateSkippedVersion, version);
    await settingsRepository.set(SETTING_KEYS.updateSkippedAt, String(now));
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
