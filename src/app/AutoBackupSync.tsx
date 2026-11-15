import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { BACKUP_SCHEDULE_CHANGED } from '@/lib/autoBackup';
import { autoBackupService } from '@/services/autoBackupService';

/** Con la app abierta, el temporizador nunca espera más que esto: así se corrige solo si el reloj o el horario cambian. */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
/** Si una copia falló (sin espacio, nube sin conexión…), se reintenta pasado este tiempo en vez de en bucle. */
const RETRY_MS = 15 * 60 * 1000;

/**
 * Sin pantalla. Hace las copias de seguridad cuando llega la hora elegida:
 * - al abrir la app y al volver a ella (si la hora ya pasó mientras estaba cerrada, la copia se hace en ese momento);
 * - mientras la app está abierta, con un temporizador que despierta justo a la hora elegida.
 * La copia se arma en la parte web de la app, que no corre con la app cerrada del todo (a diferencia de un recordatorio, que
 * queda programado de antemano y lo muestra el sistema). Por eso no hay copia con la app cerrada.
 * Un fallo aquí nunca interrumpe a la persona: la copia se reintenta más tarde.
 */
export function AutoBackupSync() {
  useEffect(() => {
    if (!autoBackupService.isSupported()) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const arm = async () => {
      clearTimeout(timer);
      const delay = await autoBackupService.getNextRunDelay().catch(() => null);
      if (!active || delay === null) return;
      // Un segundo de margen para que, al despertar, la hora ya haya llegado.
      timer = setTimeout(() => void run(), delay <= 0 ? RETRY_MS : Math.min(delay + 1000, MAX_WAIT_MS));
    };

    // Primero la copia del teléfono y después la de la nube (que reutiliza la de hoy). Una falla no frena a la otra.
    const run = async () => {
      // La tarea en segundo plano de Android se deja programada como el horario elegido (no hace nada si ya lo está).
      await autoBackupService.syncBackgroundSchedule().catch(() => undefined);
      // Lo que la tarea en segundo plano hizo con la app cerrada, para no repetirlo ni avisar de un atraso que no existe.
      await autoBackupService.reconcileBackgroundBackup().catch(() => undefined);
      await autoBackupService.runIfDue().catch(() => undefined);
      await autoBackupService.runCloudIfDue().catch(() => undefined);
      await arm();
    };

    void run();
    const stateHandle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void run();
      else clearTimeout(timer);
    });
    const onScheduleChanged = () => void run();
    window.addEventListener(BACKUP_SCHEDULE_CHANGED, onScheduleChanged);

    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener(BACKUP_SCHEDULE_CHANGED, onScheduleChanged);
      void stateHandle.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
