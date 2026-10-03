// Endurece el proyecto Android generado por `cap add android`:
//  - Desactiva las copias de seguridad automáticas de Android (los datos financieros no salen del teléfono).
//  - Con --no-internet elimina además el permiso INTERNET (la app queda incapaz de usar la red). Ojo: sin Internet
//    «Comprobar actualizaciones» no puede consultar GitHub, así que la app ya no se podría actualizar desde dentro.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const removeInternet = process.argv.includes('--no-internet');

if (!existsSync(manifestPath)) {
  console.error('[harden-android] No existe android/. Ejecuta primero: npm run android:add');
  process.exit(1);
}

let xml = readFileSync(manifestPath, 'utf8');
const original = xml;

xml = xml.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');

if (removeInternet) {
  xml = xml.replace(/\s*<uses-permission android:name="android.permission.INTERNET"\s*\/>/, '');
}

if (xml !== original) {
  writeFileSync(manifestPath, xml);
  console.log('[harden-android] AndroidManifest.xml actualizado.');
} else {
  console.log('[harden-android] No hubo cambios (ya estaba endurecido).');
}
