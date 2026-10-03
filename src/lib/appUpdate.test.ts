import { describe, expect, it } from 'vitest';
import {
  UpdateError,
  compareVersions,
  decideUpdate,
  downloadPercent,
  fetchLatestRelease,
  formatBytes,
  isConclusiveDecision,
  isNewerVersion,
  parseLatestRelease,
  parseVersion,
  shouldCheckAutomatically,
  shouldPromptAutomatically,
} from './appUpdate';

const REPO = 'JhonathanPerez/Mi-Plata-App';
const DOWNLOAD = `https://github.com/${REPO}/releases/download/v1.2.0/mi-plata-v1.2.0.apk`;

const releaseJson = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v1.2.0',
  html_url: `https://github.com/${REPO}/releases/tag/v1.2.0`,
  draft: false,
  prerelease: false,
  assets: [{ name: 'mi-plata-v1.2.0.apk', browser_download_url: DOWNLOAD, size: 14_900_000, state: 'uploaded' }],
  ...overrides,
});

/** `fetch` falso: devuelve lo que se le indique, o falla como una red caída. */
const fakeFetch = (reply: { status?: number; body?: unknown; rawBody?: string; fail?: boolean }): typeof fetch =>
  (async () => {
    if (reply.fail) throw new TypeError('Failed to fetch');
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (reply.rawBody !== undefined) return JSON.parse(reply.rawBody);
        return reply.body;
      },
    } as Response;
  }) as typeof fetch;

async function failureOf(promise: Promise<unknown>): Promise<UpdateError> {
  try {
    await promise;
  } catch (error) {
    return error as UpdateError;
  }
  throw new Error('Se esperaba un error y no hubo ninguno');
}

describe('versiones', () => {
  it('lee versiones con o sin «v» y rechaza lo que no es semver', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parseVersion('v10.0.1')).toEqual({ major: 10, minor: 0, patch: 1, prerelease: [] });
    expect(parseVersion('1.2.3-beta.1')?.prerelease).toEqual(['beta', '1']);
    for (const bad of ['', '1.2', 'v1', 'abc', '1.2.3.4', '1.2.x']) expect(parseVersion(bad), bad).toBeNull();
  });

  it('compara número a número, no como texto (1.10.0 es mayor que 1.9.0)', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
    expect(compareVersions('v1.1.1', '1.1.1')).toBe(0);
    expect(compareVersions('1.1.1', '1.2.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('una prerelease es anterior a su versión estable', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
  });

  it('una versión que no se entiende nunca cuenta como nueva', () => {
    expect(compareVersions('latest', '1.0.0')).toBeNull();
    expect(isNewerVersion('latest', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
  });
});

describe('respuesta de GitHub', () => {
  it('lee la versión, la página y el APK', () => {
    expect(parseLatestRelease(releaseJson(), REPO)).toEqual({
      version: '1.2.0',
      tag: 'v1.2.0',
      pageUrl: `https://github.com/${REPO}/releases/tag/v1.2.0`,
      apk: { name: 'mi-plata-v1.2.0.apk', url: DOWNLOAD, size: 14_900_000 },
    });
  });

  it('deja el APK en null mientras no esté subido (el Release se crea antes de compilarlo)', () => {
    expect(parseLatestRelease(releaseJson({ assets: [] }), REPO)?.apk).toBeNull();
    expect(parseLatestRelease(releaseJson({ assets: undefined }), REPO)?.apk).toBeNull();
    const starting = [{ name: 'mi-plata-v1.2.0.apk', browser_download_url: DOWNLOAD, size: 1, state: 'starter' }];
    expect(parseLatestRelease(releaseJson({ assets: starting }), REPO)?.apk).toBeNull();
  });

  it('no acepta un APK que no venga de los Releases del propio repositorio', () => {
    const foreign = [{ name: 'mi-plata.apk', browser_download_url: 'https://evil.example.com/mi-plata.apk', size: 10, state: 'uploaded' }];
    expect(parseLatestRelease(releaseJson({ assets: foreign }), REPO)?.apk).toBeNull();
    const otherRepo = [{ name: 'mi-plata.apk', browser_download_url: 'https://github.com/otro/repo/releases/download/v1/mi-plata.apk', size: 10 }];
    expect(parseLatestRelease(releaseJson({ assets: otherRepo }), REPO)?.apk).toBeNull();
    const insecure = [{ name: 'mi-plata.apk', browser_download_url: DOWNLOAD.replace('https', 'http'), size: 10 }];
    expect(parseLatestRelease(releaseJson({ assets: insecure }), REPO)?.apk).toBeNull();
  });

  it('ignora archivos que no son APK y prefiere el que se llama como la app', () => {
    const base = `https://github.com/${REPO}/releases/download/v1.2.0/`;
    const assets = [
      { name: 'notas.txt', browser_download_url: `${base}notas.txt`, size: 5 },
      { name: 'otra-cosa.apk', browser_download_url: `${base}otra-cosa.apk`, size: 7 },
      { name: 'mi-plata-v1.2.0.apk', browser_download_url: `${base}mi-plata-v1.2.0.apk`, size: 9 },
    ];
    expect(parseLatestRelease(releaseJson({ assets }), REPO)?.apk?.name).toBe('mi-plata-v1.2.0.apk');
  });

  it('descarta borradores, prereleases y respuestas mal formadas', () => {
    expect(parseLatestRelease(releaseJson({ draft: true }), REPO)).toBeNull();
    expect(parseLatestRelease(releaseJson({ prerelease: true }), REPO)).toBeNull();
    expect(parseLatestRelease(releaseJson({ tag_name: 'nightly' }), REPO)).toBeNull();
    expect(parseLatestRelease(releaseJson({ tag_name: 42 }), REPO)).toBeNull();
    for (const bad of [null, undefined, 'x', 7, [], {}]) expect(parseLatestRelease(bad, REPO)).toBeNull();
  });

  it('si el enlace de la página no es del repositorio, usa la lista de Releases', () => {
    const release = parseLatestRelease(releaseJson({ html_url: 'https://evil.example.com/x' }), REPO);
    expect(release?.pageUrl).toBe(`https://github.com/${REPO}/releases`);
  });
});

describe('decisión', () => {
  const latest = parseLatestRelease(releaseJson(), REPO)!;

  it('avisa solo si la versión publicada es más nueva', () => {
    expect(decideUpdate(latest, '1.1.1').status).toBe('available');
    expect(decideUpdate(latest, '1.2.0').status).toBe('up_to_date');
    expect(decideUpdate(latest, '1.3.0').status).toBe('up_to_date');
  });

  it('si el APK aún no está, dice que se está preparando', () => {
    const waiting = parseLatestRelease(releaseJson({ assets: [] }), REPO)!;
    expect(decideUpdate(waiting, '1.1.1')).toEqual({ status: 'preparing', version: '1.2.0' });
    expect(decideUpdate(waiting, '1.2.0')).toEqual({ status: 'up_to_date' });
  });
});

describe('consulta a GitHub', () => {
  it('devuelve el último Release', async () => {
    const release = await fetchLatestRelease(REPO, fakeFetch({ body: releaseJson() }));
    expect(release.version).toBe('1.2.0');
  });

  it('traduce cada fallo a un error con mensaje para la persona', async () => {
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ fail: true })))).kind).toBe('network');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ status: 404 })))).kind).toBe('not_found');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ status: 403 })))).kind).toBe('rate_limit');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ status: 429 })))).kind).toBe('rate_limit');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ status: 500 })))).kind).toBe('server');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ rawBody: 'null' })))).kind).toBe('bad_response');
    expect((await failureOf(fetchLatestRelease(REPO, fakeFetch({ body: { tag_name: 'raro' } })))).kind).toBe('bad_response');
  });

  it('se rinde si GitHub no responde a tiempo', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    expect((await failureOf(fetchLatestRelease(REPO, hanging, 20))).kind).toBe('network');
  });
});

