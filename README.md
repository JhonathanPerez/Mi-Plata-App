# Mi Plata By Jhonathan Pérez Ortega 💚

Control de gastos personales para Colombia. App híbrida para Android hecha con **React + TypeScript + Capacitor + SQLite**.
100 % offline: tus datos viven solo en el teléfono.

- Registro de un gasto en pocos toques: `+` → valor → categoría → método → Guardar.
- Pesos colombianos (`$1.250.000`), guardados como **enteros** (sin decimales ni errores de punto flotante).
- Dashboard con presupuesto, historial con filtros y búsqueda, estadísticas mensuales.
- Exportación a **Excel (.xlsx)** con hoja `Gastos` y hoja `Resumen`. Importación desde Excel. Copia de seguridad JSON.
- Tema claro/oscuro/sistema.
- **Modo privacidad**: el ojito 👁️ en Inicio, Gastos y Estadísticas oculta todos los valores en pesos; la app recuerda tu elección al cerrarla y abrirla.
- **Bloqueo con huella/rostro** al abrir la app y **captura automática** de compras desde notificaciones de Nu y SMS del banco (§13).

## 1. Requisitos

| Herramienta    | Versión                                      |
| -------------- | -------------------------------------------- |
| Node.js        | 20 o superior                                |
| JDK            | 21 (lo trae Android Studio)                  |
| Android Studio | Ladybug (2024.2) o superior, con Android SDK |

## 2. Instalar y verificar

```bash
npm install
npm run typecheck   # TypeScript sin errores
npm test            # pruebas (las de base de datos requieren Node 22.5+; con Node 20 se omiten)
npm run dev         # vista previa en el navegador (SQLite corre en memoria + IndexedDB)
```

> `npm install` copia el `sql-wasm.wasm` de `jeep-sqlite` a `public/assets/`. Solo lo usa el modo navegador; Android usa SQLite nativo.
>
> **Si en el navegador ves `LinkError ... function import requires a callable`:** el `.wasm` servido no corresponde al sql.js
> que `jeep-sqlite` lleva dentro. Ejecuta:
>
> ```bash
> rm -rf public/assets node_modules/.vite
> node scripts/copy-sql-wasm.mjs   # muestra de dónde sacó cada .wasm
> npm run dev
> ```
>
> y recarga con `Ctrl+Shift+R`. Si persiste, fija en `package.json` la versión de `sql.js` que pide `jeep-sqlite`
> (`npm ls sql.js` la muestra), reinstala y vuelve a ejecutar el script.
> Este problema no afecta al APK: puedes seguir probando en Android con `npm run android:run`.

## 3. Ejecutar en Android

```bash
npm run android:add     # SOLO la primera vez: crea la carpeta android/ y desactiva el backup automático de Android
npm run android:run     # compila, sincroniza y lanza en el emulador/teléfono conectado
# o bien
npm run android:open    # compila, sincroniza y abre Android Studio
```

Cada vez que cambies código: `npm run android:sync` (equivale a `vite build` + instalar el código nativo + `cap sync`).

> **¿Ya tenías la carpeta `android/`?** Tras actualizar a esta versión ejecuta `npm install` (trae el plugin de huella) y
> luego `npm run android:sync`: instala el lector de notificaciones y registra el plugin (es idempotente). No hace falta
> volver a correr `android:add`.

Privacidad extra (recomendado antes de publicar): elimina el permiso de Internet, así el sistema operativo impide
que la app use la red aunque alguien lo intentara:

```bash
node scripts/harden-android.mjs --no-internet
```

(Ejecútalo solo para builds finales; el modo `cap run` con recarga en vivo sí necesita red.)

## 4. Generar APK

**Debug (para instalar en tu teléfono):**

```bash
npm run android:sync
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**Release firmado:**

1. Crea una llave (guárdala y respáldala: sin ella no podrás actualizar la app):
   ```bash
   keytool -genkey -v -keystore miplata.jks -keyalg RSA -keysize 2048 -validity 10000 -alias miplata
   ```
2. En Android Studio: **Build ▸ Generate Signed App Bundle / APK ▸ APK**, elige `miplata.jks` y la variante `release`.
   Resultado: `android/app/release/app-release.apk`.
   (Por consola: configura `signingConfigs` en `android/app/build.gradle` y ejecuta `./gradlew assembleRelease`.)

## 5. Generar AAB (Google Play)

```bash
npm run android:sync
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

