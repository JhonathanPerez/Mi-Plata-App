export type SqlValue = string | number | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/**
 * Contrato mínimo de base de datos que usa toda la app.
 * Implementaciones: SQLite nativo/web vía Capacitor (producción) y node:sqlite (pruebas).
 */
export interface Db {
  /** Ejecuta una o varias sentencias sin parámetros (DDL). */
  execute(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  /** Ejecuta la misma sentencia para muchas filas (importaciones masivas). */
  runMany(sql: string, rows: SqlValue[][]): Promise<void>;
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Todo o nada. Las transacciones anidadas se unen a la exterior. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
