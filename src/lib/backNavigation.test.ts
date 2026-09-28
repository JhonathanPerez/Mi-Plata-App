import { describe, expect, it } from 'vitest';
import { decideBackAction } from './backNavigation';
import { pushBackHandler, runTopBackHandler } from './backStack';

describe('decideBackAction', () => {
  it('en Inicio sale de la app', () => {
    expect(decideBackAction('/', false)).toEqual({ type: 'exit' });
    expect(decideBackAction('/', true)).toEqual({ type: 'exit' });
  });
  it('en otra pestaña vuelve a Inicio', () => {
    expect(decideBackAction('/gastos', true)).toEqual({ type: 'goto', to: '/' });
    expect(decideBackAction('/estadisticas', false)).toEqual({ type: 'goto', to: '/' });
    expect(decideBackAction('/ajustes', false)).toEqual({ type: 'goto', to: '/' });
  });
  it('en pantallas secundarias vuelve a la anterior', () => {
    expect(decideBackAction('/gasto/nuevo', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/ajustes/categorias', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/ajustes/captura', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/tarjetas', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/pendientes', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/tarjetas/pm_nubank/pagar', true)).toEqual({ type: 'back' });
    expect(decideBackAction('/tarjetas/pm_nubank/pagar', false)).toEqual({ type: 'goto', to: '/' });
  });
  it('sin historial, las secundarias van a su pantalla padre', () => {
    expect(decideBackAction('/gasto/abc', false)).toEqual({ type: 'goto', to: '/' });
    expect(decideBackAction('/ajustes/exportar', false)).toEqual({ type: 'goto', to: '/ajustes' });
    expect(decideBackAction('/pendientes', false)).toEqual({ type: 'goto', to: '/ajustes' });
  });
});

describe('pila de Atrás', () => {
  it('cierra primero lo último que se abrió', () => {
    const calls: string[] = [];
    const removeSheet = pushBackHandler(() => calls.push('panel'));
    const removeDialog = pushBackHandler(() => calls.push('diálogo'));
    expect(runTopBackHandler()).toBe(true);
    removeDialog();
    expect(runTopBackHandler()).toBe(true);
    removeSheet();
    expect(runTopBackHandler()).toBe(false);
    expect(calls).toEqual(['diálogo', 'panel']);
  });
});
