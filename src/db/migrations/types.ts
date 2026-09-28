import type { SqlValue } from '../types';

export type MigrationStatement = string | { sql: string; params?: SqlValue[] };

export interface Migration {
  version: number;
  name: string;
  /** Sentencias que se ejecutan en una sola transacción (texto = DDL; objeto = sentencia con parámetros). */
  statements: MigrationStatement[];
}
