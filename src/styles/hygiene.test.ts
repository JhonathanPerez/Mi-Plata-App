import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssFilesIn, sourceFiles } from './testHelpers';

/**
 * Higiene de los estilos:
 *  1. No hay `!important` (salvo en el bloque de `prefers-reduced-motion`, que debe ganarle a cualquier animación).
 *  2. No quedan clases definidas en el CSS que ningún componente use.
 *  3. Los nombres siguen BEM legible (`bloque`, `bloque__elemento`, `bloque--variante`), sin prefijos crípticos.
 *  4. `index.css` importa cada archivo dentro de una capa declarada, y esa lista es la misma que la de `index.html`.
 */
const ROOT = process.cwd();
const STYLES = join(ROOT, 'src/styles');
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssFiles = cssFilesIn(STYLES);

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
  // `@import ...;` y `@layer ...;` no tienen bloque: no son selectores.
  let out = stripComments(css).replace(/@(?:import|layer)[^{;]*;/g, '');
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

  it('las clases siguen BEM legible y no usan prefijos crípticos', () => {
    const BEM = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
    const CRYPTIC = /^(?:pv|pc|pp|cy|rl|rm|sw|st)-/;
    const bad = new Set<string>();
    for (const file of cssFiles) {
      for (const match of selectorsOnly(read(join(STYLES, file))).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        if (!BEM.test(match[1]) || CRYPTIC.test(match[1])) bad.add(`${file}: .${match[1]}`);
      }
    }
    expect([...bad]).toEqual([]);
  });
});

describe('capas (index.css)', () => {
  const declaredLayers = (css: string) => css.match(/@layer\s+([^;{]+);/)?.[1].replace(/\s+/g, ' ').trim();
  const index = stripComments(read(join(STYLES, 'index.css')));

  it('importa cada archivo CSS, una sola vez, dentro de una capa declarada', () => {
    const layers = (declaredLayers(index) ?? '').split(',').map((layer) => layer.trim());
    const imports = [...index.matchAll(/@import\s+'\.\/([^']+)'\s+layer\((\w+)\)/g)];
    expect(layers.length).toBeGreaterThan(1);
    for (const [, file, layer] of imports) expect(layers, file).toContain(layer);
    expect(imports.map(([, file]) => file).sort()).toEqual(cssFiles.filter((f) => f !== 'index.css').sort());
  });

  it('index.html declara las mismas capas (su splash va en la capa más débil)', () => {
    const html = read(join(ROOT, 'index.html'));
    expect(declaredLayers(html)).toBeDefined();
    expect(declaredLayers(html)).toBe(declaredLayers(index));
  });
});
