import { describe, expect, it } from 'vitest';
import {
  buildLearnedPromoPattern,
  extractCandidatePhrases,
  hasRoomToLearn,
  phrasesAboveThreshold,
  REPORT_THRESHOLD,
} from './spamLearning';

describe('extractCandidatePhrases', () => {
  it('saca frases de 2 a 4 palabras, sin números ni palabras de ruido', () => {
    const phrases = extractCandidatePhrases('Nu: Disfruta 20% de descuento en tu proxima compra con el codigo VERANO');
    expect(phrases).toContain('disfruta descuento');
    expect(phrases).toContain('proxima compra');
    expect(phrases.some((p) => /\d/.test(p))).toBe(false);
    expect(phrases.some((p) => p.includes('20'))).toBe(false);
  });

  it('dos mensajes distintos con la misma promo comparten al menos una frase', () => {
    const a = extractCandidatePhrases('Bancolombia: Aprovecha esta oferta exclusiva solo por hoy, hasta 40% de descuento');
    const b = extractCandidatePhrases('Bancolombia: No te pierdas esta oferta exclusiva, compra ya y ahorra');
    expect(a.some((p) => b.includes(p))).toBe(true);
  });

  it('un mensaje corto no produce frases (menos de 2 palabras útiles)', () => {
    expect(extractCandidatePhrases('Hola')).toEqual([]);
    expect(extractCandidatePhrases('123 456')).toEqual([]);
  });
});

describe('phrasesAboveThreshold / buildLearnedPromoPattern', () => {
  it('solo cuentan las frases con suficientes reportes distintos', () => {
    const rows = [
      { phrase: 'oferta exclusiva', reportCount: REPORT_THRESHOLD },
      { phrase: 'una sola vez', reportCount: 1 },
    ];
    expect(phrasesAboveThreshold(rows)).toEqual(['oferta exclusiva']);
  });

  it('sin frases aprendidas no hay patrón', () => {
    expect(buildLearnedPromoPattern([])).toBeNull();
  });

  it('el patrón reconoce la frase con cualquier espacio entre palabras y no confunde palabras sueltas', () => {
    const pattern = buildLearnedPromoPattern(['oferta exclusiva']);
    expect(pattern?.test('normalizado oferta   exclusiva hoy')).toBe(true);
    expect(pattern?.test('esto no es una oferta cualquiera')).toBe(false);
  });

  it('varias frases aprendidas se reconocen con un solo patrón', () => {
    const pattern = buildLearnedPromoPattern(['oferta exclusiva', 'compra ya']);
    expect(pattern?.test('mensaje: compra ya y ahorra')).toBe(true);
    expect(pattern?.test('mensaje sin ninguna de las dos frases')).toBe(false);
  });
});

describe('hasRoomToLearn', () => {
  it('hay espacio por debajo del máximo y no lo hay al llegar a él', () => {
    expect(hasRoomToLearn(0)).toBe(true);
    expect(hasRoomToLearn(299)).toBe(true);
    expect(hasRoomToLearn(300)).toBe(false);
  });
});