o **Build ▸ Generate Signed App Bundle / APK ▸ Android App Bundle**. Sube ese `.aab` a Play Console.

Antes de subir a Play: sube `versionCode`/`versionName` en `android/app/build.gradle` y, si Play exige un `targetSdk` más nuevo,
actualiza Capacitor (`npx cap migrate`) o ajusta `targetSdkVersion` en `android/variables.gradle`.
Iconos y pantalla de inicio: `npx @capacitor/assets generate` con `assets/icon.png` (1024×1024).

## 6. Probar la exportación a Excel

1. Abre la app y registra algunos gastos (o restaura una copia).
2. **Configuración ▸ Exportar a Excel**. Elige **Mes**, **Año** o **Rango** y verás cuántos gastos y qué total incluirá.
3. Pulsa **Exportar a Excel**. En Android se abre el menú de compartir: guarda en Drive/Archivos, envíalo por correo o ábrelo con Excel.
   En el navegador (`npm run dev`) se descarga directamente.
4. Ábrelo en Excel o Google Sheets:
   - Hoja **Gastos**: `Fecha | Categoría | Descripción | Método de pago | Valor` (fechas y valores reales, filtros y fila `Total` con fórmula).
   - Hoja **Resumen**: total, transacciones, promedio diario, total por categoría y por método (y por mes si el periodo abarca varios).
5. Prueba de ida y vuelta: **Configuración ▸ Importar desde Excel** con ese mismo archivo. Los gastos ya existentes se omiten (no se duplican).

## 7. Cómo agregar…

**Una categoría o una tarjeta (usuario):** Configuración ▸ Categorías / Métodos de pago ▸ _Nueva_. Elige nombre, icono y color.
No hace falta tocar código. Las categorías o métodos con gastos no se pueden eliminar; se pueden **ocultar**.

**Una categoría o tarjeta por defecto (desarrollador):** añade una línea en `src/config/seeds.ts`
(`DEFAULT_CATEGORIES` / `DEFAULT_PAYMENT_METHODS`). Solo se siembran en instalaciones nuevas; para que también aparezca en instalaciones existentes, añade además una migración de datos como `002_transferencia.ts`.

**Cambiar el esquema (por ejemplo cuotas de tarjeta):** crea `src/db/migrations/003_cuotas.ts` y regístralo en `src/db/migrations/index.ts`:

```ts
export const migration003: Migration = {
  version: 3,
  name: "installments",
  statements: [
    `ALTER TABLE expenses ADD COLUMN installments INTEGER NOT NULL DEFAULT 1`,
    `CREATE TABLE installment_plans (id TEXT PRIMARY KEY NOT NULL, expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE, ...)`,
  ],
};
```

`payment_methods` ya trae `credit_limit`, `cutoff_day` y `due_day` (sin usar en el MVP) para cupo, corte y fecha de pago.

## 8. Arquitectura

```
UI (pages, components)  →  hooks (useQuery)  →  services (reglas de negocio + validación)
                                                    →  repositories (SQL)  →  db (Db → SQLite)
```

- **`src/pages/`** pantallas · **`src/components/`** piezas reutilizables (`ui/`, `expenses/`, `charts/`).
- **`src/services/`** lógica: gastos, categorías, métodos, presupuesto, estadísticas, exportación, importación, respaldo.
- **`src/repositories/`** único lugar con SQL. **`src/db/`** conexión, migraciones y semillas.
- **`src/lib/`** dinero (COP), fechas locales, textos, archivos. **`src/config/`** constantes y datos iniciales.
- **Estado:** no hay store global. Los servicios avisan (`notifyDataChanged`) y `useQuery` vuelve a leer; el tema usa un contexto.
- **Sincronización futura:** los IDs son UUID y cada fila tiene `created_at/updated_at`; bastará una capa nueva sobre los repositorios.

