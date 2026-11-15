import { Capacitor, registerPlugin } from '@capacitor/core';

export interface CloudFolder {
  uri: string;
  /** Nombre de la carpeta tal como la ve la persona. */
  name: string;
}

/**
 * Puente con el plugin nativo `CloudFolder` (Android, ver `native/android/CloudFolderPlugin.java`). La persona elige una
 * carpeta una vez con el selector de Android y la app escribe ahí las copias. La parte web solo pasa nombres de archivo,
 * nunca rutas.
 */
interface CloudFolderPlugin {
  pickFolder(): Promise<CloudFolder>;
  getFolder(): Promise<{ configured: boolean; uri?: string; name?: string }>;
  writeFile(options: { name: string; data: string }): Promise<void>;
  listFiles(): Promise<{ names: string[] }>;
  deleteFile(options: { name: string }): Promise<void>;
  clearFolder(): Promise<void>;
}

const Native = registerPlugin<CloudFolderPlugin>('CloudFolder');

const FALLBACK_NAME = 'Carpeta elegida';

export const cloudFolder = {
  /** Solo existe en la app de Android; en el navegador todo es un no-op. */
  isSupported(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  /** La carpeta elegida, o null si no hay o Android ya no deja escribir en ella. */
  async get(): Promise<CloudFolder | null> {
    if (!this.isSupported()) return null;
    const result = await Native.getFolder();
    return result.configured && result.uri ? { uri: result.uri, name: result.name || FALLBACK_NAME } : null;
  },

  /** Abre el selector de carpetas. Devuelve null si la persona lo cierra sin elegir. */
  async pick(): Promise<CloudFolder | null> {
    try {
      const folder = await Native.pickFolder();
      return { uri: folder.uri, name: folder.name || FALLBACK_NAME };
    } catch (error) {
      if (error instanceof Error && error.message === 'cancelled') return null;
      throw error;
    }
  },

  write(name: string, text: string): Promise<void> {
    return Native.writeFile({ name, data: text });
  },

  async list(): Promise<string[]> {
    return (await Native.listFiles()).names;
  },

  remove(name: string): Promise<void> {
    return Native.deleteFile({ name });
  },

  /** Deja de usar la carpeta. Lo que ya se guardó en ella no se borra. */
  clear(): Promise<void> {
    return Native.clearFolder();
  },
};
