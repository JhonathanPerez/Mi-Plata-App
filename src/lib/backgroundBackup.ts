import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundRunInfo } from './autoBackup';

/**
 * Puente con el plugin nativo `BackupSchedule` (Android, ver `native/android/BackupSchedulePlugin.java`). Programa, con
 * WorkManager, la copia de seguridad a la hora elegida: Android la ejecuta aunque Mi Plata esté cerrada (lee la base de
 * datos, la cifra y la deja en la carpeta de la nube). También guarda la contraseña de cifrado donde esa tarea pueda
 * leerla sin la app abierta.
 */
export interface BackgroundStatus extends BackgroundRunInfo {
  scheduled: boolean;
  time?: string;
  intervalDays?: number;
  nextRunAt?: number;
  /** Fecha (AAAA-MM-DD) de la última copia que la tarea dejó en la carpeta. */
  lastCloudDate?: string;
}

interface BackupSchedulePlugin {
  schedule(options: { time: string; intervalDays: number; keep: number }): Promise<void>;
  cancel(): Promise<void>;
  getStatus(): Promise<BackgroundStatus>;
  setPassword(options: { password: string }): Promise<void>;
  getPassword(): Promise<{ password?: string }>;
  clearPassword(): Promise<void>;
}

const Native = registerPlugin<BackupSchedulePlugin>('BackupSchedule');

export const backgroundBackup = {
  /** Solo existe en la app de Android. */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  schedule(time: string, intervalDays: number, keep: number): Promise<void> {
    return Native.schedule({ time, intervalDays, keep });
  },

  cancel(): Promise<void> {
    return Native.cancel();
  },

  getStatus(): Promise<BackgroundStatus> {
    return Native.getStatus();
  },

  setPassword(password: string): Promise<void> {
    return Native.setPassword({ password });
  },

  async getPassword(): Promise<string | null> {
    return (await Native.getPassword()).password ?? null;
  },
};
