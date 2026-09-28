import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { captureBridge } from '@/lib/notificationCapture';
import { syncCapturedNotifications } from '@/services/captureSync';

/**
 * Sin pantalla. Trae los gastos detectados por el teléfono al abrir la app, al volver a ella
 * y cuando llega uno nuevo con la app abierta.
 */
export function CaptureSync() {
  useEffect(() => {
    if (!captureBridge.isSupported()) return undefined;

    void captureBridge.rebind().catch(() => undefined);
    void syncCapturedNotifications();

    const stateHandle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void syncCapturedNotifications();
    });
    const capturedHandle = captureBridge.onCaptured(() => void syncCapturedNotifications());

    return () => {
      void stateHandle.then((handle) => handle.remove());
      void capturedHandle?.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
