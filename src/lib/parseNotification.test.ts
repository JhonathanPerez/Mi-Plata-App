import { describe, expect, it } from 'vitest';
import { displayText, fingerprintOf, parseCapture, type ParsedCapture } from './parseNotification';

const NU = 'com.nu.production';
const SMS = 'com.google.android.apps.messaging';

function ok(pkg: string, title: string, text: string): ParsedCapture {
  const result = parseCapture({ pkg, title, text });
  if (!result.ok) throw new Error(`Se esperaba un gasto pero falló (${result.reason}): ${text}`);
  return result.value;
}

function fails(pkg: string, title: string, text: string) {
  const result = parseCapture({ pkg, title, text });
  if (result.ok) throw new Error(`Se esperaba que NO fuera un gasto: ${text}`);
  return result.reason;
}

describe('parseCapture: compras', () => {
  it('notificación de Nu: valor, comercio, banco y tarjeta', () => {
    const value = ok(NU, 'Compra aprobada', 'Pagaste $25.000 en RAPPI con tu tarjeta terminada en 1234');
    expect(value).toEqual({ amount: 25000, merchant: 'Rappi', bank: 'nubank', last4: '1234' });
  });

  it('redacción alternativa de Nu', () => {
    const value = ok(NU, 'Nu', 'Tu compra de $1.250.000 en Mercado Libre fue aprobada');
    expect(value.amount).toBe(1250000);
    expect(value.merchant).toBe('Mercado Libre');
  });

  it('el banco se toma de la app aunque el texto no lo diga', () => {
    expect(ok(NU, '', 'Compra de $9.900 en Spotify').bank).toBe('nubank');
  });

  it('SMS estilo Bancolombia', () => {
    const value = ok(
      SMS,
      'Bancolombia',
      'Bancolombia le informa Compra por $52.900 en MERCADO LIBRE COLOMBIA T.Cre *1234, 19/09/2026 at 10:05. Inquietudes al 018000931987',
    );
    expect(value).toEqual({ amount: 52900, merchant: 'Mercado Libre Colombia', bank: 'bancolombia', last4: '1234' });
  });

  it('SMS estilo Davivienda / Davibank', () => {
    const value = ok(SMS, 'Davivienda', 'Davivienda: Compra Aprobada por $18.500 en EXITO SUBA Tarjeta *5678 el 19/09/2026 a las 14:32');
    expect(value).toEqual({ amount: 18500, merchant: 'Exito Suba', bank: 'davivienda', last4: '5678' });
  });

  it('el comercio termina antes de la fecha y la hora', () => {
    expect(ok(SMS, '', 'Compra por $30.000 en Tienda D1 el 19/09/2026 a las 14:32').merchant).toBe('Tienda D1');
    expect(ok(SMS, '', 'Compra por $30.000 en Tienda D1 el sábado a las 14:32').merchant).toBe('Tienda D1');
  });

  it('ignora "en 3 cuotas" y toma el comercio real', () => {
    expect(ok(NU, '', 'Compra aprobada en 3 cuotas por $150.000 en FALABELLA').merchant).toBe('Falabella');
  });

  it('"en proceso" no es un comercio', () => {
    expect(ok(NU, '', 'Compra en proceso por $25.000 en RAPPI').merchant).toBe('Rappi');
  });

  it('quita el prefijo de pasarelas de pago', () => {
    expect(ok(SMS, '', 'Compra $30.000 en PAYU *UBER TRIP').merchant).toBe('Uber Trip');
  });

  it('sin comercio reconocible, queda vacío pero se conserva el valor', () => {
    const value = ok(SMS, '', 'Compra por $12.000');
    expect(value.amount).toBe(12000);
    expect(value.merchant).toBeNull();
  });

  it('título y cuerpo en líneas separadas', () => {
    const value = ok(NU, 'Compra aprobada', '$25.000 en Rappi\nCupo disponible: $1.000.000');
    expect(value.amount).toBe(25000);
    expect(value.merchant).toBe('Rappi');
  });

  it('pagos y transferencias a personas', () => {
    expect(ok(SMS, '', 'Transferiste $80.000 a Juan Pérez').merchant).toBe('Juan Pérez');
    expect(ok(NU, '', 'Pagaste $15.000 a Panadería Central').merchant).toBe('Panadería Central');
  });

  it('retiros en cajero', () => {
    const value = ok(SMS, 'Bancolombia', 'Retiro en cajero por $200.000 en ATM CALLE 80');
    expect(value.amount).toBe(200000);
    expect(value.merchant).toBe('Atm Calle 80');
  });

  it('tarjeta con asteriscos y otras formas de escribirla', () => {
    expect(ok(SMS, '', 'Compra $10.000 en TIENDA tarjeta ****4321').last4).toBe('4321');
    expect(ok(SMS, '', 'Compra $10.000 en TIENDA con tarjeta terminada en 8765').last4).toBe('8765');
    expect(ok(SMS, '', 'Compra $10.000 en TIENDA').last4).toBeNull();
  });

  it('el banco se deduce del remitente antes que del texto', () => {
    expect(ok(SMS, 'Bancolombia', 'Transferiste $20.000 a tu cuenta Nequi').bank).toBe('bancolombia');
    expect(ok(SMS, '85540', 'Nequi: pagaste $12.000 en TIENDA').bank).toBe('nequi');
    expect(ok(SMS, '85540', 'Compra por $12.000 en TIENDA').bank).toBeNull();
  });
});

