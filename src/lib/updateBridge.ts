import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface DownloadProgress {
  received: number;
  /** 0 si no se conoce el tamaño total. */
  total: number;
}

/**
 * Puente con el plugin nativo `AppUpdate` (Android, ver `native/android/AppUpdatePlugin.java`).
 * La descarga queda en una carpeta privada de la app con un nombre fijo: la parte web nunca pasa rutas de archivos,
 * así que no puede pedirle al lado nativo que instale otra cosa.
 */
interface AppUpdatePlugin {
  /** ¿Android deja a Mi Plata instalar apps? (permiso «Instalar apps desconocidas», Android 8+). */
  canInstall(): Promise<{ allowed: boolean }>;
  /** Abre la pantalla de Android donde se concede ese permiso. */
  openInstallSettings(): Promise<void>;
  /** Descarga el APK a la carpeta privada de la app. Si ya está completo, lo reutiliza. */
  download(options: { url: string; size: number }): Promise<void>;
  cancelDownload(): Promise<void>;
  /** Comprueba el archivo descargado (es Mi Plata, es más nuevo, misma firma) y abre el instalador de Android. */
  install(): Promise<void>;
  addListener(eventName: 'downloadProgress', listener: (progress: DownloadProgress) => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<AppUpdatePlugin>('AppUpdate');

export const updateBridge = {
  /** Solo existe en la app de Android; en el navegador todo es un no-op. */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  async canInstall(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return (await Native.canInstall()).allowed;
  },

  async openInstallSettings(): Promise<void> {
    if (this.isSupported()) await Native.openInstallSettings();
  },

  /** Descarga el APK y avisa del avance. Devuelve cuando el archivo quedó completo. */
  async download(options: { url: string; size: number }, onProgress: (progress: DownloadProgress) => void): Promise<void> {
    if (!this.isSupported()) return;
    const handle = await Native.addListener('downloadProgress', onProgress);
    try {
      await Native.download(options);
    } finally {
      await handle.remove();
    }
  },

  async cancelDownload(): Promise<void> {
    if (this.isSupported()) await Native.cancelDownload();
  },

  async install(): Promise<void> {
    if (this.isSupported()) await Native.install();
  },
};
