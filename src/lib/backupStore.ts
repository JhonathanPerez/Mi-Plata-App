import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { AUTO_BACKUP_DIR } from '@/config/constants';
import type { IsoDate } from '@/types/models';
import { dateFromBackupName } from './autoBackup';

export interface StoredBackup {
  name: string;
  date: IsoDate;
  /** Tamaño en bytes (0 si el teléfono no lo informa). */
  size: number;
}

const base = { directory: Directory.Data } as const;
const pathOf = (name: string) => `${AUTO_BACKUP_DIR}/${name}`;

/**
 * Las copias automáticas viven en la carpeta privada de la app (Directory.Data): ninguna otra app las ve y no salen del
 * teléfono por sí solas. Solo existen en Android; en el navegador de desarrollo no hay dónde guardarlas.
 */
export const backupStore = {
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  },

  async write(name: string, text: string): Promise<void> {
    await Filesystem.writeFile({ ...base, path: pathOf(name), data: text, encoding: Encoding.UTF8, recursive: true });
  },

  /** Las copias guardadas, de la más reciente a la más antigua. Sin carpeta todavía = lista vacía. */
  async list(): Promise<StoredBackup[]> {
    try {
      const { files } = await Filesystem.readdir({ ...base, path: AUTO_BACKUP_DIR });
      return files
        .map((file) => ({ name: file.name, date: dateFromBackupName(file.name), size: file.size ?? 0 }))
        .filter((file): file is StoredBackup => file.date !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  },

  async read(name: string): Promise<string> {
    const { data } = await Filesystem.readFile({ ...base, path: pathOf(name), encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : await data.text();
  },

  async remove(name: string): Promise<void> {
    await Filesystem.deleteFile({ ...base, path: pathOf(name) });
  },
};
