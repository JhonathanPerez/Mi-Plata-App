/**
 * Aplica la firma de release al proyecto Android generado por Capacitor.
 * Se ejecuta como parte del workflow de release en CI, siempre después de
 * `cap add android` / `cap sync android` (el paso que crea android/app/build.gradle).
 *
 * No firma con valores fijos: lee la ruta del keystore y las contraseñas de
 * variables de entorno (ver android/app/signing.gradle), para no dejar secretos
 * en el repo. Si esas variables no están presentes, `assembleRelease` compila
 * sin firmar (útil para probar el build localmente sin el keystore).
 *
 * Variables de entorno que debe ver Gradle al compilar (no este script):
 *   MIPLATA_KEYSTORE_PATH      Ruta absoluta al archivo .jks
 *   MIPLATA_KEYSTORE_PASSWORD  Contraseña del keystore
 *   MIPLATA_KEY_ALIAS          Alias de la clave (ej. "miplata")
 *   MIPLATA_KEY_PASSWORD       Contraseña de la clave
 *
 *   node scripts/apply-android-signing.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const buildGradlePath = resolve('android/app/build.gradle');
if (!existsSync(buildGradlePath)) {
  console.error('[signing] No existe android/app/build.gradle. Ejecuta primero: npm run android:add');
  process.exit(1);
}

const signingGradlePath = resolve('android/app/signing.gradle');
const signingGradleContent = `// Generado por scripts/apply-android-signing.mjs — no editar a mano.
// Solo firma con release si las variables de entorno están presentes (CI o shell local).
// Sin ellas, assembleRelease compila sin firmar.
if (System.getenv('MIPLATA_KEYSTORE_PATH')) {
    android {
        signingConfigs {
            release {
                storeFile file(System.getenv('MIPLATA_KEYSTORE_PATH'))
                storePassword System.getenv('MIPLATA_KEYSTORE_PASSWORD')
                keyAlias System.getenv('MIPLATA_KEY_ALIAS')
                keyPassword System.getenv('MIPLATA_KEY_PASSWORD')
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.release
            }
        }
    }
}
`;

writeFileSync(signingGradlePath, signingGradleContent);

let buildGradle = readFileSync(buildGradlePath, 'utf8');
const applyLine = "apply from: 'signing.gradle'";

if (!buildGradle.includes(applyLine)) {
  buildGradle = buildGradle.trimEnd() + `\n\n${applyLine}\n`;
  writeFileSync(buildGradlePath, buildGradle);
  console.log('[signing] android/app/signing.gradle creado y enlazado desde build.gradle.');
} else {
  console.log('[signing] android/app/signing.gradle actualizado (ya estaba enlazado).');
}
