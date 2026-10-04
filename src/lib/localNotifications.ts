import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PendingCapture } from '@/types/models';
import { CAPTURE_NOTIFICATION_TITLE, captureNotificationBody } from './captureCopy';
import { isPendingReminderId, type PlannedPendingReminder } from './pendingReminders';
import type { PlannedReminder } from './reminders';

/**
 * Puente con las notificaciones locales del teléfono (`@capacitor/local-notifications`).
 * Los avisos se programan EN el teléfono con el reloj del sistema: llegan aunque la app esté cerrada y no usan Internet.
 * En el navegador todo es un no-op.
 */
export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

const CHANNEL_ID = 'pagos';
/** Identificador reservado (los avisos reales usan ids desde 1000). */
const TEST_ID = 1;

function toPermission(state: string): ReminderPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

async function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  // Android 8+ exige un canal. Crearlo de nuevo con los mismos datos no hace nada.
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Pagos de tarjetas',
    description: 'Avisos antes de que venza el pago de una tarjeta de crédito',
    importance: 4,
    visibility: 1,
    vibration: true,
  });
}

/** Cancela los avisos programados que cumplan `shouldCancel` (por defecto, todos). */
async function cancelPending(shouldCancel: (id: number) => boolean = () => true): Promise<void> {
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications.filter((n) => shouldCancel(n.id)).map((n) => ({ id: n.id }));
  if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids });
}

/** Los avisos de pago no deben tocar los del recordatorio de pendientes (y viceversa). */
const isPaymentSideId = (id: number): boolean => !isPendingReminderId(id);

export const reminderBridge = {
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  },

  async permission(): Promise<ReminderPermission> {
    if (!this.isSupported()) return 'unsupported';
    return toPermission((await LocalNotifications.checkPermissions()).display);
  },

  /** Muestra el diálogo del sistema (Android 13+ / iOS). Devuelve el estado resultante. */
  async requestPermission(): Promise<ReminderPermission> {
    if (!this.isSupported()) return 'unsupported';
    return toPermission((await LocalNotifications.requestPermissions()).display);
  },

  /** Cancela lo programado y programa exactamente esta lista (así un pago hecho borra sus avisos). */
  async replaceAll(plan: PlannedReminder[]): Promise<void> {
    if (!this.isSupported()) return;
    await ensureChannel();
    await cancelPending(isPaymentSideId);
    if (plan.length === 0) return;
    await LocalNotifications.schedule({
      notifications: plan.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: CHANNEL_ID,
        // allowWhileIdle: llega aunque el teléfono esté en reposo, sin pedir el permiso de alarmas exactas.
        schedule: { at: item.at, allowWhileIdle: true },
        extra: { route: '/tarjetas' },
      })),
    });
  },

  async cancelAll(): Promise<void> {
    if (!this.isSupported()) return;
    await cancelPending(isPaymentSideId);
  },

  /** Un aviso de prueba que llega en `seconds` segundos, para comprobar que todo funciona. */
  async sendTest(seconds = 5): Promise<void> {
    if (!this.isSupported()) return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_ID,
          title: 'Aviso de prueba',
          body: 'Así te avisaremos antes de que venza el pago de una tarjeta.',
          channelId: CHANNEL_ID,
          schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
          extra: { route: '/tarjetas' },
        },
      ],
    });
  },

  /** Al tocar un aviso se abre la app en la ruta indicada. */
  onTap(handler: (route: string) => void): Promise<PluginListenerHandle> | null {
    if (!this.isSupported()) return null;
    return LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const route = (event.notification.extra as { route?: unknown } | undefined)?.route;
      if (typeof route === 'string') handler(route);
    });
  },
};

const CAPTURE_CHANNEL_ID = 'capturas';
/** Rango de ids reservado para avisos de captura (los de pagos usan desde 1000; el de prueba, el 1). */
const CAPTURE_ID_BASE = 2_000_000;
const CAPTURE_ID_SPAN = 900_000;
/** Id fijo para el aviso agrupado ("N gastos nuevos"): si llega otra tanda enseguida, reemplaza al anterior. */
const CAPTURE_GROUP_ID = 2_999_001;

/**
 * Convierte el texto crudo del aviso (título + cuerpo) en un número estable dentro del rango reservado.
 * MISMO algoritmo que `notificationIdFor` en `CaptureListenerService.java`: así, el aviso "al instante" que
 * muestra el servicio nativo apenas detecta el mensaje (con la app cerrada) y el aviso con los datos ya
 * interpretados que muestra este archivo comparten id y Android los trata como el mismo aviso (lo reemplaza
 * en vez de duplicarlo). Si cambias esta función, cambia también su gemela en Java.
 */
function captureNotificationId(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return CAPTURE_ID_BASE + (hash % CAPTURE_ID_SPAN);
}

