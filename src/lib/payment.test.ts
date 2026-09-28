import { describe, expect, it } from 'vitest';
import { describePaymentMethod } from './payment';

describe('describePaymentMethod', () => {
  it('muestra el tipo y, si existen, los últimos 4 dígitos', () => {
    expect(describePaymentMethod('cash', null)).toBe('Efectivo');
    expect(describePaymentMethod('credit_card', '1234')).toBe('Tarjeta de crédito · ••••\u00a01234');
    expect(describePaymentMethod('debit_card', null)).toBe('Tarjeta débito');
  });
});
