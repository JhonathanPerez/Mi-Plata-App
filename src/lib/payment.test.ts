import { describe, expect, it } from 'vitest';
import { defaultIconForType, describePaymentMethod, methodKindLabel, statusHint } from './payment';

describe('describePaymentMethod', () => {
  it('muestra el tipo y, si existen, los últimos 4 dígitos', () => {
    expect(describePaymentMethod('cash', null)).toBe('Efectivo');
    expect(describePaymentMethod('credit_card', '1234')).toBe('Tarjeta de crédito · ••••\u00a01234');
    expect(describePaymentMethod('debit_card', null)).toBe('Tarjeta débito');
  });
});

describe('statusHint', () => {
  it('explica el estado según el método de pago', () => {
    expect(statusHint(false, 'credit_card')).toBe('Por pagar hasta que pagues el extracto');
    expect(statusHint(true, 'credit_card')).toBe('Ya pagado: no sale en «Pagar tarjeta»');
    expect(statusHint(true, 'cash')).toBe('Pagado. Cámbialo si fue fiado');
    expect(statusHint(true, null)).toBe('Pagado. Cámbialo si fue fiado');
  });
  it('«Por pagar» solo habla del extracto con tarjeta de crédito', () => {
    expect(statusHint(false, 'cash')).toBe('Por pagar hasta que lo marques como pagado');
    expect(statusHint(false, 'debit_card')).toBe('Por pagar hasta que lo marques como pagado');
    expect(statusHint(false, null)).toBe('Por pagar hasta que lo marques como pagado');
  });
  it('nunca pasa de 70 caracteres', () => {
    for (const paid of [true, false]) {
      for (const type of ['credit_card', 'cash', null] as const) {
        expect(statusHint(paid, type).length).toBeLessThanOrEqual(70);
      }
    }
  });
});

describe('methodKindLabel', () => {
  it('muestra el tipo cuando el nombre no lo dice', () => {
    expect(methodKindLabel('Davibank', 'credit_card')).toBe('Tarjeta de crédito');
    expect(methodKindLabel('Mi débito', 'debit_card')).toBe('Tarjeta débito');
    expect(methodKindLabel('Billetera', 'cash')).toBe('Efectivo');
  });
  it('lo omite si repite el nombre, sin importar mayúsculas ni tildes', () => {
    expect(methodKindLabel('Efectivo', 'cash')).toBeNull();
    expect(methodKindLabel(' EFECTIVO ', 'cash')).toBeNull();
    expect(methodKindLabel('Tarjeta debito', 'debit_card')).toBeNull();
  });
  it('lo omite para el tipo «Otro»', () => {
    expect(methodKindLabel('Transferencia', 'other')).toBeNull();
  });
});

describe('defaultIconForType', () => {
  it('propone un icono según el tipo', () => {
    expect(defaultIconForType('cash')).toBe('💵');
    expect(defaultIconForType('credit_card')).toBe('💳');
    expect(defaultIconForType('debit_card')).toBe('💳');
    expect(defaultIconForType('other')).toBe('🏦');
  });
});