describe('parseCapture: formatos de valor', () => {
  it('separador de miles con punto, coma o sin separador', () => {
    expect(ok(SMS, '', 'Compra por $1.250.000 en EXITO').amount).toBe(1250000);
    expect(ok(SMS, '', 'Compra por $1,250,000 en EXITO').amount).toBe(1250000);
    expect(ok(SMS, '', 'Compra por $25000 en EXITO').amount).toBe(25000);
    expect(ok(SMS, '', 'Compra por $ 25.000 en EXITO').amount).toBe(25000);
  });

  it('descarta los decimales en pesos', () => {
    expect(ok(SMS, '', 'Compra por $25.000,00 en EXITO').amount).toBe(25000);
  });

  it('COP y "pesos"', () => {
    expect(ok(SMS, '', 'Pago por COP 45.000 en NETFLIX').amount).toBe(45000);
    expect(ok(SMS, '', 'Compraste 45.000 pesos en ZARA').amount).toBe(45000);
  });

  it('salta saldos y cupos y toma el valor del gasto', () => {
    expect(ok(NU, '', 'Compra $25.000 en RAPPI. Cupo disponible $1.200.000').amount).toBe(25000);
    expect(ok(SMS, '', 'Saldo disponible $500.000. Compra por $30.000 en TIENDA D1').amount).toBe(30000);
  });
});

describe('parseCapture: mensajes sin signo $', () => {
  it('"compra por 25.000 en COMERCIO" (el caso típico)', () => {
    const value = ok(SMS, '', 'Compra por 25.000 en Rappi');
    expect(value.amount).toBe(25000);
    expect(value.merchant).toBe('Rappi');
  });

  it('separadores de miles con punto, coma o sin separador', () => {
    expect(ok(SMS, '', 'Compra por 1.250.000 en EXITO').amount).toBe(1250000);
    expect(ok(SMS, '', 'Compra por 1,250,000 en EXITO').amount).toBe(1250000);
    expect(ok(SMS, '', 'Compra por 25000 en EXITO').amount).toBe(25000);
    expect(ok(SMS, '', 'Compra por 25.000,00 en EXITO').amount).toBe(25000);
  });

  it('el valor sin separador se reconoce por la palabra de gasto que lo precede', () => {
    expect(ok(NU, '', 'Tu compra de 25000 en RAPPI fue aprobada').amount).toBe(25000);
    expect(ok(SMS, '', 'Compraste 45000 en ZARA').amount).toBe(45000);
    expect(ok(SMS, '', 'Pagaste 15000 a Panadería Central').merchant).toBe('Panadería Central');
    expect(ok(SMS, '', 'Compra en TIENDA D1. Valor: 30000').amount).toBe(30000);
  });

  it('el punto final de la frase no es parte del valor', () => {
    expect(ok(SMS, '', 'Realizaste una compra por 25.000.').amount).toBe(25000);
  });

  it('SMS estilo Bancolombia sin $', () => {
    const value = ok(
      SMS,
      'Bancolombia',
      'Bancolombia le informa Compra por 52.900 en MERCADO LIBRE COLOMBIA T.Cre *1234, 19/09/2026 at 10:05. Inquietudes al 018000931987',
    );
    expect(value).toEqual({ amount: 52900, merchant: 'Mercado Libre Colombia', bank: 'bancolombia', last4: '1234' });
  });

  it('salta saldos y cupos escritos sin $', () => {
    expect(ok(NU, '', 'Compra por 25.000 en RAPPI. Cupo disponible 1.200.000').amount).toBe(25000);
    expect(ok(SMS, '', 'Saldo disponible 500.000. Compra por 30.000 en TIENDA D1').amount).toBe(30000);
  });

  it('si hay un valor con $, ese sigue teniendo prioridad', () => {
    expect(ok(SMS, '', 'Compra por $30.000 en TIENDA. Ref 123.456').amount).toBe(30000);
  });

  it('no confunde fechas, horas, tarjetas ni teléfonos con el valor', () => {
    expect(fails(SMS, '', 'Compra aprobada el 19/09/2026 a las 10:05 tarjeta *1234')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra aprobada el 21 de septiembre de 2026 con tarjeta terminada en 1234')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra aprobada. Inquietudes al 018000931987')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra aprobada 19.09.2026')).toBe('no-amount');
  });

  it('no toma saldos, dólares ni puntos sin $', () => {
    expect(fails(SMS, '', 'Tu saldo es 500.000')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra por US$ 25.000 en AMAZON')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra por 25.00 en STEAM')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra en 3 cuotas aprobada')).toBe('no-amount');
    expect(fails(NU, '', 'Compra aprobada, acumulaste 1.500 puntos')).toBe('no-amount');
  });

  it('sigue descartando ingresos, códigos y avisos sin $', () => {
    expect(fails(SMS, '', 'Recibiste 50.000 de Juan Pérez')).toBe('income');
    expect(fails(SMS, '', 'Tu pago mínimo de 150.000 vence el 25/09')).toBe('ignored');
    expect(fails(SMS, '', 'Tu código de verificación es 123456')).toBe('ignored');
  });
});

