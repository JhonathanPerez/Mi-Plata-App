import { captureBridge } from '@/lib/notificationCapture';
import type { PlannedPendingReminder } from '@/lib/pendingReminders';
import { pendingReminderBridge, reminderBridge, type ReminderPermission } from '@/lib/localNotifications';
import { reminderService } from './reminderService';

let running: Promise<number> | null = null;
let rerun = false;

/**
 * Le cuenta al lado nativo cómo quedó el recordatorio: así, si llega un gasto automático con la app CERRADA (cuando
 * este código no corre), el servicio nativo sabe si debe programar él mismo el recordatorio. Nunca lanza errores.
 */
async function publishNativeReminder(
  enabled: boolean,
  intervalMinutes: number,
  plan: PlannedPendingReminder[],
  pendingCount: number,
): Promise<void> {
  try {
    const coveredUntil = plan.length > 0 ? Math.max(...plan.map((item) => item.at.getTime())) : 0;
    await captureBridge.setPendingReminder({ enabled, intervalMinutes, coveredUntil, pendingCount });
  } catch (error) {
    console.warn('[avisos] No se pudo informar al lado nativo', error);
  }
}

async function syncPendingOnce(): Promise<void> {
  const settings = await reminderService.getPendingSettings();
  const permission = await reminderBridge.permission();
  if (!settings.enabled || permission !== 'granted') {
    await pendingReminderBridge.cancelAll();
    await publishNativeReminder(false, settings.intervalMinutes, [], 0);
    return;
  }
  const plan = await reminderService.buildPendingPlan();
  await pendingReminderBridge.replaceAll(plan);
  await publishNativeReminder(true, settings.intervalMinutes, plan, await reminderService.countPending());
}

async function syncPaymentsOnce(): Promise<number> {
  const settings = await reminderService.getSettings();
  const permission = await reminderBridge.permission();
  if (!settings.enabled || permission !== 'granted') {
    await reminderBridge.cancelAll();
    return 0;
  }
  const plan = await reminderService.buildPlan();
  await reminderBridge.replaceAll(plan);
  return plan.length;
}

async function syncOnce(): Promise<number> {
  // Cada parte va aparte: si una falla, la otra igual se programa.
  let scheduled = 0;
  try {
    scheduled = await syncPaymentsOnce();
  } catch (error) {
    console.warn('[avisos] No se pudieron programar los avisos de pago', error);
  }
  try {
    await syncPendingOnce();
  } catch (error) {
    console.warn('[avisos] No se pudo programar el recordatorio de pendientes', error);
  }
  return scheduled;
}

/**
 * Deja programados en el teléfono exactamente los avisos que corresponden hoy.
 * Se llama al abrir la app, al volver a ella y cada vez que cambian los datos (por ejemplo, al pagar un extracto).
 * Nunca lanza errores. Si llega otra petición mientras se sincroniza, se repite una vez al terminar.
 */
export function syncReminders(): Promise<number> {
  if (!reminderBridge.isSupported()) return Promise.resolve(0);
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let scheduled = 0;
    try {
      do {
        rerun = false;
        scheduled = await syncOnce();
      } while (rerun);
    } catch (error) {
      console.warn('[avisos] No se pudieron programar', error);
    } finally {
      running = null;
    }
    return scheduled;
  })();
  return running;
}

export interface EnableResult {
  ok: boolean;
  permission: ReminderPermission;
}

/** Pide el permiso (si hace falta), enciende los avisos y los programa. */
export async function enableReminders(): Promise<EnableResult> {
  let permission = await reminderBridge.permission();
  if (permission === 'prompt') permission = await reminderBridge.requestPermission();
  if (permission !== 'granted') return { ok: false, permission };
  await reminderService.setEnabled(true);
  await syncReminders();
  return { ok: true, permission };
}

export async function disableReminders(): Promise<void> {
  await reminderService.setEnabled(false);
  await syncReminders();
}

/** Pide el permiso (si hace falta), enciende el recordatorio de gastos pendientes y lo programa. */
export async function enablePendingReminders(): Promise<EnableResult> {
  let permission = await reminderBridge.permission();
  if (permission === 'prompt') permission = await reminderBridge.requestPermission();
  if (permission !== 'granted') return { ok: false, permission };
  await reminderService.setPendingEnabled(true);
  await syncReminders();
  return { ok: true, permission };
}

export async function disablePendingReminders(): Promise<void> {
  await reminderService.setPendingEnabled(false);
  await syncReminders();
}

export async function sendTestReminder(): Promise<void> {
  await reminderBridge.sendTest(5);
}
