import type { Db } from './types';

let dbPromise: Promise<Db> | null = null;

/** Conexión única y perezosa a la base de datos local. */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = import('./capacitorDb')
      .then((module) => module.openCapacitorDb())
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

/** Solo para pruebas: inyecta otra implementación de Db. */
export function setDbForTesting(db: Db | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}