describe('parseCapture: lo que NO es un gasto', () => {
  it('ingresos y devoluciones', () => {
    expect(fails(SMS, '', 'Recibiste $50.000 de Juan Pérez')).toBe('income');
    expect(fails(SMS, '', 'Te transfirieron $100.000 a tu cuenta')).toBe('income');
    expect(fails(NU, '', 'Reembolso de $25.000 por tu compra en RAPPI')).toBe('income');
  });

  it('pagos a tu propia tarjeta', () => {
    expect(fails(NU, '', 'Pagaste tu tarjeta $500.000')).toBe('income');
  });

  it('códigos de verificación', () => {
    expect(fails(SMS, '', 'Tu código de verificación es 123456')).toBe('ignored');
    expect(fails(SMS, '', 'Tu código para autorizar la transacción por $50.000 es 654321')).toBe('ignored');
    expect(fails(SMS, 'Bancolombia', 'Tu clave dinámica es 481516. Vence en 5 minutos')).toBe('ignored');
  });

  it('las advertencias al pie de una compra legítima no la descartan', () => {
    const value = ok(SMS, 'Bancolombia', 'Compra por $52.900 en EXITO. Nunca compartas tu clave ni códigos. No compartas tu token');
    expect(value.amount).toBe(52900);
    expect(value.merchant).toBe('Exito');
    expect(ok(SMS, '', 'Compra por $10.000 en TIENDA. Código de autorización: 123456').amount).toBe(10000);
  });

  it('publicidad y recordatorios', () => {
    expect(fails(NU, '', 'Aprovecha hasta $500.000 de cupo preaprobado')).toBe('ignored');
    expect(fails(NU, '', 'Tu pago mínimo de $150.000 vence el 25/09')).toBe('ignored');
  });

  it('compras rechazadas', () => {
    expect(fails(NU, '', 'Tu compra por $25.000 en RAPPI fue rechazada')).toBe('ignored');
  });

  it('precios en dólares o con centavos', () => {
    expect(fails(SMS, '', 'Compra por US$ 25.00 en AMAZON')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra por $9.99 en STEAM')).toBe('no-amount');
  });

  it('valores irrelevantes o demasiado pequeños', () => {
    expect(fails(SMS, '', 'Tu saldo es $500.000')).toBe('no-amount');
    expect(fails(SMS, '', 'Compra por $50')).toBe('no-amount');
  });

  it('texto con valor pero sin verbo de gasto', () => {
    expect(fails(NU, '', 'Hoy tienes $50.000 de descuento en tus favoritos')).toBe('not-expense');
  });
});

describe('fingerprintOf y displayText', () => {
  it('ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(fingerprintOf('Compra   por $25.000 en PANADERÍA')).toBe(fingerprintOf('compra por $25.000 en panaderia'));
  });

  it('textos distintos dan huellas distintas', () => {
    expect(fingerprintOf('Compra por $25.000 en Rappi')).not.toBe(fingerprintOf('Compra por $26.000 en Rappi'));
  });

  it('displayText une título y cuerpo sin espacios sobrantes', () => {
    expect(displayText({ title: ' Compra   aprobada ', text: 'Pagaste $25.000\nen Rappi' })).toBe(
      'Compra aprobada — Pagaste $25.000 en Rappi',
    );
    expect(displayText({ title: '', text: 'Solo cuerpo' })).toBe('Solo cuerpo');
  });
});
