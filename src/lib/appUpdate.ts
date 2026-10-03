/**
 * Lógica pura de las actualizaciones (sin red, sin Capacitor, sin base de datos): leer versiones, compararlas,
 * entender la respuesta de GitHub y decidir cuándo avisar. Todo lo que toca el teléfono vive en `updateBridge.ts`
 * y la orquestación en `services/updateService.ts`.
 */

/** Por qué falló la búsqueda; el mensaje ya está pensado para mostrarse tal cual. */
export type UpdateErrorKind = 'network' | 'not_found' | 'rate_limit' | 'server' | 'bad_response';

export class UpdateError extends Error {
  readonly kind: UpdateErrorKind;

  constructor(kind: UpdateErrorKind, message: string) {
    super(message);
    this.name = 'UpdateError';
    this.kind = kind;
  }
}

// ---------- Versiones ----------

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Partes tras el guion (`1.2.3-beta.1` → `['beta', '1']`). Vacío en una versión estable. */
  prerelease: string[];
}

/** Lee `1.2.3`, `v1.2.3` o `1.2.3-beta.1`. Devuelve `null` si no es un semver válido. */
export function parseVersion(text: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  // Una versión estable es mayor que cualquiera de sus prereleases (1.0.0 > 1.0.0-beta.1).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1; // los identificadores numéricos van antes que los de texto
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

/** -1 si `a` es anterior a `b`, 0 si son iguales, 1 si es posterior. `null` si alguna no es una versión válida. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  const pre = comparePrerelease(left.prerelease, right.prerelease);
  return pre < 0 ? -1 : pre > 0 ? 1 : 0;
}

/** ¿`candidate` es más nueva que `current`? Una versión que no se entiende nunca cuenta como nueva. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1;
}

// ---------- Respuesta de GitHub ----------

export interface ReleaseApk {
  name: string;
  url: string;
  /** Bytes. 0 si GitHub no lo informó. */
  size: number;
}

export interface LatestRelease {
  /** Sin la «v» inicial: `1.2.0`. */
  version: string;
  tag: string;
  pageUrl: string;
  /** `null` mientras el APK aún no se adjunta: el Release se crea antes de compilar el APK. */
  apk: ReleaseApk | null;
}

/** Una versión lista para descargar (con su APK). */
export interface AvailableRelease extends LatestRelease {
  apk: ReleaseApk;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Solo se descarga desde la página de Releases del propio repositorio, nunca desde una URL que venga de otro sitio. */
export function releaseDownloadPrefix(repo: string): string {
  return `https://github.com/${repo}/releases/download/`;
}

function parseApk(assets: unknown, repo: string): ReleaseApk | null {
  if (!Array.isArray(assets)) return null;
  const prefix = releaseDownloadPrefix(repo);
  const candidates: ReleaseApk[] = [];
  for (const asset of assets) {
    if (!isRecord(asset)) continue;
    const { name, browser_download_url: url, size, state } = asset;
    if (typeof name !== 'string' || !name.toLowerCase().endsWith('.apk')) continue;
    if (typeof url !== 'string' || !url.startsWith(prefix)) continue;
    if (state !== undefined && state !== 'uploaded') continue;
    candidates.push({ name, url, size: typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0 });
  }
  // Si hubiera más de un APK, se prefiere el que se llama como la app (`mi-plata-vX.Y.Z.apk`).
  return candidates.find((apk) => apk.name.toLowerCase().startsWith('mi-plata')) ?? candidates[0] ?? null;
}

/**
 * Interpreta `GET /repos/{repo}/releases/latest`. Devuelve `null` si la respuesta no tiene la forma esperada
 * o es un borrador o una prerelease.
 */
export function parseLatestRelease(json: unknown, repo: string): LatestRelease | null {
  if (!isRecord(json)) return null;
  if (json.draft === true || json.prerelease === true) return null;
  const tag = json.tag_name;
  if (typeof tag !== 'string') return null;
  const parsed = parseVersion(tag);
  if (!parsed) return null;
  const version = tag.trim().replace(/^v/, '');
  const pageUrl = typeof json.html_url === 'string' && json.html_url.startsWith(`https://github.com/${repo}/`) ? json.html_url : `https://github.com/${repo}/releases`;
  return { version, tag: tag.trim(), pageUrl, apk: parseApk(json.assets, repo) };
}

export type UpdateDecision =
  /** La versión instalada es la última (o más nueva). */
  | { status: 'up_to_date' }
  /** Hay un Release más nuevo, pero su APK todavía no está subido. */
  | { status: 'preparing'; version: string }
  | { status: 'available'; release: AvailableRelease };

export function decideUpdate(release: LatestRelease, currentVersion: string): UpdateDecision {
  if (!isNewerVersion(release.version, currentVersion)) return { status: 'up_to_date' };
  if (!release.apk) return { status: 'preparing', version: release.version };
  return { status: 'available', release: { ...release, apk: release.apk } };
}

// ---------- Red ----------

const REQUEST_TIMEOUT_MS = 10_000;

/** Pregunta a GitHub por el último Release. Recibe `fetch` para poder probarse sin red. */
export async function fetchLatestRelease(repo: string, fetchImpl: typeof fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): Promise<LatestRelease> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
  } catch {
    throw new UpdateError('network', 'No pudimos conectar. Revisa tu conexión a Internet e inténtalo de nuevo.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) throw new UpdateError('not_found', 'Todavía no hay versiones publicadas.');
  if (response.status === 403 || response.status === 429) {
    throw new UpdateError('rate_limit', 'GitHub recibió demasiadas consultas desde tu conexión. Inténtalo de nuevo en un rato.');
  }
  if (!response.ok) throw new UpdateError('server', 'No pudimos consultar las versiones ahora. Inténtalo más tarde.');

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new UpdateError('bad_response', 'La respuesta de GitHub no se entendió. Inténtalo más tarde.');
  }
  const release = parseLatestRelease(json, repo);
  if (!release) throw new UpdateError('bad_response', 'La respuesta de GitHub no se entendió. Inténtalo más tarde.');
  return release;
}

// ---------- Cuándo buscar y cuándo avisar ----------

/**
 * La búsqueda automática al abrir la app no se repite antes de `intervalMs`: GitHub limita las consultas sin cuenta
 * por conexión, y muchas redes móviles comparten una misma dirección. La búsqueda manual no pasa por aquí.
 */
export function shouldCheckOnStartup(lastCheckedAt: number | null, now: number, intervalMs: number): boolean {
  if (lastCheckedAt === null || !Number.isFinite(lastCheckedAt)) return true;
  if (lastCheckedAt > now) return true; // el reloj retrocedió: mejor volver a mirar
  return now - lastCheckedAt >= intervalMs;
}

/** El aviso automático sale una sola vez por versión: si la persona le dio «Cancelar», no se le insiste. */
export function shouldPromptAutomatically(version: string, skippedVersion: string | null): boolean {
  return version !== skippedVersion;
}

// ---------- Presentación ----------

/** `14,2 MB`: coma decimal, como se escribe en Colombia. Sin dato (0) devuelve `null`. */
export function formatBytes(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Porcentaje entero 0–100 de una descarga. Si no se conoce el total devuelve `null`. */
export function downloadPercent(received: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)));
}
