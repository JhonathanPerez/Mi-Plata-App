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

/** Rutas (relativas a `dir`, con `/`) de todos los .css de una carpeta, incluidas sus subcarpetas. */
export function cssFilesIn(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, relative)).isDirectory()) return cssFilesIn(dir, relative);
    return name.endsWith('.css') ? [relative] : [];
  });
}
