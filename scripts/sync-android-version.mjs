/**
 * Sincroniza la versión de `package.json` con el proyecto Android generado por Capacitor.
 * Se ejecuta como parte de `npm run android:sync` (local) y del workflow de release en CI,
 * siempre después de `cap add android` / `cap sync android`.
 *
 *   node scripts/sync-android-version.mjs
 *
 * Ajusta en android/app/build.gradle:
 *   - versionName: el mismo string semántico de package.json (ej. "1.2.3", o "1.2.3-beta.1").
 *   - versionCode: entero que Google Play exige siempre creciente. Se calcula a partir del semver como
 *     major*1_000_000 + minor*1_000 + patch (hasta 999 en minor y patch, de sobra para esta app).
 *     Una prerelease (ej. "-beta.1") usa el mismo código que su base; no debe subirse a producción así.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gradlePath = resolve('android/app/build.gradle');
if (!existsSync(gradlePath)) {
  console.error('[version] No existe android/build.gradle. Ejecuta primero: npm run android:add');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const versionName = pkg.version;
const match = versionName.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!match) {
  console.error(`[version] "${versionName}" en package.json no es un semver válido (MAJOR.MINOR.PATCH).`);
  process.exit(1);
}

const [, majorStr, minorStr, patchStr] = match;
const major = Number(majorStr);
const minor = Number(minorStr);
const patch = Number(patchStr);

if (minor > 999 || patch > 999) {
  console.error('[version] minor o patch superan 999: hay que ajustar el esquema de versionCode.');
  process.exit(1);
}

const versionCode = major * 1_000_000 + minor * 1_000 + patch;

let gradle = readFileSync(gradlePath, 'utf8');
const original = gradle;

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

if (gradle === original) {
  console.log(`[version] android/app/build.gradle ya estaba en ${versionName} (code ${versionCode}).`);
} else {
  writeFileSync(gradlePath, gradle);
  console.log(`[version] android/app/build.gradle → versionName "${versionName}", versionCode ${versionCode}.`);
}
