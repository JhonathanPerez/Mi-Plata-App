import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { RawCaptureEvent } from '@/services/captureService';

export interface InstalledApp {
  pkg: string;
  label: string;
}

/**
 * Puente con el plugin nativo `NotificationCapture` (Android, ver `native/android/`).
 * El servicio nativo lee las notificaciones de las apps permitidas y las deja en una cola; aquí se recogen.
 */
interface NotificationCapturePlugin {
  /** ¿El usuario ya dio "Acceso a notificaciones" a Mi Plata? */
  isEnabled(): Promise<{ enabled: boolean }>;
  /** Abre la pantalla de Android donde se concede ese acceso. */
  openSettings(): Promise<void>;
  /** Qué apps se vigilan (el servicio ignora todas las demás). */
  setPackages(options: { packages: string[] }): Promise<void>;
  /** Apps instaladas en el teléfono con ícono en el lanzador (para elegir cuáles vigilar). */
  listApps(): Promise<{ apps: InstalledApp[] }>;
  /** Entrega y vacía la cola de avisos capturados. */
  drain(): Promise<{ events: RawCaptureEvent[] }>;
  /** Pide a Android reconectar el servicio si se había desconectado. */
  rebind(): Promise<void>;
  /** Estado del recordatorio de pendientes, para que el lado nativo lo mantenga con la app cerrada. */
  setPendingReminder(options: { enabled: boolean; intervalMinutes: number; coveredUntil: number }): Promise<void>;
  addListener(eventName: 'captured', listener: () => void): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<NotificationCapturePlugin>('NotificationCapture');

export const captureBridge = {
  /** Solo existe en la app de Android; en el navegador todo es un no-op. */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  async isEnabled(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return (await Native.isEnabled()).enabled;
  },

  async openSettings(): Promise<void> {
    if (this.isSupported()) await Native.openSettings();
  },

  async setPackages(packages: string[]): Promise<void> {
    if (this.isSupported()) await Native.setPackages({ packages });
  },

  /** Lista, ordenada por nombre, las apps instaladas con ícono en el lanzador (excluye Mi Plata). */
  async listApps(): Promise<InstalledApp[]> {
    if (!this.isSupported()) return [];
    return (await Native.listApps()).apps ?? [];
  },

  async drain(): Promise<RawCaptureEvent[]> {
    if (!this.isSupported()) return [];
    return (await Native.drain()).events ?? [];
  },

  async rebind(): Promise<void> {
    if (this.isSupported()) await Native.rebind();
  },

  /**
   * Le cuenta al lado nativo si el recordatorio de pendientes está activo y hasta cuándo hay avisos programados desde aquí
   * (`coveredUntil`, ms; 0 = ninguno). Con la app cerrada, el servicio programa su propio recordatorio si no hay cobertura.
   */
  async setPendingReminder(options: { enabled: boolean; intervalMinutes: number; coveredUntil: number }): Promise<void> {
    if (this.isSupported()) await Native.setPendingReminder(options);
  },

  /** Avisa cuando el servicio capturó algo con la app abierta. */
  onCaptured(listener: () => void): Promise<PluginListenerHandle> | null {
    return this.isSupported() ? Native.addListener('captured', listener) : null;
  },
};
