import { useCallback, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useQuery } from '@/hooks/useQuery';
import { exactAlarmBridge, reminderBridge, type ExactAlarmStatus, type ReminderPermission } from '@/lib/localNotifications';
import { reminderService } from '@/services/reminderService';

/** Estado de los avisos (de pago y de gastos pendientes): ajustes guardados + permiso actual del sistema (se relee al volver a la app). */
export function useReminderStatus() {
  const { data: settings } = useQuery(() => reminderService.getSettings());
  const { data: pendingSettings } = useQuery(() => reminderService.getPendingSettings());
  const [permission, setPermission] = useState<ReminderPermission>(reminderBridge.isSupported() ? 'prompt' : 'unsupported');
  const [exactAlarm, setExactAlarm] = useState<ExactAlarmStatus>('unsupported');
  const supported = reminderBridge.isSupported();

  const refresh = useCallback(async () => {
    setPermission(await reminderBridge.permission());
    setExactAlarm(await exactAlarmBridge.status());
  }, []);

  useEffect(() => {
    if (!supported) return undefined;
    void refresh();
    // Si el usuario cambia el permiso en los ajustes del teléfono y regresa, se actualiza solo.
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [supported, refresh]);

  return {
    settings,
    pendingSettings,
    permission,
    /** 'denied' = Android puede retrasar los avisos horas; 'unsupported' = no hace falta (o no es Android). */
    exactAlarm,
    supported,
    refresh,
    /** Encendidos en la app Y con permiso del sistema. */
    active: Boolean(settings?.enabled) && permission === 'granted',
    /** Recordatorio de gastos pendientes: encendido en la app Y con permiso del sistema. */
    pendingActive: Boolean(pendingSettings?.enabled) && permission === 'granted',
  };
}
