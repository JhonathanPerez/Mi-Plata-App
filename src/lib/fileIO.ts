import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Entrega un archivo al usuario.
 *  - Android: lo escribe en la caché privada de la app y abre el menú "Compartir/Guardar"
 *    (Drive, Archivos, WhatsApp, correo, Excel...). Nada sale de la app sin acción del usuario.
 *  - Navegador (desarrollo): descarga directa.
 */
export async function saveAndShareFile(options: {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
  title?: string;
}): Promise<SaveResult> {
  const { fileName, bytes, mimeType, title } = options;

  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  }

  const written = await Filesystem.writeFile({
    path: fileName,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: title ?? fileName,
      dialogTitle: title ?? 'Guardar o compartir',
      url: written.uri,
    });
    return 'shared';
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (message.includes('cancel')) return 'cancelled';
    throw error;
  }
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