### Modelo de datos (SQLite)

| Tabla                         | Campos principales                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`                  | `id` UUID · `name` único · `icon` · `color` · `is_active` · `sort_order`                                                                                                                                                                |
| `payment_methods`             | `id` · `name` único · `type` (`cash`/`debit_card`/`credit_card`/`other`) · `icon` · `color` · `last4`? · `is_active` · `credit_limit`?/`cutoff_day`?/`due_day`?                                                                         |
| `expenses`                    | `id` · `amount` INTEGER (>0) · `category_id` → · `payment_method_id` → · `expense_date` `YYYY-MM-DD` · `expense_time`? `HH:MM` · `note`?                                                                                                |
| `budgets`                     | `id` · `year_month` único · `amount`. El presupuesto de un mes se hereda a los siguientes hasta que lo cambies                                                                                                                          |
| `expenses.paid_at`            | fecha en que se pagó al banco; `NULL` = por pagar                                                                                                                                                                                       |
| `payment_methods.cycle_rules` | reglas de corte y pago (JSON) de una tarjeta de crédito                                                                                                                                                                                 |
| `settings`                    | `key`/`value` (tema, último método usado, bloqueo biométrico…)                                                                                                                                                                          |
| `card_statement_dates`        | fechas de un extracto ajustadas a mano o fijadas al pagarlo: `payment_method_id` · `period` (YYYY-MM) · `cut_date` · `due_date`                                                                                                         |
| `pending_captures`            | gastos detectados en notificaciones/SMS por categorizar: `amount` · `merchant`? · `bank`? · `last4`? · `raw_text` · `occurred_at` (ms) · `fingerprint` · `status` (`pending`/`accepted`/`dismissed`). Al resolverse se borra `raw_text` |
| `schema_migrations`           | control de migraciones                                                                                                                                                                                                                  |

Índices: `expense_date`, `category_id`, `payment_method_id`, `(category_id, expense_date)`. Las llaves foráneas son `ON DELETE RESTRICT`.

### Navegación

Pestañas (`HashRouter`, se cambia con `replace` para que "Atrás" salga de la app): **Inicio** `/` · **Gastos** `/gastos` · **Estadísticas** `/estadisticas` · **Ajustes** `/ajustes`, más el botón flotante `+` → `/gasto/nuevo`.
Pantallas secundarias: `/gasto/:id` (editar), `/pendientes` (gastos por categorizar), `/ajustes/categorias`, `/ajustes/metodos`, `/ajustes/exportar`, `/ajustes/captura`, `/tarjetas` (+ `/tarjetas/:id/pagar`, `/extractos`, `/fechas`).

## 9. Seguridad y privacidad

- Todo se guarda en la base SQLite privada de la app (sandbox de Android). Sin servidores, sin analítica, sin cuentas.
- No se piden credenciales bancarias ni se guarda el número de tarjeta: solo los **últimos 4 dígitos**, opcionales, y solo en tarjetas.
- El backup automático de Android queda desactivado (`allowBackup=false`) para que los datos no salgan a la nube de Google.
- Los archivos exportados se crean en la caché privada y solo salen cuando tú eliges dónde compartirlos.
- **Bloqueo con huella/rostro** (§13): por defecto la app pide autenticación al abrirse; sin ella no se monta ninguna pantalla con datos.
- **La captura automática** lee notificaciones solo de las apps que elijas en Configuración ▸ Captura automática, guarda únicamente las que traen un monto en pesos, y borra el texto del banco en cuanto categorizas o descartas el gasto. Con `--no-internet` el sistema operativo impide además que nada salga del teléfono.
- Si quieres cifrar la base en reposo, `@capacitor-community/sqlite` soporta SQLCipher (`createConnection(..., true, 'secret', ...)`, con la frase guardada en el Keystore).

## 10. Botón Atrás de Android

Lo maneja `src/app/BackButtonHandler.tsx` (plugin `@capacitor/app`): primero cierra el panel o diálogo abierto; en pantallas secundarias vuelve a la anterior; en las pestañas vuelve a Inicio; y solo desde Inicio sale de la app. La lógica está en `src/lib/backNavigation.ts` (con pruebas).

## 11. Icono y pantalla de arranque

El icono (anillo de 5 tramos con los colores de categorías, igual que el donut de Estadísticas, con un punto dorado al centro) y la pantalla de arranque ya vienen listos en `assets/android-res/`.
`npm run android:add` los aplica automáticamente. Si ya tenías la carpeta `android/`, ejecuta una vez:

```bash
npm run android:icon      # copia los iconos y cambia el tema de arranque
npm run android:sync      # y vuelve a compilar la app
```

Incluye icono clásico, adaptativo (círculo, squircle, etc.) y **icono con tema** de Android 13+. Si tu teléfono muestra el icono viejo, desinstala y vuelve a instalar
(o reinicia el lanzador): Android guarda los iconos en caché. Para la ficha de Google Play usa `assets/icon/icon-512.png`.
Para cambiar el diseño edita los SVG de `assets/icon/` y ejecuta `npm i -D sharp && node scripts/generate-icons.mjs && npm run android:icon`.

## 12. Limitaciones conocidas

- La captura automática solo existe en Android (iOS no permite leer notificaciones de otras apps).
- El texto de las notificaciones de los bancos cambia sin aviso: si un mensaje real no se detecta, ver §13 ▸ _Ajustar el lector_.
- Las compras en moneda extranjera (dólares, euros) no se detectan: sus valores no son pesos.

- El reordenamiento manual de categorías aún no tiene interfaz (el campo `sort_order` ya existe).
- Las tarjetas de crédito son solo un método de pago en este MVP (sin cupo, corte ni cuotas).

## 13. Bloqueo biométrico y captura automática de gastos

### Bloqueo con huella, rostro o PIN

- Plugin: `@aparajita/capacitor-biometric-auth` (v9, Capacitor 7). Se usa desde un único sitio, `src/lib/biometrics.ts`.
- `src/app/LockGate.tsx` envuelve la app. Al abrirla pide huella/rostro; si el sensor falla, acepta el PIN, patrón o clave del teléfono.
  Mientras está bloqueada **no se monta** nada de lo que hay debajo. Al volver de segundo plano vuelve a bloquear según el ajuste
  **Configuración ▸ Seguridad ▸ Volver a pedirlo** (_Siempre_ por defecto, o tras 1 / 5 minutos). La app queda montada debajo de la
  pantalla de bloqueo, así no pierdes un gasto a medio escribir.
- Activar o desactivar el bloqueo exige autenticarse (evita que otra persona lo apague con tu teléfono desbloqueado).
- Si el teléfono no tiene huella, rostro ni PIN, no hay cómo proteger la app: se deja entrar y en Configuración se explica.
- Nota: _Siempre_ también pide la huella al volver de elegir un archivo (importar Excel, restaurar copia) porque Android saca la app
  al primer plano del selector. Si te molesta, usa _Tras 1 min_.
- Opcional, no incluido: `FLAG_SECURE` en `MainActivity` oculta el contenido en la vista de apps recientes (pero también bloquea capturas de pantalla).

### Captura automática (notificaciones de Nu y SMS del banco)

```
Notificación ─▶ CaptureListenerService (Java) ─┬▶ aviso "al instante" (mismo proceso, sin abrir la app)
                                                └▶ cola local ─▶ app (TypeScript) ─▶ parser ─▶ pending_captures ─▶ tú eliges la categoría
                                                                                                       │
                                                                                       aviso con monto y comercio (reemplaza al de arriba)
