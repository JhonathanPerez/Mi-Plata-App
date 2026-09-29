import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssFilesIn, sourceFiles } from './testHelpers';

/**
 * Guardas del sistema de tokens (ver src/styles/tokens.css):
 *  1. Ninguna variable global se declara fuera de tokens.css.
 *  2. Los dos bloques del tema oscuro (data-theme y prefers-color-scheme) tienen los mismos valores.
 *  3. Toda var(--x) usada en el CSS existe en tokens.css (o se define localmente en su propia regla).
 *  4. El splash de index.html (que no puede leer tokens.css) usa los mismos colores.
 */
const ROOT = process.cwd();
const STYLES = join(ROOT, 'src/styles');
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const cssFiles = cssFilesIn(STYLES);
const tokens = stripComments(read(join(STYLES, 'tokens.css')));

/** Extrae `--nombre: valor` de un bloque, normalizando espacios. */
function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
}

/** Cuerpo del bloque `{ ... }` que empieza en el selector dado (soporta un nivel de anidado). */
function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no se encontró ${selector}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error(`bloque sin cerrar: ${selector}`);
}

describe('tokens.css', () => {
  it('es el único archivo que declara :root', () => {
    for (const file of cssFiles.filter((f) => f !== 'tokens.css')) {
      expect(stripComments(read(join(STYLES, file))), file).not.toMatch(/:root/);
    }
  });

  it('el tema oscuro por atributo y por preferencia del sistema tienen los mismos valores', () => {
    const byAttribute = declarations(blockAfter(tokens, ":root[data-theme='dark']"));
    const bySystem = declarations(blockAfter(tokens, '@media (prefers-color-scheme: dark)'));
    expect(Object.keys(byAttribute).length).toBeGreaterThan(5);
    expect(bySystem).toEqual(byAttribute);
  });

  it('todo token usado en el CSS está definido', () => {
    const defined = new Set(Object.keys(declarations(tokens)));
    // Variables que los componentes pasan con cssVars({ '--x': valor }): el valor solo se conoce en ejecución.
    for (const file of sourceFiles(join(ROOT, 'src'))) {
      for (const m of read(file).matchAll(/'(--[\w-]+)'\s*:/g)) defined.add(m[1]);
    }
    const missing: string[] = [];
    for (const file of cssFiles) {
      const css = stripComments(read(join(STYLES, file)));
      // Variables que una regla define para sí misma (p. ej. --size en un componente).
      const local = new Set(Object.keys(declarations(css)));
      for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(m[1]) && !local.has(m[1])) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('splash de index.html', () => {
  const html = read(join(ROOT, 'index.html'));
  const light = declarations(blockAfter(tokens, ':root {'));
  const dark = declarations(blockAfter(tokens, ":root[data-theme='dark']"));
  const hex = (value: string | undefined) => (value ?? '').toLowerCase();
  const splashHasColor = (color: string) => html.toLowerCase().includes(hex(color));

  it('usa la paleta clara de los tokens', () => {
    for (const name of ['--bg', '--surface-2', '--ink', '--ink-2', '--primary', '--hero-bg']) {
      expect(splashHasColor(light[name]), `${name} (${light[name]})`).toBe(true);
    }
  });

  it('usa la paleta oscura de los tokens', () => {
    for (const name of ['--bg', '--surface-2', '--ink', '--ink-2', '--primary', '--hero-bg']) {
      expect(splashHasColor(dark[name]), `${name} (${dark[name]})`).toBe(true);
    }
  });
});
