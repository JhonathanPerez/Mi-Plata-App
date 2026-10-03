# Mi Plata By Jhonathan Pérez Ortega 💚

Control de gastos personales para Colombia. App para Android hecha con **React + TypeScript + Capacitor + SQLite**.
Funciona 100 % sin Internet: tus datos viven solo en el teléfono (la red solo se usa para buscar versiones nuevas, ver [Actualizaciones](#actualizaciones-desde-la-app)).

- Registro de gastos en pocos toques, en pesos colombianos (guardados como enteros).
- Dashboard con presupuesto, historial con filtros, estadísticas y modo privacidad (oculta los valores).
- Exportar e importar **Excel (.xlsx)** y copia de seguridad JSON.
- Bloqueo con huella, rostro o PIN al abrir la app.
- **Captura automática** de compras desde SMS y notificaciones de las apps que elijas.
- Pagado / por pagar y extractos de tarjeta de crédito.
- **Actualizaciones desde la app**: avisa de una versión nueva al abrirla (Descargar / Cancelar) y también desde _Ajustes ▸ Datos y acerca de ▸ Comprobar actualizaciones_.

## Requisitos

Node.js 22.14+ (se recomienda Node 26, ver `.nvmrc`), JDK 21 y Android Studio (con Android SDK).

## Desarrollo

```bash
npm install
npm run typecheck   # TypeScript sin errores
npm test            # pruebas (las de base de datos usan node:sqlite, Node 22.5+)
npm run dev         # vista previa en el navegador
```

## Ejecutar en Android

```bash
npm run android:add    # SOLO la primera vez: genera la carpeta android/
npm run android:run    # compila, sincroniza y lanza en el emulador o teléfono
npm run android:open   # o abre el proyecto en Android Studio
```

Tras cambiar código: `npm run android:sync`. La carpeta `android/` es generada y no se versiona (todo el código
nativo propio vive en `native/android/` y `scripts/`).

> Un APK de debug no se instala sobre el de release (firmas distintas): desinstala el otro primero, lo que borra los datos locales.

## Captura automática de gastos

Solo en Android. Un lector de notificaciones (`native/android/CaptureListenerService.java`) mira las apps que elijas
y guarda únicamente los mensajes que traen un monto en pesos. El texto se interpreta en `src/lib/parseNotification.ts`
y el gasto queda en **Por categorizar**, donde solo eliges la categoría. No se pide permiso de SMS: los mensajes del
banco se leen como notificaciones de la app de mensajes.

**Activarla:** _Configuración ▸ Captura automática_ → dar acceso a notificaciones a Mi Plata → **Elegir apps**
(por defecto solo vienen marcadas las apps de SMS; el resto las eliges tú).

- Android 13+ con la app instalada fuera de Play Store: si el interruptor sale gris, abre _Información de la app ▸ ⋮ ▸ Permitir ajustes restringidos_.
- Xiaomi, Samsung, Oppo, Huawei…: en _Batería_ deja Mi Plata **sin restricciones** o el sistema puede cerrar el lector.
- Si un mensaje real no se detecta: **Por categorizar ▸ `+` ▸ Pegar un mensaje** explica por qué. Para corregirlo, añade el
  caso a `src/lib/parseNotification.test.ts`, corre `npm test` y ajusta `parseNotification.ts`.

## Actualizaciones desde la app

Solo en Android. Al abrir la app (ya desbloqueada) y en _Ajustes ▸ Datos y acerca de ▸ Comprobar actualizaciones_, Mi Plata
consulta `https://api.github.com/repos/<UPDATE_REPO>/releases/latest` y compara la versión publicada con la instalada
(`src/lib/appUpdate.ts`). Si hay una nueva aparece el aviso **Descargar / Cancelar**; con _Descargar_ se baja el APK del Release
(con barra de avance) y se abre el instalador de Android, que pide la confirmación final (Android no permite instalar sin ella).

- **Aviso al abrir:** como mucho una consulta cada 6 h (`UPDATE_CHECK_INTERVAL_MS`: GitHub limita las consultas sin cuenta) y una sola vez por
  versión: tras _Cancelar_ no se insiste, pero _Comprobar actualizaciones_ la sigue ofreciendo.
- **Permiso:** la primera vez Android pide _Instalar apps desconocidas_ para Mi Plata; la app abre esa pantalla y, al volver, sigue sola.
- **Seguridad:** solo se descarga de `https://github.com/<UPDATE_REPO>/releases/download/…`. Antes de instalar, el lado nativo comprueba que
  el archivo sea Mi Plata, de una versión más nueva y **firmado con la misma clave** que la app instalada; si no, lo borra y avisa.
  La parte web nunca pasa rutas de archivo al plugin.
- **Privacidad:** la consulta solo muestra a GitHub la dirección IP de la conexión; no se envía ningún dato de la app.
- Código: `native/android/AppUpdatePlugin.java` (descarga, comprobación, instalador), `src/lib/updateBridge.ts` (puente),
  `src/services/updateService.ts` (consulta y reglas de aviso) y `src/app/providers/UpdateProvider.tsx` (flujo y diálogo).

**Requisitos para que funcione**

- El repositorio debe ser **público** (la consulta no lleva credenciales; con un repo privado GitHub responde 404).
- Cada Release debe llevar su APK adjunto (`mi-plata-vX.Y.Z.apk`; lo hace `release.yml`). El Release se crea unos minutos antes que el APK:
  en ese rato _Comprobar actualizaciones_ responde que la versión «se está preparando».
- Siempre el mismo keystore (ver arriba). Un APK de debug no se actualiza a uno de release (firmas distintas).
- No compilar con `harden-android.mjs --no-internet`: sin permiso de Internet la app no puede buscar versiones.
- Cambiar de repositorio: `UPDATE_REPO` en `src/config/constants.ts`.

## Arquitectura

```
UI (pages, components) → hooks (useQuery) → services (reglas de negocio) → repositories (SQL) → db (SQLite)
```

- `src/pages/` y `src/components/`: pantallas y piezas de interfaz.
- `src/services/`: lógica de negocio. `src/repositories/`: único lugar con SQL. `src/db/`: conexión, migraciones y semillas.
- `src/lib/` y `src/config/`: utilidades, constantes y datos iniciales.
- Para cambiar el esquema, crea una migración en `src/db/migrations/` y regístrala en `index.ts`.

## Seguridad y privacidad

- Sin servidores propios, cuentas ni analítica. Todo queda en la base SQLite privada de la app. La única conexión a Internet es la consulta pública a GitHub para buscar versiones nuevas.
- No se guardan credenciales bancarias; de las tarjetas solo los últimos 4 dígitos (opcionales).
- El backup automático de Android está desactivado para que los datos no salgan a la nube de Google.
- El texto de los mensajes del banco se borra al categorizar o descartar el gasto.

## Versionado y publicación

Cada _push_ a `main` dispara `.github/workflows/release.yml`, que decide la versión con
[Conventional Commits](https://www.conventionalcommits.org/es/) mediante `semantic-release`:

| Mensaje del commit                                       | Efecto                |
| -------------------------------------------------------- | --------------------- |
| `fix: ...`                                               | PATCH (1.0.0 → 1.0.1) |
| `feat: ...`                                              | MINOR (1.0.0 → 1.1.0) |
| `feat!: ...` o `BREAKING CHANGE:` en el cuerpo           | MAJOR (1.0.0 → 2.0.0) |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `style:` | no publica            |

Si hay versión nueva, el workflow crea el tag `vX.Y.Z`, actualiza `package.json` y `CHANGELOG.md`, crea el Release en
GitHub y adjunta el **APK firmado** (`mi-plata-vX.Y.Z.apk`). Nunca se cambia la versión ni se crea el tag a mano.

**Secrets necesarios** (_Settings ▸ Secrets and variables ▸ Actions_): `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Usa siempre el mismo keystore para que Android trate cada APK como una
actualización.

**Flujo recomendado:** trabajar en ramas y fusionar con _Squash and merge_ usando un título de PR en formato Conventional
Commits (ese título es lo que lee `semantic-release`).
