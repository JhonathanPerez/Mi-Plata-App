import type { ReturnTarget } from './navigationState';

export type BackAction = { type: 'back' } | { type: 'goto'; to: string; state?: unknown } | { type: 'exit' };

/**
 * Qué hace el botón/gesto Atrás de Android según la pantalla:
 *  - Pantallas secundarias (/gasto/..., /ajustes/..., /tarjetas/..., /ahorros/..., /pendientes): vuelve a la anterior
 *    (así «Ver cuentas» en Estadísticas regresa a Estadísticas y no salta a Inicio).
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
  // Se llega desde Inicio, Estadísticas o Ajustes: la pantalla anterior la sabe el historial, no la ruta.
  const isSavingsAccount = pathname.startsWith('/ahorros/');
  const isSavings = pathname === '/ahorros' || isSavingsAccount;

  // /pendientes se abre desde Ajustes (o desde un aviso): con historial vuelve a donde estabas; sin él, a Ajustes.
  const isPending = pathname === '/pendientes';

  if (isSettingsChild || isExpense || isCards || isSavings || isPending) {
    if (canGoBack) return { type: 'back' };
    // Sin historial (p. ej. se abrió desde un aviso): a la pantalla padre. Una cuenta de ahorro vuelve a la lista de cuentas.
    if (isSettingsChild || isPending) return { type: 'goto', to: '/ajustes' };
    return { type: 'goto', to: isSavingsAccount ? '/ahorros' : '/' };
  }
  if (pathname !== '/' && pathname !== '') return { type: 'goto', to: '/' };
  return { type: 'exit' };
}
