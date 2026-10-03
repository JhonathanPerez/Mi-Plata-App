import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { UpdateDialog, type UpdatePhase } from '@/components/update/UpdateDialog';
import { APP_VERSION } from '@/config/constants';
import type { AvailableRelease } from '@/lib/appUpdate';
import { pushBackHandler } from '@/lib/backStack';
import { errorMessage } from '@/lib/errors';
import { updateService } from '@/services/updateService';
import { useToast } from './ToastProvider';

interface UpdateApi {
  /** Solo la app de Android puede descargar e instalar; en el navegador todo queda inactivo. */
  supported: boolean;
  checking: boolean;
  /** Versión nueva ya conocida en esta sesión (la que muestra el detalle de Ajustes). */
  available: AvailableRelease | null;
  /** «Comprobar actualizaciones»: consulta ahora y, si hay versión nueva, abre el mismo aviso que al entrar a la app. */
  checkNow: () => Promise<void>;
}

const UpdateContext = createContext<UpdateApi | null>(null);

/**
 * Busca versiones nuevas al abrir la app (y al volver a ella) y guía la actualización: aviso → descarga → instalador de Android.
 * Va dentro del bloqueo (no aparece sobre la pantalla de huella) y dentro de los avisos y diálogos.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const supported = updateService.isSupported();
  const [phase, setPhase] = useState<UpdatePhase | null>(null);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<AvailableRelease | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /** Evita dos descargas a la vez (doble toque, o volver de Ajustes mientras ya descarga). */
  const busyRef = useRef(false);
  /** Se levanta al cancelar una descarga, para que su error no se muestre como un fallo. */
  const cancelledRef = useRef(false);

  const offer = useCallback((release: AvailableRelease) => {
    setAvailable(release);
    setPhase({ name: 'prompt', release });
  }, []);

  /** Evita dos búsquedas automáticas a la vez (abrir la app y volver a ella casi al mismo tiempo). */
  const autoCheckingRef = useRef(false);

  // Al entrar a la app y al volver a ella desde segundo plano: una búsqueda silenciosa (sin Internet no pasa nada).
  // El intervalo mínimo entre consultas lo aplica `updateService`, así que volver a la app seguido no gasta consultas.
  useEffect(() => {
    if (!supported) return undefined;
    let ignore = false;

    const autoCheck = async () => {
      // Con un aviso o una descarga en marcha no hay nada que buscar.
      if (autoCheckingRef.current || phaseRef.current || busyRef.current) return;
      autoCheckingRef.current = true;
      try {
        const release = await updateService.checkAutomatically();
        if (!ignore && release && !phaseRef.current) offer(release);
      } finally {
        autoCheckingRef.current = false;
      }
    };

    void autoCheck();
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void autoCheck();
    });
    return () => {
      ignore = true;
      void handle.then((h) => h.remove());
    };
  }, [supported, offer]);

  // Si el bloqueo de la app desmonta esto a mitad de una descarga, no se deja un hilo nativo huérfano.
  useEffect(
    () => () => {
      if (phaseRef.current?.name === 'downloading') void updateService.cancelDownload().catch(() => undefined);
    },
    [],
  );

  const proceed = useCallback(
    async (release: AvailableRelease) => {
      if (busyRef.current) return;
      busyRef.current = true;
      cancelledRef.current = false;
      try {
        setPhase({ name: 'downloading', release, received: 0, total: release.apk.size });
        try {
          await updateService.download(release, ({ received, total }) => {
            setPhase((current) => (current?.name === 'downloading' ? { ...current, received, total: total > 0 ? total : current.total } : current));
          });
        } catch (error) {
          if (cancelledRef.current) return;
          setPhase({ name: 'prompt', release });
          toast.show(errorMessage(error), 'error');
          return;
        }
        if (cancelledRef.current) return;

        setPhase({ name: 'installing', release });
        try {
          await updateService.install();
          setPhase(null);
          toast.show('Confirma la instalación en la pantalla de Android.', 'info');
        } catch (error) {
          setPhase({ name: 'prompt', release });
          toast.show(errorMessage(error), 'error');
        }
      } finally {
        busyRef.current = false;
      }
    },
    [toast],
  );

  const download = useCallback(async () => {
    const current = phaseRef.current;
    if (current?.name !== 'prompt' || busyRef.current) return;
    try {
      if (!(await updateService.canInstall())) {
        setPhase({ name: 'permission', release: current.release });
        return;
      }
      await proceed(current.release);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  }, [proceed, toast]);

  const openInstallSettings = useCallback(async () => {
    try {
      await updateService.openInstallSettings();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  }, [toast]);

  const cancel = useCallback(() => {
    const current = phaseRef.current;
    if (!current || current.name === 'installing') return;
    if (current.name === 'downloading') {
      cancelledRef.current = true;
      void updateService.cancelDownload().catch(() => undefined);
    } else if (current.name === 'prompt') {
      // «Cancelar» en el aviso: el aviso automático de esta versión descansa un día (Ajustes la sigue ofreciendo).
      void updateService.skipVersion(current.release.version).catch(() => undefined);
    }
    setPhase(null);
  }, []);

  // Con el permiso pendiente, al volver de los ajustes del teléfono la descarga arranca sola.
  const waitingRelease = phase?.name === 'permission' ? phase.release : null;
  useEffect(() => {
    if (!waitingRelease) return undefined;
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void updateService
        .canInstall()
        .then((allowed) => {
          if (allowed && phaseRef.current?.name === 'permission') void proceed(waitingRelease);
        })
        .catch(() => undefined);
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [waitingRelease, proceed]);

  // El botón Atrás de Android cancela el aviso, en vez de salir de la pantalla de atrás.
  const cancellable = phase !== null && phase.name !== 'installing';
  useEffect(() => {
    if (!cancellable) return undefined;
    return pushBackHandler(cancel);
  }, [cancellable, cancel]);

  const checkNow = useCallback(async () => {
    if (!supported) {
      toast.show('Las actualizaciones solo funcionan en la app del teléfono.', 'info');
      return;
    }
    if (checking || phaseRef.current) return;
    setChecking(true);
    try {
      const decision = await updateService.check();
      if (decision.status === 'available') {
        offer(decision.release);
      } else if (decision.status === 'preparing') {
        toast.show(`La versión ${decision.version} se está preparando. Inténtalo de nuevo en unos minutos.`, 'info');
      } else {
        setAvailable(null);
        toast.show(`Ya tienes la última versión (v${APP_VERSION}).`);
      }
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setChecking(false);
    }
  }, [supported, checking, offer, toast]);

  const value = useMemo<UpdateApi>(() => ({ supported, checking, available, checkNow }), [supported, checking, available, checkNow]);

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <UpdateDialog phase={phase} onDownload={() => void download()} onCancel={cancel} onOpenSettings={() => void openInstallSettings()} />
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateApi {
  const context = useContext(UpdateContext);
  if (!context) throw new Error('useUpdate debe usarse dentro de UpdateProvider');
  return context;
}
