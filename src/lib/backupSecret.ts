import { backgroundBackup } from './backgroundBackup';

/**
 * Dónde se guarda la contraseña de cifrado de las copias. En Android vive en el Keystore del sistema (cifrada con una
 * clave que no sale del teléfono) para que la tarea en segundo plano pueda usarla sin la app abierta. Fuera de Android (o
 * si el Keystore falla) queda en el almacenamiento privado de la parte web. Nunca va a la base de datos: iría dentro de cada
 * copia, junto a lo que protege.
 */
const LOCAL_KEY = 'miplata.cloudBackupPassword';

function readLocal(): string | null {
  try {
    return localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

function removeLocal(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Sin almacenamiento no había nada que borrar.
  }
}

export const backupSecret = {
  async get(): Promise<string | null> {
    if (!backgroundBackup.isSupported()) return readLocal();
    const stored = await backgroundBackup.getPassword().catch(() => null);
    if (stored) return stored;
    // Migración: antes la contraseña vivía solo en la parte web, donde la tarea en segundo plano no puede leerla.
    const legacy = readLocal();
    if (legacy) await backgroundBackup.setPassword(legacy).then(removeLocal, () => undefined);
    return legacy;
  },

  async set(password: string): Promise<void> {
    if (backgroundBackup.isSupported()) {
      try {
        await backgroundBackup.setPassword(password);
        removeLocal();
        return;
      } catch {
        // Si el Keystore falla, la contraseña sigue sirviendo a la app; la tarea en segundo plano avisará que no la tiene.
      }
    }
    localStorage.setItem(LOCAL_KEY, password);
  },
};
