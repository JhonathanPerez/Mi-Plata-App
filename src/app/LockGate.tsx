import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { RingLogo } from '@/components/ui/RingLogo';
import { SplashLoading } from '@/components/ui/SplashLoading';
import { APP_NAME } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { authenticate, getBiometricSupport, isBiometricPromptActive, isBiometricPromptOpen } from '@/lib/biometrics';
import { pushBackHandler } from '@/lib/backStack';
import { haptics } from '@/lib/haptics';
import { shouldRelock } from '@/lib/lockPolicy';
import { lockService } from '@/services/lockService';

type Status = 'checking' | 'locked' | 'unlocked';

/** Pausa antes de mostrar el diálogo al volver a la app: en algunos teléfonos falla si se pide al instante. */
const RESUME_PROMPT_DELAY_MS = 250;

/**
 * Pide huella, rostro o el PIN del teléfono al abrir la app y al volver a ella (según el ajuste).
 *  - La pantalla de arranque (DatabaseGate) se ve el tiempo definido en STARTUP_SPLASH_MS y recién después se pide
 *    la huella; mientras se lee el ajuste, esta pantalla repite el mismo logo y spinner, sin saltos.
 *  - Mientras esté bloqueada NO se monta la app: no hay datos en pantalla ni en el árbol.
 *  - Una vez desbloqueada, al bloquear de nuevo la app queda montada debajo de la pantalla de bloqueo,
 *    así no pierdes un gasto a medio escribir.
 *  - Si el teléfono no tiene ni huella ni PIN, no hay cómo proteger la app y se deja pasar
 *    (en Configuración se explica).
 *  - En el navegador (desarrollo) no aplica.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const config = useQuery(() => lockService.getConfig());
  const [status, setStatus] = useState<Status>('checking');
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [message, setMessage] = useState('');

  const configRef = useRef(config.data);
  configRef.current = config.data;
  const statusRef = useRef<Status>('checking');
  const backgroundedAt = useRef<number | null>(null);
  const started = useRef(false);

  const setLockStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatus(next);
    if (next === 'unlocked') setEverUnlocked(true);
  }, []);

  const unlock = useCallback(async () => {
    if (isBiometricPromptOpen()) return;
    setMessage('');
    const support = await getBiometricSupport();
    if (support !== 'available') {
      // Sin huella ni PIN configurados no se puede proteger: mejor dejar entrar que dejarte fuera.
      setLockStatus('unlocked');
      return;
    }
    const outcome = await authenticate('Confirma tu identidad para continuar');
    if (outcome.ok) {
      void haptics.success();
      setLockStatus('unlocked');
    } else {
      setMessage(outcome.message);
    }
  }, [setLockStatus]);

  // Primera decisión, al conocer el ajuste: abrir sin bloqueo o pedir la huella.
  useEffect(() => {
    if (started.current || !config.data) return;
    started.current = true;
    if (!Capacitor.isNativePlatform() || !config.data.enabled) {
      setLockStatus('unlocked');
      return;
    }
    setLockStatus('locked');
    void unlock();
  }, [config.data, setLockStatus, unlock]);

  // Si el usuario apaga el bloqueo desde Configuración con la app abierta, se libera la pantalla.
  useEffect(() => {
    if (config.data && !config.data.enabled && statusRef.current !== 'checking') setLockStatus('unlocked');
  }, [config.data, setLockStatus]);

  // Volver a bloquear al regresar de segundo plano.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      const current = configRef.current;
      if (!isActive) {
        if (!isBiometricPromptActive()) backgroundedAt.current = Date.now();
        return;
      }
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (!current?.enabled || since === null || statusRef.current !== 'unlocked') return;
      if (!shouldRelock(since, Date.now(), current.delaySeconds)) return;
      setLockStatus('locked');
      timer = setTimeout(() => void unlock(), RESUME_PROMPT_DELAY_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      void handle.then((h) => h.remove());
    };
  }, [setLockStatus, unlock]);

  // Con la pantalla de bloqueo visible, "Atrás" cierra la app (no navega la pantalla oculta).
  useEffect(() => {
    if (status === 'unlocked') return undefined;
    return pushBackHandler(() => void CapacitorApp.exitApp());
  }, [status]);

  return (
    <>
      {everUnlocked && children}
      <AnimatePresence>
        {status !== 'unlocked' && (
          <motion.div
            key="lock"
            className="splash lock"
            role="dialog"
            aria-modal="true"
            aria-label="Aplicación bloqueada"
            initial={false}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <RingLogo animated={false} />
            <h1 className="splash__name">{APP_NAME}</h1>
            {status === 'checking' ? (
              <SplashLoading />
            ) : (
              <>
                <p className="splash__text">{message || 'Usa tu huella, tu rostro o el PIN del teléfono.'}</p>
                <Button size="lg" icon="lock" onClick={() => void unlock()}>
                  Desbloquear
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
