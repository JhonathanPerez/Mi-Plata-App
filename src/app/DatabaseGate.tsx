import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_NAME } from '@/config/constants';
import { initDatabase } from '@/db';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';

const OPEN_TIMEOUT_MS = 12_000;
/** La base local abre casi al instante, pero el anillo del logo tarda ~1.2 s en dibujarse.
 *  Sin este mínimo, la pantalla de arranque desaparecía antes de que se alcanzara a ver. */
const MIN_SPLASH_MS = 1_200;

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
      .then(() => wait(Math.max(0, MIN_SPLASH_MS - (Date.now() - started))))
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
      <div className="splash__mark" aria-hidden="true">
        <svg viewBox="0 0 108 108">
          <circle className="ring-seg s1" cx="54" cy="52" r="25" stroke="#E4572E" transform="rotate(-90 54 52)" />
          <circle className="ring-seg s2" cx="54" cy="52" r="25" stroke="#9B5DE5" transform="rotate(1.44 54 52)" />
          <circle className="ring-seg s3" cx="54" cy="52" r="25" stroke="#2A9D8F" transform="rotate(79.92 54 52)" />
          <circle className="ring-seg s4" cx="54" cy="52" r="25" stroke="#3D8FD1" transform="rotate(151.92 54 52)" />
          <circle className="ring-seg s5" cx="54" cy="52" r="25" stroke="#4C5C68" transform="rotate(217.44 54 52)" />
          <circle className="center-dot" cx="54" cy="52" r="8.6" fill="#F5B301" />
        </svg>
      </div>
      <h1 className="splash__name">{APP_NAME}</h1>
      {status === 'loading' ? (
        <>
          <div className="splash__spinner" role="status" aria-label="Cargando" />
          <p className="splash__text">Abriendo tus datos…</p>
        </>
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
