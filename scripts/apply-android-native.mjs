/**
 * Instala en el proyecto Android generado por Capacitor el código nativo de la captura automática de gastos
 * (lector de notificaciones) y los permisos del bloqueo biométrico. Sin dependencias. Seguro de repetir.
 *
 *   node scripts/apply-android-native.mjs
 *
 * Qué hace:
 *  1. Copia native/android/*.java a android/app/src/main/java/<tu appId>/ (ajustando el `package`).
 *  2. AndroidManifest.xml: declara el servicio CaptureListenerService y el permiso USE_BIOMETRIC.
 *  3. MainActivity.java: registra el plugin NotificationCapture.
 *  4. Avisos de pago: permiso POST_NOTIFICATIONS (Android 13+) e ícono res/drawable/ic_stat_miplata.xml.
 *  5. Actualizaciones desde la app: permiso REQUEST_INSTALL_PACKAGES, FileProvider «.updates» y res/xml/update_paths.xml
 *     (los usa AppUpdatePlugin.java para entregarle el APK descargado al instalador de Android).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const androidDir = resolve('android');
const manifestPath = join(androidDir, 'app/src/main/AndroidManifest.xml');
const sourceDir = resolve('native/android');

if (!existsSync(manifestPath)) {
  console.error('[nativo] No existe android/. Ejecuta primero: npm run android:add');
  process.exit(1);
}

// appId (= package de Java) desde capacitor.config.ts
const config = readFileSync(resolve('capacitor.config.ts'), 'utf8');
const appId = config.match(/appId:\s*['"]([^'"]+)['"]/)?.[1];
if (!appId) {
  console.error('[nativo] No pude leer appId en capacitor.config.ts');
  process.exit(1);
}

const javaRoot = join(androidDir, 'app/src/main/java');
const packageDir = join(javaRoot, ...appId.split('.'));
mkdirSync(packageDir, { recursive: true });

const changes = [];

// 1) Copiar las clases Java. MainActivity solo se toca más abajo.
for (const file of readdirSync(sourceDir).filter((name) => name.endsWith('.java') && name !== 'MainActivity.java')) {
  const target = join(packageDir, file);
  const code = readFileSync(join(sourceDir, file), 'utf8').replaceAll('__PACKAGE__', appId);
  if (!existsSync(target) || readFileSync(target, 'utf8') !== code) {
    writeFileSync(target, code);
    changes.push(`copiado ${file}`);
  }
}

// 2) Manifiesto
let xml = readFileSync(manifestPath, 'utf8');
const originalXml = xml;

if (!xml.includes('CaptureListenerService')) {
  const service = `
        <!-- Lector de notificaciones de la captura automática de gastos (ver README ▸ Captura automática de gastos). -->
        <service
            android:name="${appId}.CaptureListenerService"
            android:exported="true"
            android:label="Mi Plata"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
`;
  xml = xml.replace('</application>', `${service}    </application>`);
}
if (!xml.includes('PendingReminderReceiver')) {
  const receiver = `
        <!-- Recordatorio de gastos por categorizar cuando la app está cerrada. -->
        <receiver android:name="${appId}.PendingReminderReceiver" android:exported="false" />
`;
  xml = xml.replace('</application>', `${receiver}    </application>`);
}
if (!xml.includes('android.permission.USE_BIOMETRIC')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.USE_BIOMETRIC" />\n</manifest>');
}
// Para que "Elegir apps" (listApps) pueda ver otras apps instaladas: en Android 11+, sin esto
// PackageManager solo devuelve un puñado de apps del sistema.
if (!xml.includes('<queries>')) {
  const queries = `
    <queries>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
`;
  xml = xml.replace('</manifest>', `${queries}</manifest>`);
}
// Avisos de pago (notificaciones locales). En Android 13+ el permiso se pide en tiempo de ejecución.
if (!xml.includes('android.permission.POST_NOTIFICATIONS')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>');
}
// Alarmas exactas (Android 12+): sin este permiso Android agrupa y retrasa los avisos (a veces horas), y el recordatorio
// de gastos pendientes cada 30 min no llega a tiempo. El usuario lo concede en «Alarmas y recordatorios» (la app lo guía).
if (!xml.includes('android.permission.SCHEDULE_EXACT_ALARM')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n</manifest>');
}
// Actualizaciones: instalar el APK descargado exige este permiso (en Android 8+ la persona lo concede a la app en «Instalar apps
// desconocidas»; la app la guía) y un FileProvider propio que solo expone la carpeta cache/updates/.
if (!xml.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>');
}
if (!xml.includes('@xml/update_paths')) {
  const provider = `
        <!-- Entrega el APK descargado al instalador de Android (ver AppUpdatePlugin.java). Solo comparte cache/updates/. -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${appId}.updates"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_paths" />
        </provider>
`;
  xml = xml.replace('</application>', `${provider}    </application>`);
}
if (xml !== originalXml) {
  writeFileSync(manifestPath, xml);
  changes.push('AndroidManifest.xml actualizado');
}

// 3b) Ícono pequeño de las notificaciones
const drawableDir = join(androidDir, 'app/src/main/res/drawable');
mkdirSync(drawableDir, { recursive: true });
const iconSource = readFileSync(join(sourceDir, 'res/ic_stat_miplata.xml'), 'utf8');
const iconTarget = join(drawableDir, 'ic_stat_miplata.xml');
if (!existsSync(iconTarget) || readFileSync(iconTarget, 'utf8') !== iconSource) {
  writeFileSync(iconTarget, iconSource);
  changes.push('ícono de avisos ic_stat_miplata.xml');
}

// 3a) Carpeta compartida del FileProvider de actualizaciones
const xmlDir = join(androidDir, 'app/src/main/res/xml');
mkdirSync(xmlDir, { recursive: true });
const pathsSource = readFileSync(join(sourceDir, 'res/update_paths.xml'), 'utf8');
const pathsTarget = join(xmlDir, 'update_paths.xml');
if (!existsSync(pathsTarget) || readFileSync(pathsTarget, 'utf8') !== pathsSource) {
  writeFileSync(pathsTarget, pathsSource);
  changes.push('update_paths.xml');
}

// 3) MainActivity: registrar los plugins propios antes de super.onCreate()
function findMainActivity(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry === 'MainActivity.java') {
      return full;
    }
  }
  return null;
}

const PLUGINS = ['NotificationCapturePlugin', 'AppUpdatePlugin'];

const mainPath = findMainActivity(javaRoot);
if (!mainPath) {
  console.warn(`[nativo] No encontré MainActivity.java. Agrega registerPlugin(X.class) antes de super.onCreate() para: ${PLUGINS.join(', ')}.`);
} else {
  let main = readFileSync(mainPath, 'utf8');
  const missing = PLUGINS.filter((plugin) => !main.includes(plugin));
  if (missing.length > 0) {
    const isDefault = /public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(main);
    const onCreate = /(public\s+void\s+onCreate\s*\(\s*Bundle\s+\w+\s*\)\s*\{)/;
    if (isDefault) {
      // MainActivity vacía (recién generada): se usa la plantilla, que ya registra todos los plugins.
      main = readFileSync(join(sourceDir, 'MainActivity.java'), 'utf8').replaceAll('__PACKAGE__', appId);
      writeFileSync(mainPath, main);
      changes.push('MainActivity.java: plugins registrados');
    } else if (onCreate.test(main)) {
      // Ya registraba alguno (proyecto android/ de antes): se agregan solo los que faltan.
      const lines = missing.map((plugin) => `\n        registerPlugin(${plugin}.class);`).join('');
      writeFileSync(mainPath, main.replace(onCreate, `$1${lines}`));
      changes.push(`MainActivity.java: registrado ${missing.join(', ')}`);
    } else {
      console.warn(`[nativo] Tu MainActivity.java está personalizada: agrega registerPlugin(X.class) antes de super.onCreate() para: ${missing.join(', ')}.`);
    }
  }
}

console.log(changes.length ? `[nativo] ${changes.join('; ')}.` : '[nativo] Sin cambios (ya estaba aplicado).');