```

1. **Lector nativo** (`native/android/`, se instala con `npm run android:sync`). Es un `NotificationListenerService` que solo mira las
   apps que el usuario eligió en **Configuración ▸ Captura automática ▸ Elegir apps** (o, la primera vez, las recomendadas de
   `DEFAULT_CAPTURE_APPS` en `src/config/capture.ts`: **Nu** (`com.nu.production`) y las apps de SMS de Google, Samsung y Android).
   De ellas guarda solo lo que parece traer un monto en pesos (un `$`, `COP` o `pesos`; un número con separador de miles como `25.000`; o una palabra de gasto seguida de un número, como `compra por 25000`); lo demás se descarta en el acto. Funciona con la app cerrada.
   Los SMS del banco se leen como notificación de la app de mensajes, por eso **no se pide el permiso de SMS** (que además Google Play restringe).
2. **Aviso al instante**: apenas el lector guarda un mensaje en la cola, `CaptureListenerService` muestra de una vez un aviso del
   sistema ("Nuevo gasto detectado") **sin depender de que la app esté abierta** (es el mismo proceso Android que mantiene vivo
   para el lector). Al tocarlo se abre Mi Plata. Cuando la parte web procesa el mensaje, reemplaza ese mismo aviso (comparten id,
   calculado igual en `CaptureListenerService.java` y en `captureNotificationId` de `src/lib/localNotifications.ts`) por uno con
   el monto y el comercio ya identificados, o lo retira en silencio si resultó no ser un gasto real (repetido, código de un solo
   uso, etc.). Así siempre llega un aviso al momento, esté la app abierta o cerrada, y nunca se duplica.
3. **Parser** (`src/lib/parseNotification.ts`, con pruebas): extrae el valor (ignora saldos, cupos y precios en dólares), el comercio
   (tras "en …", "Comercio: …" o "a …" en pagos), el banco y los últimos 4 dígitos. Descarta ingresos, códigos de verificación, publicidad,
   recordatorios de pago y compras rechazadas.
4. **Bandeja** (`/pendientes`, tarjeta en Inicio y fila en Configuración): cada gasto muestra valor, comercio y el texto original.
   Al tocarlo se abre el formulario con valor, comercio (como descripción), fecha y hora ya puestos, y **el método de pago sugerido**
   (por los últimos 4 dígitos o por el banco). Solo falta elegir la **categoría**. Guardar crea el gasto y resuelve el aviso en una sola transacción.
5. **Duplicados:** el mismo aviso publicado de nuevo, o un mensaje viejo que la app de SMS vuelve a mostrar, no genera otro pendiente
   (y retira el aviso al instante que le correspondía).

**Activarla en el teléfono:** _Configuración ▸ Notificaciones y SMS del banco ▸ Dar acceso a notificaciones_ y activa **Mi Plata**.

- Android 13+ con la app instalada fuera de Play Store: si el interruptor sale gris ("Ajuste restringido"), abre
  _Información de la app ▸ ⋮ ▸ Permitir ajustes restringidos_ y vuelve a intentarlo.
- Xiaomi, Samsung, Oppo, Huawei…: en _Batería_ deja Mi Plata **sin restricciones**; si no, el sistema puede cerrar el lector y se pierden avisos.

### Ajustar el lector a tus bancos

Los bancos redactan distinto y cambian el texto sin avisar. Para comprobar cómo interpreta un mensaje:
**Por categorizar ▸ `+` ▸ Pegar un mensaje**. Si no lo detecta, el mensaje de error dice por qué.

- Añadir un caso al parser: copia el mensaje (borra datos personales) a `src/lib/parseNotification.test.ts`, ejecuta `npm test` y ajusta
  las expresiones de `parseNotification.ts`.
- **Vigilar otra app (Bancolombia, Davivienda, Nequi…):** no hace falta tocar código. En **Configuración ▸ Captura automática ▸
  Elegir apps** se lista todo lo instalado en el teléfono (`NotificationCapture.listApps`, un `NotificationListenerService` en
  Android 11+ necesita el bloque `<queries>` del manifiesto para verlas, ya incluido); ahí se marcan las que se quieran vigilar y
  la elección (`src/services/captureAppsService.ts`) se guarda en `settings` y se manda al lector al momento.
  El banco de un aviso de una app fuera de `CAPTURE_SOURCES` se deduce del texto por `BANK_KEYWORDS`; si un banco nuevo nunca
  aparece ahí, añádelo. Para que además tenga un ícono propio o un mapeo fijo de banco (en vez del genérico), agrégalo a
  `CAPTURE_SOURCES` en `src/config/capture.ts` (es el `id=` de su ficha en Google Play).

## 14. Capa visual y librerías de interfaz

Tras `git pull`/actualizar, ejecuta **`npm install`** (hay dependencias nuevas) y luego `npm run android:sync`.

| Librería                | Para qué se usa                                                                                                                                    | Dónde                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `@phosphor-icons/react` | Íconos (duotono en los de contenido, trazo grueso en los de control). Se cambian en un solo sitio, sin tocar las pantallas                         | `components/ui/Icon.tsx`                                                              |
| `motion`                | Entrada suave de pantallas, indicador deslizante de la barra inferior, píldora del selector, avisos, fundido del bloqueo, filas que entran y salen | `PageTransition`, `BottomNav`, `Segmented`, `ToastProvider`, `LockGate`, `PendingRow` |
| `vaul`                  | Hojas inferiores que se arrastran para cerrar (presupuesto, filtros, pegar mensaje…)                                                               | `components/ui/Sheet.tsx` (misma API que antes)                                       |
| `@number-flow/react`    | Los montos "ruedan" al cambiar                                                                                                                     | `components/ui/Money.tsx` (Inicio)                                                    |
| `@use-gesture/react`    | Deslizar a la izquierda para descartar un gasto pendiente                                                                                          | `components/expenses/PendingRow.tsx`                                                  |
| `@capacitor/haptics`    | Vibración sutil al cambiar de pestaña, elegir, guardar, desbloquear y descartar                                                                    | `lib/haptics.ts`                                                                      |

- **`src/styles/polish.css`** se carga al final y solo pule (sombras, degradados, cristal esmerilado, esqueletos de carga, estados vacíos).
  Para volver al aspecto anterior basta con quitar su `import` de `main.tsx`.
- Todo respeta _Reducir movimiento_ del sistema (`prefers-reduced-motion`).
- Las pantallas sueltas (formulario, bandeja…) solo hacen fundido: mover con `transform` un contenedor descolocaría los
  elementos `position: fixed` (como el botón de guardar) mientras dura la animación.
- Deslizar para descartar pide confirmación (un roce no borra nada) y hay un botón "Descartar" oculto para lector de pantalla y teclado.

## 15. Pagado / por pagar y extractos de tarjeta

### Estado de cada gasto

- El formulario tiene el campo **Estado** (Pagado | Por pagar). Con **tarjeta de crédito** arranca en _Por pagar_; con cualquier otro método, en _Pagado_.
  Se puede cambiar, y al editar un gasto se respeta el estado que tenía. Los gastos que detecta la captura desde Nu llegan como _Por pagar_.
- El estado **no cambia el presupuesto**: un gasto cuenta el día de la compra, lo hayas pagado o no.
- **Historial:** filtro _Todos / Por pagar / Pagados_. _Por pagar_ muestra todo lo pendiente de cualquier mes. Deslizar un gasto a la derecha lo marca como pagado (o de nuevo por pagar).
- **Inicio:** tarjeta _Por pagar_ con lo que se debe en cada tarjeta y cuándo vence.
- **Actualización:** los gastos que ya tenías quedan como _Pagado_ (migración 004), para no llenarte de pendientes falsos.

### Reglas de corte y pago (por tarjeta)

Cada tarjeta guarda dos reglas: **corte** y **fecha límite de pago**. Cada una puede ser un día fijo del mes, el último día, o el n-ésimo día de la
semana (_el segundo viernes_). El pago indica si cae en el mismo mes del corte o en el siguiente, y qué hacer si cae en fin de semana (mantener, día hábil
anterior o siguiente; los festivos de Colombia no se consideran). Se editan en **Ajustes ▸ Métodos de pago ▸ (tarjeta) ▸ Fechas del ciclo** o en **Tarjetas**.
Antes de guardar se ven las fechas de los próximos meses.

Vienen cargadas las tuyas: **Nubank** (corte el último día; pago el día 20 del mes siguiente) y **Davibank** (corte el segundo viernes; pago el segundo martes del
mes siguiente).

- Un gasto pertenece al primer extracto cuya fecha de corte sea igual o posterior a su día (una compra del mismo día del corte entra a ese extracto).
- Un extracto está **cerrado** cuando ya pasó su corte; solo los cerrados se pueden pagar. El ciclo abierto aparece aparte.
- **Ajustar un mes:** en _Tarjetas ▸ Cambiar fechas de este mes_ (o tocando un extracto en _Extractos_) se cambian solo las fechas de ese extracto; la app avisa qué gastos
  cambiarían de extracto. Si el extracto ya tiene pagos, pide confirmación.

### Pagar el extracto

_Tarjetas ▸ Pagar extracto_: lista los gastos del extracto cerrado con casillas. Desmarcas lo que pagaste aparte (seguirá _Por pagar_), eliges la fecha y
confirmas: todo pasa a _Pagado_ a la vez, en una sola transacción. Las fechas de ese extracto quedan **fijas**: cambiar después las reglas no altera un extracto ya pagado.
Se asume pago completo en una sola cuota (no hay cuotas, pagos parciales ni intereses).

### Datos

- **Copia de seguridad v2:** incluye el estado, las reglas y las fechas fijas. Las copias antiguas (v1) se siguen pudiendo restaurar (todo como _Pagado_, sin reglas).
- **Excel:** la exportación añade la columna **Estado**; al importar, la columna es opcional (sin ella todo entra como _Pagado_).

### Publicidad reportada (aprendizaje local)

- En **Por categorizar**, mantén presionado un mensaje para reportarlo como publicidad (o descartarlo, en el mismo menú).
- La app guarda fragmentos cortos de texto (2 a 4 palabras, sin el valor ni el comercio) de lo que reportas. Cuando una misma frase aparece
  en 2 o más reportes _distintos_, se suma al filtro de publicidad y esos mensajes dejan de aparecer en la bandeja.
- No es un modelo de IA ni usa la nube: es un contador de frases que corre en el teléfono. **Ajustes ▸ Captura ▸ Publicidad reportada** muestra
  cuántas frases lleva aprendidas y permite borrarlas todas con **Olvidar lo aprendido**.
- Límite de 300 frases aprendidas, para que la lista no crezca sin control.

### Recordatorio de gastos por categorizar

- **Ajustes ▸ Gastos por categorizar:** avisa cada cierto tiempo (15 min a 7 días, en minutos u horas) mientras haya gastos capturados sin categoría. No avisa entre 10 pm y 8 am.
- **Alarmas exactas:** desde Android 12, si Mi Plata no tiene el permiso «Alarmas y recordatorios», Android agrupa y retrasa los avisos (pueden llegar cada 1 o 2 horas aunque pidas un intervalo corto).
  La tarjeta lo detecta y muestra el botón **Permitir alarmas exactas**. Tras actualizar, corre `npm run android:sync` para que el manifest incluya `SCHEDULE_EXACT_ALARM`.
- **Piso real de 9 minutos, aunque todo esté bien configurado:** es una regla fija del sistema operativo Android, documentada por Google, no algo que un permiso desbloquee: _"Neither setAndAllowWhileIdle() nor setExactAndAllowWhileIdle() can fire alarms more than once per nine minutes, per app."_
  Mientras el teléfono está inactivo (pantalla apagada, en reposo), ninguna app puede recibir más de un aviso de este tipo cada 9 minutos, sin importar los permisos que tenga. Por eso el mínimo que deja elegir la app es 15 minutos: menos que eso, el primer aviso llega bien y el resto se pierde hasta que abres la app y la «reactivas» un rato (justo el síntoma de «funciona un rato después de abrirla y luego deja de avisar»).
  Fuente: [Optimize for Doze and App Standby, Android Developers](https://developer.android.com/training/monitoring-device-state/doze-standby).

### Avisos del teléfono antes de que venza un pago

- **Ajustes ▸ Avisos de pago** (o el botón _Activar avisos_ en _Tarjetas_): al encender, la app pide el permiso de notificaciones (Android 13+) y programa los avisos.
  Eliges cuándo avisar (**3 días antes**, **1 día antes**, **el mismo día**; por defecto 1 día antes y el mismo día) y a qué hora (8 a. m., 9 a. m., 12 m. o 6 p. m.).
  **Enviar aviso de prueba** llega en unos segundos, para comprobar que todo funciona.
- **Qué avisa:** el pago de cada extracto cerrado con deuda ("Tu extracto de septiembre ($233.600) vence mañana") y el del ciclo abierto (sin prometer una cifra, porque aún puede crecer).
- **Cómo funciona:** los avisos se programan en el teléfono con el reloj del sistema (`@capacitor/local-notifications`): llegan con la app cerrada y sin Internet.
  La app los reprograma al abrirse, al volver a ella y cada vez que cambian los datos; por eso **pagar un extracto borra sus avisos** y cambiar las fechas de un mes los mueve.
  Tocar un aviso abre _Tarjetas_.
- **Instalación:** `npm install` y `npm run android:sync` (el script agrega el permiso `POST_NOTIFICATIONS` y el ícono `ic_stat_miplata`, y `cap sync` conecta el plugin).
- **Límites:** los avisos de pago son aproximados (pueden retrasarse unos minutos). El recordatorio de gastos pendientes, en cambio, necesita el permiso de **alarmas exactas** (ver abajo). Se programan hasta 60. Solo existen para los extractos que la app ya
  conoce, así que conviene abrirla de vez en cuando (cada apertura los renueva). Si el teléfono es Xiaomi, Samsung u Oppo, deja Mi Plata «sin restricciones» en Batería.
  Si el permiso se bloquea en el teléfono, la pantalla lo indica y explica dónde reactivarlo.
- Un extracto que **ya venció** y sigue sin pagar no genera aviso nuevo (el aviso del día ya pasó); ese caso lo señala el banner rojo de _Tarjetas_ y la tarjeta _Por pagar_ de Inicio.

## Versionado

El proyecto usa [versionado semántico](https://semver.org/lang/es/) (`MAJOR.MINOR.PATCH`) y se publica solo
automáticamente: nunca se sube a mano el número de versión ni se crea el tag a mano.

**Cómo funciona:** cada vez que se hace _push_ a `main`, el workflow `.github/workflows/release.yml` revisa los
mensajes de commit desde la última versión publicada (usando [Conventional Commits](https://www.conventionalcommits.org/es/)):

| Mensaje del commit                                       | Qué sube              | Ejemplo                                             |
| -------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| `fix: ...`                                               | PATCH (1.0.0 → 1.0.1) | `fix: corrige el parser de Bancolombia`             |
| `feat: ...`                                              | MINOR (1.0.0 → 1.1.0) | `feat: agrega exportación a Excel`                  |
| `feat!: ...` o cuerpo con `BREAKING CHANGE:`             | MAJOR (1.0.0 → 2.0.0) | `feat!: cambia el formato de la copia de seguridad` |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `style:` | nada                  | `docs: actualiza el README`                         |

Si hay algo que publicar, [`semantic-release`](https://semantic-release.gitbook.io/) automáticamente:

1. Calcula la versión nueva y crea el tag `vX.Y.Z`.
2. Sube `package.json` y `CHANGELOG.md` con esa versión (commit `chore(release): X.Y.Z`).
3. Crea el Release en GitHub con las notas generadas a partir de los commits.
4. Dispara la compilación del APK: `scripts/sync-android-version.mjs` escribe ese mismo `versionName` y un
   `versionCode` creciente (`major*1_000_000 + minor*1_000 + patch`) en `android/app/build.gradle`, se compila
   con `./gradlew assembleDebug`, y el APK (`mi-plata-vX.Y.Z.apk`) queda adjunto al Release.

**Local:** `npm run android:version` aplica manualmente la versión actual de `package.json` al proyecto Android
(útil si quieres compilar localmente sin pasar por CI). No hace falta correrlo a mano en el flujo normal:
`android:add` y `android:sync` ya lo incluyen.

**Primera versión:** la `v1.0.0` se etiquetó a mano sobre el commit inicial; de ahí en adelante todo lo hace
el workflow.