describe('cuándo buscar y cuándo avisar', () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it('busca de forma automática si nunca se buscó o si ya pasó el intervalo', () => {
    expect(shouldCheckAutomatically(null, 1_000, HOUR)).toBe(true);
    expect(shouldCheckAutomatically(0, HOUR - 1, HOUR)).toBe(false);
    expect(shouldCheckAutomatically(0, HOUR, HOUR)).toBe(true);
  });

  it('si el reloj retrocedió, vuelve a buscar', () => {
    expect(shouldCheckAutomatically(10 * HOUR, 1 * HOUR, HOUR)).toBe(true);
  });

  it('solo anota la hora de la consulta si la respuesta fue definitiva (no con «se está preparando»)', () => {
    const latest = parseLatestRelease(releaseJson(), REPO)!;
    const waiting = parseLatestRelease(releaseJson({ assets: [] }), REPO)!;
    expect(isConclusiveDecision(decideUpdate(latest, '1.1.1'))).toBe(true);
    expect(isConclusiveDecision(decideUpdate(latest, '1.2.0'))).toBe(true);
    expect(isConclusiveDecision(decideUpdate(waiting, '1.1.1'))).toBe(false);
  });

  it('avisa si nunca se dio «Cancelar» o si es una versión distinta a la cancelada', () => {
    expect(shouldPromptAutomatically('1.2.0', null, null, 5 * DAY, DAY)).toBe(true);
    expect(shouldPromptAutomatically('1.3.0', '1.2.0', 4 * DAY, 4 * DAY + 1, DAY)).toBe(true);
  });

  it('no insiste con la versión cancelada durante el descanso, pero vuelve a avisar después', () => {
    expect(shouldPromptAutomatically('1.2.0', '1.2.0', 0, DAY - 1, DAY)).toBe(false);
    expect(shouldPromptAutomatically('1.2.0', '1.2.0', 0, DAY, DAY)).toBe(true);
  });

  it('un «Cancelar» sin hora (de una versión anterior de la app) o con el reloj atrasado no silencia la versión', () => {
    expect(shouldPromptAutomatically('1.2.0', '1.2.0', null, 1_000, DAY)).toBe(true);
    expect(shouldPromptAutomatically('1.2.0', '1.2.0', Number.NaN, 1_000, DAY)).toBe(true);
    expect(shouldPromptAutomatically('1.2.0', '1.2.0', 10 * DAY, 1 * DAY, DAY)).toBe(true);
  });
});

describe('presentación', () => {
  it('escribe el tamaño con coma decimal', () => {
    expect(formatBytes(14_900_000)).toBe('14,2 MB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(100)).toBe('1 KB');
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });

  it('calcula el porcentaje de la descarga entre 0 y 100', () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(50, 200)).toBe(25);
    expect(downloadPercent(300, 200)).toBe(100);
    expect(downloadPercent(10, 0)).toBeNull();
  });
});
