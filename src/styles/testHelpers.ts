import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Archivos .ts/.tsx de la app (sin tests), donde se usan las clases y variables CSS. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
