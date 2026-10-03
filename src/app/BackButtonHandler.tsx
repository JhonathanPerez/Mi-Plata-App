import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { decideBackAction } from '@/lib/backNavigation';
import { runTopBackHandler } from '@/lib/backStack';
import { readReturnTarget } from '@/lib/navigationState';

/**
 * Conecta el botón/gesto Atrás de Android con la navegación de la app.
 * Sin esto, Atrás cierra la app en vez de volver a la pantalla anterior.
 */
export function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const returnToRef = useRef(readReturnTarget(location.state));
  returnToRef.current = readReturnTarget(location.state);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    const subscription = CapacitorApp.addListener('backButton', () => {
      // 1) Si hay un panel o diálogo abierto, se cierra ese primero.
      if (runTopBackHandler()) return;

      // 2) Si no, se decide según la pantalla actual.
      const state = window.history.state as { idx?: number } | null;
      const canGoBack = (state?.idx ?? 0) > 0;
      const action = decideBackAction(pathRef.current, canGoBack, returnToRef.current);

      if (action.type === 'back') navigate(-1);
      else if (action.type === 'goto') navigate(action.to, { replace: true, state: action.state });
      else void CapacitorApp.exitApp();
    });

    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, [navigate]);

  return null;
}
