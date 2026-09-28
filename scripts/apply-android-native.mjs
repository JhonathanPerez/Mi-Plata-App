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
        <!-- Lector de notificaciones de la captura automática de gastos (ver README §13). -->
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

// 3) MainActivity: registrar el plugin propio antes de super.onCreate()
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

const mainPath = findMainActivity(javaRoot);
if (!mainPath) {
  console.warn('[nativo] No encontré MainActivity.java. Agrega registerPlugin(NotificationCapturePlugin.class) antes de super.onCreate().');
} else {
  const main = readFileSync(mainPath, 'utf8');
  if (!main.includes('NotificationCapturePlugin')) {
    const isDefault = /public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(main);
    const onCreate = /(public\s+void\s+onCreate\s*\(\s*Bundle\s+\w+\s*\)\s*\{)/;
    if (isDefault) {
      const template = readFileSync(join(sourceDir, 'MainActivity.java'), 'utf8').replaceAll('__PACKAGE__', appId);
      writeFileSync(mainPath, template);
      changes.push('MainActivity.java: plugin registrado');
    } else if (onCreate.test(main)) {
      writeFileSync(mainPath, main.replace(onCreate, '$1\n        registerPlugin(NotificationCapturePlugin.class);'));
      changes.push('MainActivity.java: plugin registrado');
    } else {
      console.warn('[nativo] Tu MainActivity.java está personalizada: agrega registerPlugin(NotificationCapturePlugin.class) antes de super.onCreate().');
    }
  }
}

console.log(changes.length ? `[nativo] ${changes.join('; ')}.` : '[nativo] Sin cambios (ya estaba aplicado).');
