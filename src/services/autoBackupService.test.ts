import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initDatabase } from '@/db';
import { setDbForTesting } from '@/db/connection';
import { createTestDb } from '@/test/sqliteTestDb';
import { autoBackupService } from './autoBackupService';
import { backupService } from './backupService';
import { cloudBackupService } from './cloudBackupService';
import { expenseService } from './expenseService';

// El teléfono y la carpeta de la nube se simulan en memoria: aquí se prueba CUÁNDO se hace (y cuándo no) una copia.
const phone = vi.hoisted(() => new Map<string, string>());
const cloud = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/backupStore', () => ({
  backupStore: {
    isSupported: () => true,
    write: async (name: string, text: string) => void phone.set(name, text),
    list: async () => [...phone.keys()].map((name) => ({ name, date: name.slice(13, 23), size: 1 })),
    read: async (name: string) => phone.get(name) as string,
    remove: async (name: string) => void phone.delete(name),
  },
}));
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
const NOW = new Date('2026-11-14T22:00:00');

suite('copias automáticas: nunca una copia vacía', () => {
  beforeAll(async () => {
    setDbForTesting(testDb);
    await initDatabase();
    await cloudBackupService.enableEncryption('una contraseña segura');
  });

  it('una instalación nueva trae categorías y métodos de fábrica, pero no cuenta como datos', async () => {
    expect(await backupService.hasUserData()).toBe(false);
    expect(await autoBackupService.hasData()).toBe(false);
  });

  it('sin datos no se hace ninguna copia automática, ni en el teléfono ni en la nube', async () => {
    expect(await autoBackupService.runIfDue(NOW)).toBe(false);
    expect(await autoBackupService.runCloudIfDue(NOW)).toBe(false);
    expect(phone.size).toBe(0);
    expect(cloud.size).toBe(0);
    // Y no queda marcada como hecha: apenas haya datos, toca.
    expect(await autoBackupService.getLastDate()).toBeNull();
  });

  it('a mano tampoco: explica por qué en vez de guardar una copia vacía', async () => {
    await expect(autoBackupService.runNow('2026-11-14')).rejects.toThrow('Todavía no hay datos');
    await expect(autoBackupService.backupEverywhere('2026-11-14')).rejects.toThrow('Todavía no hay datos');
    await expect(autoBackupService.uploadToCloud('2026-11-14')).rejects.toThrow('Todavía no hay datos');
    expect(phone.size + cloud.size).toBe(0);
  });

  it('apenas se registra un gasto, la copia se hace y llega a la nube', async () => {
    await expenseService.create({ amount: 18_500, categoryId: 'cat_alimentacion', paymentMethodId: 'pm_efectivo', date: '2026-11-14', time: null, note: 'Almuerzo' });
    expect(await backupService.hasUserData()).toBe(true);
    expect(await autoBackupService.runIfDue(NOW)).toBe(true);
    expect(await autoBackupService.runCloudIfDue(NOW)).toBe(true);
    expect([...phone.keys()]).toEqual(['MiPlata_auto_2026-11-14.json']);
    expect([...cloud.keys()]).toEqual(['MiPlata_nube_2026-11-14.json']);
    expect(phone.get('MiPlata_auto_2026-11-14.json')).toContain('Almuerzo');
    expect(cloud.get('MiPlata_nube_2026-11-14.json')).not.toContain('Almuerzo');
  }, 30_000);
});