async function ensureCaptureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: CAPTURE_CHANNEL_ID,
    name: 'Gastos detectados',
    description: 'Avisa cuando la app registra automáticamente un gasto desde una notificación o SMS del banco',
    importance: 4,
    visibility: 1,
    vibration: true,
  });
}

/**
 * Puente para avisar cuando la captura automática registró uno o varios gastos como pendientes.
 * El toque del aviso lo recoge el mismo listener de `reminderBridge.onTap` (es global a todas las notificaciones locales).
 */
export const captureNotifications = {
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  },

  /** Comprueba el permiso y, si nunca se ha pedido, lo pide en el momento (solo Android 13+ / iOS lo requieren). */
  async ensurePermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    let state = toPermission((await LocalNotifications.checkPermissions()).display);
    if (state === 'prompt') state = toPermission((await LocalNotifications.requestPermissions()).display);
    return state === 'granted';
  },

  /** Un gasto se registró automáticamente: avisa para ir a asignarle categoría. */
  async notify(item: PendingCapture): Promise<void> {
    if (!this.isSupported()) return;
    if (!(await this.ensurePermission())) return;
    await ensureCaptureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          // Mismo id que el aviso "al instante" del lado nativo (ver captureNotificationId): lo reemplaza
          // en vez de sumarse a él.
          id: captureNotificationId(item.rawText),
          title: CAPTURE_NOTIFICATION_TITLE,
          body: captureNotificationBody(item.amount, item.merchant),
          channelId: CAPTURE_CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true },
          extra: { route: `/gasto/nuevo?pendiente=${item.id}` },
        },
      ],
    });
  },

  /**
   * Retira el aviso "al instante" que mostró el lado nativo si, al procesar el mensaje, resultó que no era
   * un gasto real (repetido, código de un solo uso, etc.). `rawText` es el mismo texto (título + cuerpo)
   * con el que se calculó el id del lado nativo.
   */
  async cancel(rawText: string): Promise<void> {
    if (!this.isSupported()) return;
    await LocalNotifications.cancel({ notifications: [{ id: captureNotificationId(rawText) }] });
  },

  /** Varios gastos se registraron de una vez: un solo aviso que lleva al listado de pendientes. */
  async notifyMany(count: number): Promise<void> {
    if (!this.isSupported()) return;
    if (!(await this.ensurePermission())) return;
    await ensureCaptureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: CAPTURE_GROUP_ID,
          title: 'Gastos registrados',
          body: `${count} gastos nuevos · Toca para asignarles categoría`,
          channelId: CAPTURE_CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true },
          extra: { route: '/pendientes' },
        },
      ],
    });
  },
};

/**
 * Recordatorio periódico de gastos capturados que siguen sin categoría.
 * Sus ids (>= PENDING_REMINDER_ID_BASE) están aparte de los de pagos, así que cada lado reprograma lo suyo sin borrar lo del otro.
 */
export const pendingReminderBridge = {
  /** Cancela lo programado de este recordatorio y programa exactamente esta lista. */
  async replaceAll(plan: PlannedPendingReminder[]): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await cancelPending(isPendingReminderId);
    if (plan.length === 0) return;
    await ensureCaptureChannel();
    await LocalNotifications.schedule({
      notifications: plan.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: CAPTURE_CHANNEL_ID,
        schedule: { at: item.at, allowWhileIdle: true },
        extra: { route: '/pendientes' },
      })),
    });
  },

  async cancelAll(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await cancelPending(isPendingReminderId);
  },

  /** Diagnóstico: cuántos avisos de este recordatorio tiene programados el teléfono y cuándo suena el próximo. */
  async scheduledInfo(): Promise<{ count: number; next: Date | null }> {
    if (!Capacitor.isNativePlatform()) return { count: 0, next: null };
    const pending = await LocalNotifications.getPending();
    const mine = pending.notifications.filter((n) => isPendingReminderId(n.id));
    const times = mine.map((n) => (n.schedule?.at ? new Date(n.schedule.at).getTime() : NaN)).filter((t) => Number.isFinite(t));
    return { count: mine.length, next: times.length > 0 ? new Date(Math.min(...times)) : null };
  },
};

export type ExactAlarmStatus = 'granted' | 'denied' | 'unsupported';

/**
 * Permiso de "alarmas exactas" (Android 12+). Sin él Android retrasa los avisos programados: un recordatorio
 * pedido cada 30 min puede llegar cada 1 o 2 horas. Es un permiso especial: se concede en una pantalla del sistema.
 */
export const exactAlarmBridge = {
  async status(): Promise<ExactAlarmStatus> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'unsupported';
    try {
      const { exact_alarm: state } = await LocalNotifications.checkExactNotificationSetting();
      return state === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'unsupported'; // Android anterior a 12: no hace falta permiso.
    }
  },

  /** Abre «Alarmas y recordatorios» de Mi Plata en los ajustes del teléfono. */
  async openSettings(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.changeExactNotificationSetting();
  },
};
