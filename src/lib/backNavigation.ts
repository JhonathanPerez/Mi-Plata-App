import type { ReturnTarget } from './navigationState';

export type BackAction = { type: 'back' } | { type: 'goto'; to: string; state?: unknown } | { type: 'exit' };

/**
 * Qué hace el botón/gesto Atrás de Android según la pantalla:
 *  - Pantallas secundarias (/gasto/..., /ajustes/..., /tarjetas/..., /pendientes): vuelve a la anterior.
 *  - Pestañas distintas de Inicio: vuelve a Inicio.
 *  - Inicio: sale de la app.
 *  - Si la pantalla se abrió desde otra con un destino de regreso (`returnTo`, p. ej. una categoría de Estadísticas que abre Gastos),
 *    Atrás vuelve ahí, con el estado que se guardó (el mes que se estaba viendo).
 */
export function decideBackAction(pathname: string, canGoBack: boolean, returnTo?: ReturnTarget): BackAction {
  if (returnTo) return returnTo.state === undefined ? { type: 'goto', to: returnTo.to } : { type: 'goto', to: returnTo.to, state: returnTo.state };

  const isSettingsChild = pathname.startsWith('/ajustes/');
  const isExpense = pathname.startsWith('/gasto/'); // ojo: '/gastos' (historial) es una pestaña
  const isCards = pathname === '/tarjetas' || pathname.startsWith('/tarjetas/');

  // /pendientes se abre desde Ajustes (o desde un aviso): con historial vuelve a donde estabas; sin él, a Ajustes.
  const isPending = pathname === '/pendientes';

  if (isSettingsChild || isExpense || isCards || isPending) {
    if (canGoBack) return { type: 'back' };
    return { type: 'goto', to: isSettingsChild || isPending ? '/ajustes' : '/' };
  }
  if (pathname !== '/' && pathname !== '') return { type: 'goto', to: '/' };
  return { type: 'exit' };
}
