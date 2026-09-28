/**
 * Aplica el icono y la pantalla de arranque de Mi Plata al proyecto Android generado por Capacitor.
 * Sin dependencias. Es seguro ejecutarlo varias veces.
 *
 *   node scripts/apply-android-icon.mjs
 *
 * Qué hace:
 *  1. Borra los iconos por defecto (png/webp) para que no choquen con los nuevos.
 *  2. Copia assets/android-res/ dentro de android/app/src/main/res/
 *     (icono clásico, icono adaptativo, icono con tema de Android 13+, fondo y pantalla de arranque).
 *  3. Cambia el tema de arranque para usar el fondo esmeralda con el logo (en vez del logo de Capacitor).
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const res = resolve('android/app/src/main/res');
const source = resolve('assets/android-res');

if (!existsSync(res)) {
  console.error('[icono] No existe android/. Ejecuta primero: npm run android:add');
  process.exit(1);
}
if (!existsSync(source)) {
  console.error('[icono] Falta assets/android-res/. Ejecuta: node scripts/generate-icons.mjs (requiere sharp)');
  process.exit(1);
}

// 1) Quitar iconos anteriores (evita "Duplicate resources" entre .png y .webp).
const OLD_ICON = /^ic_launcher(_round|_foreground|_background|_monochrome)?\.(png|webp|xml)$/;
let removed = 0;
for (const dir of readdirSync(res)) {
  if (!dir.startsWith('mipmap-')) continue;
  for (const file of readdirSync(join(res, dir))) {
    if (OLD_ICON.test(file)) {
      rmSync(join(res, dir, file));
      removed += 1;
    }
  }
}

// 2) Copiar los recursos nuevos.
cpSync(source, res, { recursive: true, force: true });

// 3) Pantalla de arranque de marca.
const stylesPath = join(res, 'values/styles.xml');
let splashNote = 'no se encontró values/styles.xml (la pantalla de arranque no se cambió)';
if (existsSync(stylesPath)) {
  const original = readFileSync(stylesPath, 'utf8');
  let xml = original.replace(/@drawable\/splash(?!\w)/g, '@drawable/splash_brand');

  // En Android 12+ el sistema pinta su propio splash: se le pone el mismo color de fondo.
  const launchStyle = /(<style\s+name="AppTheme\.NoActionBarLaunch"[^>]*parent="Theme\.SplashScreen"[^>]*>)/;
  if (launchStyle.test(xml) && !xml.includes('windowSplashScreenBackground')) {
    xml = xml.replace(
      launchStyle,
      '$1\n        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>',
    );
  }

  if (xml !== original) {
    writeFileSync(stylesPath, xml);
    splashNote = 'tema de arranque actualizado';
  } else if (xml.includes('splash_brand')) {
    splashNote = 'tema de arranque ya estaba actualizado';
  } else {
    splashNote =
      'no reconocí styles.xml; en el estilo AppTheme.NoActionBarLaunch cambia @drawable/splash por @drawable/splash_brand';
  }
}

console.log(`[icono] ${removed} iconos anteriores eliminados, recursos nuevos copiados; ${splashNote}.`);
console.log('[icono] Ahora ejecuta: npm run android:sync y vuelve a compilar la app.');
