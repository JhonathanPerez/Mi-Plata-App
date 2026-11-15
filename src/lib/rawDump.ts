import { APP_NAME, BACKUP_FORMAT, BACKUP_VERSION } from '@/config/constants';
import { toBudget, toCategory, toExpense, toPaymentMethod, toSavingsAccount, toSavingsMovement } from '@/db/mappers';
import type { Row } from '@/db/types';
import { ValidationError } from './errors';

/**
 * Volcado de la base de datos: las filas de cada tabla tal cual están guardadas (columnas en snake_case). Es lo que escribe
 * la tarea en segundo plano de Android, que corre sin la app y por eso no puede usar el código de la app para armar la
 * copia. Aquí se convierte a la copia de siempre con las MISMAS funciones que lee la app (`db/mappers`): así hay un solo
 * lugar que sabe interpretar una fila, y una copia hecha en segundo plano se restaura igual que cualquier otra.
 */
export const RAW_DUMP_FORMAT = 'mi-plata-raw-dump';
export const RAW_DUMP_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function isRawDump(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.format === RAW_DUMP_FORMAT;
}

function rowsOf(tables: Record<string, unknown>, name: string): Row[] {
  const value = tables[name];
  // Una tabla que esta versión de la base de datos todavía no tenía (cuentas de ahorro, por ejemplo) es una lista vacía.
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isRecord)) throw new ValidationError(`La copia está dañada: la tabla «${name}» no es válida.`);
  return value as Row[];
}

// Mismo mapeo que `cardCycleRepository`: la prueba de equivalencia con una copia normal cuida que no se desvíen.
const toStatementDates = (row: Row) => ({
  paymentMethodId: String(row.payment_method_id),
  period: String(row.period),
  cutDate: String(row.cut_date),
  dueDate: String(row.due_date),
});

/** Convierte un volcado en el objeto de una copia de seguridad normal (que luego valida `parseBackup` como siempre). */
export function rawDumpToBackup(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.version !== 'number' || raw.version > RAW_DUMP_VERSION) {
    throw new ValidationError('La copia fue creada con una versión más nueva de la app. Actualiza Mi Plata para restaurarla.');
  }
  if (!isRecord(raw.tables)) throw new ValidationError('La copia está dañada: no trae tablas.');
  const tables = raw.tables;
  try {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: APP_NAME,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      data: {
        categories: rowsOf(tables, 'categories').map(toCategory),
        paymentMethods: rowsOf(tables, 'payment_methods').map(toPaymentMethod),
        expenses: rowsOf(tables, 'expenses').map(toExpense),
        budgets: rowsOf(tables, 'budgets').map(toBudget),
        settings: rowsOf(tables, 'settings').map((row) => ({ key: String(row.key), value: String(row.value) })),
        cardStatementDates: rowsOf(tables, 'card_statement_dates').map(toStatementDates),
        savingsAccounts: rowsOf(tables, 'savings_accounts').map(toSavingsAccount),
        savingsMovements: rowsOf(tables, 'savings_movements').map(toSavingsMovement),
      },
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('La copia está dañada: no se pudieron leer sus datos.');
  }
}
