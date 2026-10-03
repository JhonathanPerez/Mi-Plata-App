import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS } from '@/config/constants';
import { cardScrim, whiteTextContrast } from './cardColor';

describe('capa oscura de la tarjeta de crédito', () => {
  it('los 12 colores de la paleta alcanzan 4.5:1 con texto blanco', () => {
    for (const color of CATEGORY_COLORS) {
      expect(whiteTextContrast(color, cardScrim(color)), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('un color oscuro conserva la capa base y uno claro necesita más', () => {
    expect(cardScrim('#4C5C68')).toBe(0.4);
    expect(cardScrim('#E9C46A')).toBeGreaterThan(cardScrim('#E4572E'));
    expect(cardScrim('#E9C46A')).toBeLessThanOrEqual(0.75);
  });

  it('una entrada inválida usa la capa base', () => {
    expect(cardScrim('rojo')).toBe(0.4);
  });
});
