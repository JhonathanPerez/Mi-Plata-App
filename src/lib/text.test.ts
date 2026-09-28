import { describe, expect, it } from 'vitest';
import { isEmoji, lastGrapheme, normalizeText } from './text';

describe('emojis', () => {
  it('reconoce emojis de varios tipos', () => {
    for (const e of ['🐶', '❤️', '👩‍💻', '🇨🇴', '1️⃣', '🧑🏽']) expect(isEmoji(e)).toBe(true);
  });
  it('rechaza texto normal', () => {
    for (const e of ['a', '7', 'Ñ', '$', '']) expect(isEmoji(e)).toBe(false);
  });
  it('toma el último emoji escrito, completo', () => {
    expect(lastGrapheme('🐶🐱')).toBe('🐱');
    expect(lastGrapheme('🍔👩‍💻')).toBe('👩‍💻');
    expect(lastGrapheme('🇨🇴')).toBe('🇨🇴');
    expect(lastGrapheme('  ')).toBe('');
  });
});

describe('normalizeText', () => {
  it('quita tildes y mayúsculas', () => {
    expect(normalizeText('  ALIMENTACIÓN ')).toBe('alimentacion');
  });
});
