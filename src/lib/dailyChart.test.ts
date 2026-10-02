import { describe, expect, it } from 'vitest';
import { indexAtPosition, stepIndex } from './dailyChart';

describe('indexAtPosition', () => {
  it('reparte el ancho en partes iguales', () => {
    expect(indexAtPosition(0, 310, 31)).toBe(0);
    expect(indexAtPosition(9.9, 310, 31)).toBe(0);
    expect(indexAtPosition(10, 310, 31)).toBe(1);
    expect(indexAtPosition(155, 310, 31)).toBe(15);
  });
  it('no se sale del rango al arrastrar fuera del gráfico', () => {
    expect(indexAtPosition(-20, 310, 31)).toBe(0);
    expect(indexAtPosition(310, 310, 31)).toBe(30);
    expect(indexAtPosition(999, 310, 31)).toBe(30);
  });
  it('tolera entradas degeneradas', () => {
    expect(indexAtPosition(5, 0, 31)).toBe(0);
    expect(indexAtPosition(5, 310, 0)).toBe(0);
  });
});

describe('stepIndex', () => {
  it('avanza y retrocede de uno en uno', () => {
    expect(stepIndex(5, 'ArrowRight', 30)).toBe(6);
    expect(stepIndex(5, 'ArrowUp', 30)).toBe(6);
    expect(stepIndex(5, 'ArrowLeft', 30)).toBe(4);
    expect(stepIndex(5, 'ArrowDown', 30)).toBe(4);
  });
  it('se detiene en los extremos', () => {
    expect(stepIndex(0, 'ArrowLeft', 30)).toBe(0);
    expect(stepIndex(29, 'ArrowRight', 30)).toBe(29);
  });
  it('Inicio y Fin saltan a los extremos', () => {
    expect(stepIndex(12, 'Home', 30)).toBe(0);
    expect(stepIndex(12, 'End', 30)).toBe(29);
  });
  it('ignora otras teclas', () => {
    expect(stepIndex(3, 'Tab', 30)).toBeNull();
    expect(stepIndex(3, 'a', 30)).toBeNull();
  });
});
