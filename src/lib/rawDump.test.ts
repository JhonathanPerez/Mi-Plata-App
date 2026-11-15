import { describe, expect, it } from 'vitest';
import { isRawDump, rawDumpToBackup, RAW_DUMP_FORMAT } from './rawDump';

const dump = (tables: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ format: RAW_DUMP_FORMAT, version: 1, app: 'Mi Plata', exportedAt: '2026-11-14T02:00:00.000Z', tables, ...extra });

describe('rawDumpToBackup', () => {
  it('reconoce un volcado y lo convierte al formato de una copia normal', () => {
    const raw = dump({
      categories: [{ id: 'c1', name: 'Comida', icon: '🍔', color: '#111111', is_active: 1, sort_order: 0, created_at: 'x', updated_at: 'x' }],
      settings: [{ key: 'theme', value: 'dark' }],
      card_statement_dates: [{ payment_method_id: 'm1', period: '2026-10', cut_date: '2026-10-15', due_date: '2026-11-02' }],
    });
    expect(isRawDump(raw)).toBe(true);
    const backup = rawDumpToBackup(raw) as { format: string; data: Record<string, unknown[]> };
    expect(backup.format).toBe('mi-plata-backup');
    expect(backup.data.categories).toEqual([{ id: 'c1', name: 'Comida', icon: '🍔', color: '#111111', isActive: true, sortOrder: 0, createdAt: 'x', updatedAt: 'x' }]);
    expect(backup.data.settings).toEqual([{ key: 'theme', value: 'dark' }]);
    expect(backup.data.cardStatementDates).toEqual([{ paymentMethodId: 'm1', period: '2026-10', cutDate: '2026-10-15', dueDate: '2026-11-02' }]);
    // Las tablas que la base de datos todavía no tenía quedan vacías.
    expect(backup.data.savingsAccounts).toEqual([]);
    expect(backup.data.expenses).toEqual([]);
  });

  it('no confunde una copia normal con un volcado', () => {
    expect(isRawDump({ format: 'mi-plata-backup', data: {} })).toBe(false);
    expect(isRawDump('texto')).toBe(false);
    expect(isRawDump(null)).toBe(false);
  });

  it('rechaza un volcado de una versión más nueva o dañado', () => {
    expect(() => rawDumpToBackup(dump({}, { version: 2 }))).toThrow('más nueva');
    expect(() => rawDumpToBackup({ format: RAW_DUMP_FORMAT, version: 1 })).toThrow('no trae tablas');
    expect(() => rawDumpToBackup(dump({ categories: 'no es una lista' }))).toThrow('dañada');
    expect(() => rawDumpToBackup(dump({ categories: [5] }))).toThrow('dañada');
  });
});
