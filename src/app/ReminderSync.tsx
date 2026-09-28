import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { subscribeDataChanged } from '@/lib/dataBus';
import { reminderBridge } from '@/lib/localNotifications';
import { syncReminders } from '@/services/reminderSync';

/** Sin pantalla: mantiene programados los avisos de pago y el recordatorio de gastos pendientes, y abre la pantalla correspondiente al tocar uno. Va dentro del router. */
export function ReminderSync() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!reminderBridge.isSupported()) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Cada cambio de datos reprograma, pero agrupado: varios cambios seguidos = una sola vez.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncReminders(), 1500);
    };

    void syncReminders();
    const unsubscribe = subscribeDataChanged(schedule);
    // Al abrir Y al salir de la app: el recordatorio de pendientes cuenta el tiempo desde la última vez que la usaste.
    const stateHandle = CapacitorApp.addListener('appStateChange', () => {
      void syncReminders();
    });
    const tapHandle = reminderBridge.onTap((route) => navigate(route));

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      void stateHandle.then((handle) => handle.remove());
      void tapHandle?.then((handle) => handle.remove());
    };
  }, [navigate]);

  return null;
}
