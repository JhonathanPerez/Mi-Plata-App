import { migration001 } from './001_init';
import { migration002 } from './002_transferencia';
import { migration003 } from './003_pending_captures';
import { migration004 } from './004_paid_status_and_cycles';
import { migration005 } from './005_spam_learning';
import type { Migration } from './types';

/**
 * Lista ordenada de migraciones. Para cambiar el esquema o los datos base (por ejemplo, cuotas de tarjeta)
 * crea `005_algo.ts` y añádelo aquí: nunca edites una migración ya publicada.
 */
export const migrations: Migration[] = [migration001, migration002, migration003, migration004, migration005];
