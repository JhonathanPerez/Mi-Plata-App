/**
 * Prepara los assets que jeep-sqlite necesita en el navegador (`npm run dev`).
 * En Android NO se usan: allí SQLite es nativo.
 *
 * El .wasm debe ser EXACTAMENTE el que espera el sql.js que jeep-sqlite trae dentro.
 * Si no coinciden, el navegador falla con:
 *   "LinkError: WebAssembly.instantiate(): Import ... requires a callable".
 * Por eso se busca primero dentro de jeep-sqlite y solo como último recurso en sql.js.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const targetDir = resolve('public/assets');

function findWasm(dir, depth = 0) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < 6) found.push(...findWasm(full, depth + 1));
    } else if (entry.name.endsWith('.wasm')) {
      found.push(full);
    }
  }
  return found;
}

const candidates = [
  ...findWasm(resolve('node_modules/jeep-sqlite')),
  ...findWasm(resolve('node_modules/sql.js')),
];

if (candidates.length === 0) {
  console.warn('[copy-sql-wasm] No encontré ningún .wasm. ¿Falta ejecutar npm install?');
  process.exit(0);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });

const copied = new Set();
for (const file of candidates) {
  const name = basename(file);
  if (copied.has(name)) continue; // el primero gana: jeep-sqlite antes que sql.js
  copied.add(name);
  copyFileSync(file, join(targetDir, name));
  console.log(`[copy-sql-wasm] ${name} (${(statSync(file).size / 1024).toFixed(0)} KB) ← ${file.replace(process.cwd() + '/', '')}`);
}
