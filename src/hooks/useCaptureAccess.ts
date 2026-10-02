import { useCallback, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { captureBridge } from '@/lib/notificationCapture';

/**
 * ¿Mi Plata tiene el permiso «Acceso a notificaciones» de Android? `enabled` es `null` mientras se comprueba.
 * Se vuelve a leer al regresar a la app, por si la persona lo concedió en los ajustes del teléfono.
 */
export function useCaptureAccess() {
  const supported = captureBridge.isSupported();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEnabled(await captureBridge.isEnabled());
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (!supported) return undefined;
    void refresh();
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [supported, refresh]);

  return { supported, enabled };
}
