import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initDatabase } from '@/db';
import { setDbForTesting } from '@/db/connection';
import { decryptBackup, isEncryptedBackup } from '@/lib/backupCrypto';
import { createTestDb } from '@/test/sqliteTestDb';
import { cloudBackupService } from './cloudBackupService';

// La carpeta de la nube y el almacenamiento privado se simulan en memoria: aquí se prueba qué sale y qué no.
const cloud = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/cloudFolder', () => ({
  cloudFolder: {
    isSupported: () => true,
    get: async () => ({ uri: 'content://carpeta', name: 'Mi nube' }),
    write: async (name: string, text: string) => void cloud.set(name, text),
    list: async () => [...cloud.keys()],
    remove: async (name: string) => void cloud.delete(name),
    clear: async () => undefined,
    pick: async () => null,
  },
}));

const secrets = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => secrets.get(key) ?? null,
  setItem: (key: string, value: string) => void secrets.set(key, value),
  removeItem: (key: string) => void secrets.delete(key),
});

const testDb = createTestDb();
const suite = testDb ? describe : describe.skip;
const BACKUP = JSON.stringify({ app: 'mi-plata', data: { expenses: [{ note: 'Almuerzo con el equipo' }] } });

async function rejection(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

suite('copia en la nube: nada sale sin cifrar', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
  });

  it('sin contraseña no se sube ni se comparte nada', async () => {
    expect(await cloudBackupService.getEncryption()).toBe('off');
    expect(await rejection(cloudBackupService.upload(BACKUP, '2026-11-01'))).toContain('Define una contraseña');
    expect(await rejection(cloudBackupService.encryptForExport(BACKUP))).toContain('Define una contraseña');
    expect(cloud.size).toBe(0);
  });

  it('exige una contraseña de al menos 8 caracteres', async () => {
    expect(await rejection(cloudBackupService.enableEncryption('corta'))).toContain('al menos 8');
    expect(await cloudBackupService.getEncryption()).toBe('off');
  });

  it('con contraseña sube cifrado: el archivo no es legible y solo se abre con ella', async () => {
    await cloudBackupService.enableEncryption('una contraseña segura');
    expect(await cloudBackupService.getEncryption()).toBe('on');
    await cloudBackupService.upload(BACKUP, '2026-11-02');

    const uploaded = cloud.get('MiPlata_nube_2026-11-02.json') as string;
    expect(isEncryptedBackup(uploaded)).toBe(true);
    expect(uploaded).not.toContain('Almuerzo');
    expect(await decryptBackup(uploaded, 'una contraseña segura')).toBe(BACKUP);
    expect(await cloudBackupService.getLastDate()).toBe('2026-11-02');
  }, 30_000);

  it('lo que se comparte también sale cifrado', async () => {
    const shared = await cloudBackupService.encryptForExport(BACKUP);
    expect(isEncryptedBackup(shared)).toBe(true);
    expect(await decryptBackup(shared, 'una contraseña segura')).toBe(BACKUP);
  }, 30_000);

  it('conserva solo las últimas copias y no toca otros archivos de la carpeta', async () => {
    cloud.set('foto.jpg', 'no es mía');
    for (const day of ['03', '04', '05', '06', '07', '08']) await cloudBackupService.upload(BACKUP, `2026-11-${day}`);
    const copies = [...cloud.keys()].filter((name) => name.startsWith('MiPlata_nube_')).sort();
    expect(copies).toEqual(['MiPlata_nube_2026-11-04.json', 'MiPlata_nube_2026-11-05.json', 'MiPlata_nube_2026-11-06.json', 'MiPlata_nube_2026-11-07.json', 'MiPlata_nube_2026-11-08.json']);
    expect(cloud.get('foto.jpg')).toBe('no es mía');
  }, 60_000);

  it('si el teléfono pierde la contraseña, no envía en texto plano: falla y lo dice', async () => {
    secrets.clear();
    expect(await cloudBackupService.getEncryption()).toBe('missing');
    const before = cloud.size;
    expect(await rejection(cloudBackupService.upload(BACKUP, '2026-11-09'))).toContain('Falta la contraseña');
    expect(cloud.size).toBe(before);
  });
});
