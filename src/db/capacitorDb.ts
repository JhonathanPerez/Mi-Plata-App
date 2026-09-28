import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { DB_NAME } from '@/config/constants';
import type { Db, Row, SqlValue } from './types';

const sqlite = new SQLiteConnection(CapacitorSQLite);
const isWeb = Capacitor.getPlatform() === 'web';

class CapacitorDb implements Db {
  private inTransaction = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly conn: SQLiteDBConnection) {}

  async execute(sql: string): Promise<void> {
    await this.conn.execute(sql, !this.inTransaction);
    await this.persistWeb();
  }

  async run(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.conn.run(sql, params, !this.inTransaction);
    await this.persistWeb();
  }

  async runMany(sql: string, rows: SqlValue[][]): Promise<void> {
    if (rows.length === 0) return;
    const set = rows.map((values) => ({ statement: sql, values }));
    await this.conn.executeSet(set, !this.inTransaction);
    await this.persistWeb();
  }

  async query<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const result = await this.conn.query(sql, params);
    const rows = (result.values ?? []) as Row[];
    // En iOS el primer elemento es metadata de columnas; en Android no existe.
    return rows.filter((row) => !('ios_columns' in row)) as unknown as T[];
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.inTransaction) return work();

    const execute = async (): Promise<T> => {
      await this.conn.beginTransaction();
      this.inTransaction = true;
      try {
        const result = await work();
        await this.conn.commitTransaction();
        this.inTransaction = false;
        await this.persistWeb();
        return result;
      } catch (error) {
        this.inTransaction = false;
        try {
          await this.conn.rollbackTransaction();
        } catch {
          // Si el rollback falla no hay nada más que hacer; se propaga el error original.
        }
        throw error;
      }
    };

    // Serializa transacciones para que nunca se mezclen.
    const next = this.queue.then(execute, execute);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** En navegador (solo desarrollo) SQLite vive en memoria: hay que volcarlo a IndexedDB. */
  private async persistWeb(): Promise<void> {
    if (isWeb && !this.inTransaction) await sqlite.saveToStore(DB_NAME);
  }
}

export async function openCapacitorDb(): Promise<Db> {
  if (isWeb) {
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    await defineCustomElements(window);
    if (!document.querySelector('jeep-sqlite')) {
      document.body.appendChild(document.createElement('jeep-sqlite'));
    }
    await customElements.whenDefined('jeep-sqlite');
    await sqlite.initWebStore();
  }

  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;

  const conn: SQLiteDBConnection =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;', false);
  return new CapacitorDb(conn);
}
