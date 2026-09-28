# Mi Plata By Jhonathan Pérez Ortega 💚

Control de gastos personales para Colombia. App para Android hecha con **React + TypeScript + Capacitor + SQLite**.
100 % offline: tus datos viven solo en el teléfono.

- Registro de gastos en pocos toques, en pesos colombianos (guardados como enteros).
- Dashboard con presupuesto, historial con filtros, estadísticas y modo privacidad (oculta los valores).
- Exportar e importar **Excel (.xlsx)** y copia de seguridad JSON.
- Bloqueo con huella, rostro o PIN al abrir la app.
- **Captura automática** de compras desde SMS y notificaciones de las apps que elijas.
- Pagado / por pagar y extractos de tarjeta de crédito.

## Requisitos

Node.js 20+, JDK 21 y Android Studio (con Android SDK).

## Desarrollo

```bash
npm install
npm run typecheck   # TypeScript sin errores
npm test            # pruebas (las de base de datos requieren Node 22.5+)
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

## Arquitectura

```
UI (pages, components) → hooks (useQuery) → services (reglas de negocio) → repositories (SQL) → db (SQLite)
```

- `src/pages/` y `src/components/`: pantallas y piezas de interfaz.
- `src/services/`: lógica de negocio. `src/repositories/`: único lugar con SQL. `src/db/`: conexión, migraciones y semillas.
- `src/lib/` y `src/config/`: utilidades, constantes y datos iniciales.
- Para cambiar el esquema, crea una migración en `src/db/migrations/` y regístrala en `index.ts`.

## Seguridad y privacidad

- Sin servidores, cuentas ni analítica. Todo queda en la base SQLite privada de la app.
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
