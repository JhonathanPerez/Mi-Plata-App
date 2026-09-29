import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './testHelpers';

/**
 * Higiene de los estilos:
 *  1. No hay `!important` (salvo en el bloque de `prefers-reduced-motion`, que debe ganarle a cualquier animación).
 *  2. No quedan clases definidas en el CSS que ningún componente use.
 */
const ROOT = process.cwd();
const STYLES = join(ROOT, 'src/styles');
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssFiles = readdirSync(STYLES).filter((f) => f.endsWith('.css'));

/** Quita todos los bloques que empiezan por `header` (p. ej. `@media ...`), con sus llaves anidadas. */
function withoutBlocks(css: string, header: string): string {
  let out = css;
  for (let start = out.indexOf(header); start >= 0; start = out.indexOf(header)) {
    let depth = 0;
    let end = -1;
    for (let i = out.indexOf('{', start); i < out.length; i++) {
      if (out[i] === '{') depth++;
      if (out[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error(`bloque sin cerrar: ${header}`);
    out = out.slice(0, start) + out.slice(end + 1);
  }
  return out;
}

/** Solo los selectores: se vacían los bloques de declaraciones, de dentro hacia afuera. */
function selectorsOnly(css: string): string {
  let out = stripComments(css);
  for (let previous = ''; previous !== out; ) {
    previous = out;
    out = out.replace(/\{[^{}]*\}/g, '');
  }
  return out;
}

describe('estilos', () => {
  it('no usa !important fuera de prefers-reduced-motion', () => {
    for (const file of cssFiles) {
      const css = withoutBlocks(stripComments(read(join(STYLES, file))), '@media (prefers-reduced-motion: reduce)');
      expect(css, file).not.toContain('!important');
    }
  });

  it('todas las clases del CSS se usan en algún componente', () => {
    const source = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'index.html')].map(read).join('\n');
    const orphans = new Set<string>();
    for (const file of cssFiles) {
      for (const match of selectorsOnly(read(join(STYLES, file))).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        const name = match[1];
        const literal = new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(source);
        // Variantes que se arman en ejecución: `btn--${variant}`, `toast--${kind}`…
        const dynamic = name.includes('--') && source.includes(`${name.split('--')[0]}--\${`);
        if (!literal && !dynamic) orphans.add(`${file}: .${name}`);
      }
    }
    expect([...orphans]).toEqual([]);
  });
});
