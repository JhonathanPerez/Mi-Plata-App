import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_NAME, STARTUP_SPLASH_MS } from '@/config/constants';
import { initDatabase } from '@/db';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { RingLogo } from '@/components/ui/RingLogo';
import { SplashLoading } from '@/components/ui/SplashLoading';

const OPEN_TIMEOUT_MS = 12_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * En el navegador, SQLite corre sobre WebAssembly (jeep-sqlite). Si ese módulo aborta,
 * la promesa de apertura nunca se resuelve y la app se quedaría en "Abriendo tus datos…".
 * El tiempo límite evita esa pantalla colgada y explica qué hacer.
 */
function openWithTimeout(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          Capacitor.isNativePlatform()
            ? 'La base de datos tardó demasiado en abrir.'
            : 'El motor SQLite del navegador (WebAssembly) no cargó. Revisa la consola: si ves "LinkError", ejecuta `rm -rf public/assets node_modules/.vite && node scripts/copy-sql-wasm.mjs`. En Android no ocurre este problema.',
        ),
      );
    }, OPEN_TIMEOUT_MS);
    initDatabase().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Abre la base local y aplica migraciones antes de mostrar la app. */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const start = useCallback(() => {
    setStatus('loading');
    const started = Date.now();
    openWithTimeout()
      .then(() => wait(Math.max(0, STARTUP_SPLASH_MS - (Date.now() - started))))
      .then(() => setStatus('ready'))
      .catch((error: unknown) => {
        setMessage(errorMessage(error));
        setStatus('error');
      });
  }, []);

  useEffect(start, [start]);

  if (status === 'ready') return <>{children}</>;

  return (
    <div className="splash">
      <RingLogo />
      <h1 className="splash__name">{APP_NAME}</h1>
      {status === 'loading' ? (
        <SplashLoading />
      ) : (
        <>
          <p className="splash__text">No se pudo abrir la base de datos local.</p>
          <p className="splash__detail">{message}</p>
          <Button onClick={start}>Reintentar</Button>
        </>
      )}
    </div>
  );
}
