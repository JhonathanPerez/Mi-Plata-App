import { describe, expect, it } from 'vitest';
import { CAPTURE_NOTIFICATION_TITLE, captureNotificationBody } from './captureCopy';

describe('captureCopy', () => {
  it('el título anuncia el gasto detectado con el emoji de billete', () => {
    expect(CAPTURE_NOTIFICATION_TITLE).toBe('Nuevo gasto detectado 💵');
  });

  it('el cuerpo incluye el comercio cuando se reconoció', () => {
    expect(captureNotificationBody(25000, 'Rappi')).toBe('Nueva compra por $25.000 en Rappi. Abre Mi Plata para categorizarlo.');
    expect(captureNotificationBody(1250000, 'Mercado Libre')).toBe(
      'Nueva compra por $1.250.000 en Mercado Libre. Abre Mi Plata para categorizarlo.',
    );
  });

  it('sin comercio (null, vacío o solo espacios) muestra solo el valor', () => {
    const solo = 'Nueva compra por $25.000. Abre Mi Plata para categorizarlo.';
    expect(captureNotificationBody(25000, null)).toBe(solo);
    expect(captureNotificationBody(25000, undefined)).toBe(solo);
    expect(captureNotificationBody(25000, '')).toBe(solo);
    expect(captureNotificationBody(25000, '   ')).toBe(solo);
  });

  it('el cuerpo incluye el valor de la compra formateado en pesos', () => {
    expect(captureNotificationBody(25000)).toBe('Nueva compra por $25.000. Abre Mi Plata para categorizarlo.');
    expect(captureNotificationBody(1250000)).toBe('Nueva compra por $1.250.000. Abre Mi Plata para categorizarlo.');
    expect(captureNotificationBody(350)).toBe('Nueva compra por $350. Abre Mi Plata para categorizarlo.');
  });
});
