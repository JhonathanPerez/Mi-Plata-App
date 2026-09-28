import { APP_NAME, BACKUP_FORMAT, BACKUP_VERSION, MAX_AMOUNT, PAYMENT_TYPES } from '@/config/constants';
import { isCycleRules } from '@/lib/cycles';
import { isValidIsoDate, isValidTime } from '@/lib/dates';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { nowIso } from '@/lib/ids';
import { backupRepository, type BackupData } from '@/repositories/backupRepository';
import { cardCycleRepository, type StoredStatementDates } from '@/repositories/cardCycleRepository';
import { budgetRepository } from '@/repositories/budgetRepository';
import { categoryRepository } from '@/repositories/categoryRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { Budget, Category, Expense, PaymentMethod, PaymentMethodType } from '@/types/models';

export interface BackupFile {
  format: string;
  version: number;
  app: string;
  exportedAt: string;
  data: BackupData;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const asStamp = (value: unknown): string => (isText(value) ? value : nowIso());
const asNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function fail(what: string, index: number): never {
  throw new ValidationError(`La copia de seguridad está dañada (${what} #${index + 1}).`);
}

function readCategory(raw: unknown, index: number): Category {
  if (!isRecord(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.icon) || !isText(raw.color)) {
    return fail('categoría', index);
  }
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    color: raw.color,
    isActive: raw.isActive !== false,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : index,
    createdAt: asStamp(raw.createdAt),
    updatedAt: asStamp(raw.updatedAt),
  };
}

function readMethod(raw: unknown, index: number): PaymentMethod {
  if (
    !isRecord(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.icon) || !isText(raw.color) ||
    !PAYMENT_TYPES.includes(raw.type as PaymentMethodType)
  ) {
    return fail('método de pago', index);
  }
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type as PaymentMethodType,
    icon: raw.icon,
    color: raw.color,
    last4: typeof raw.last4 === 'string' && /^\d{4}$/.test(raw.last4) ? raw.last4 : null,
    isActive: raw.isActive !== false,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : index,
    creditLimit: asNullableNumber(raw.creditLimit),
    cutoffDay: asNullableNumber(raw.cutoffDay),
    dueDay: asNullableNumber(raw.dueDay),
    cycle: isCycleRules(raw.cycle) ? raw.cycle : null,
    createdAt: asStamp(raw.createdAt),
    updatedAt: asStamp(raw.updatedAt),
  };
}

function readExpense(raw: unknown, index: number): Expense {
  if (
    !isRecord(raw) || !isText(raw.id) || !isText(raw.categoryId) || !isText(raw.paymentMethodId) ||
    typeof raw.amount !== 'number' || !Number.isInteger(raw.amount) || raw.amount <= 0 || raw.amount > MAX_AMOUNT ||
    typeof raw.date !== 'string' || !isValidIsoDate(raw.date)
  ) {
    return fail('gasto', index);
  }
  const time = typeof raw.time === 'string' && isValidTime(raw.time) ? raw.time : null;
  // Copias antiguas (versión 1) no traen el estado: todo lo que registraron ya estaba pagado.
  const paidAt = 'paidAt' in raw ? (typeof raw.paidAt === 'string' && isValidIsoDate(raw.paidAt) ? raw.paidAt : null) : raw.date;
  return {
    id: raw.id,
    amount: raw.amount,
    categoryId: raw.categoryId,
    paymentMethodId: raw.paymentMethodId,
    date: raw.date,
    time,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note : null,
    paidAt,
    createdAt: asStamp(raw.createdAt),
    updatedAt: asStamp(raw.updatedAt),
  };
}

function readBudget(raw: unknown, index: number): Budget {
  if (
    !isRecord(raw) || !isText(raw.id) || typeof raw.yearMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.yearMonth) ||
    typeof raw.amount !== 'number' || !Number.isInteger(raw.amount) || raw.amount < 0 || raw.amount > MAX_AMOUNT
  ) {
    return fail('presupuesto', index);
  }
  return {
    id: raw.id,
    yearMonth: raw.yearMonth,
    amount: raw.amount,
    createdAt: asStamp(raw.createdAt),
    updatedAt: asStamp(raw.updatedAt),
  };
}

function readStatementDates(raw: unknown, index: number): StoredStatementDates {
  if (
    !isRecord(raw) || !isText(raw.paymentMethodId) || typeof raw.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.period) ||
    typeof raw.cutDate !== 'string' || !isValidIsoDate(raw.cutDate) || typeof raw.dueDate !== 'string' || !isValidIsoDate(raw.dueDate)
  ) {
    return fail('fechas de extracto', index);
  }
  return { paymentMethodId: raw.paymentMethodId, period: raw.period, cutDate: raw.cutDate, dueDate: raw.dueDate };
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(`La copia de seguridad está dañada (falta la lista de ${what}).`);
  return value;
}

function assertUnique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) throw new ValidationError(message);
}

/** Valida y limpia el contenido de una copia. Nunca confía en el archivo tal como llega. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError('Este archivo no es una copia de seguridad válida.');
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT || !isRecord(raw.data)) {
    throw new ValidationError('Este archivo no es una copia de seguridad de Mi Plata.');
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new ValidationError('La copia fue creada con una versión más nueva de la app. Actualiza Mi Plata para restaurarla.');
  }

  const categories = list(raw.data.categories, 'categorías').map(readCategory);
  const paymentMethods = list(raw.data.paymentMethods, 'métodos de pago').map(readMethod);
  const expenses = list(raw.data.expenses, 'gastos').map(readExpense);
  const budgets = list(raw.data.budgets, 'presupuestos').map(readBudget);
  const cardStatementDates = (Array.isArray(raw.data.cardStatementDates) ? raw.data.cardStatementDates : []).map(readStatementDates);
  const settings = (Array.isArray(raw.data.settings) ? raw.data.settings : [])
    .filter((item): item is Json => isRecord(item) && isText(item.key) && typeof item.value === 'string')
    .map((item) => ({ key: String(item.key), value: String(item.value) }));

  assertUnique(categories.map((c) => c.id), 'La copia tiene categorías repetidas.');
  assertUnique(categories.map((c) => c.name.toLowerCase()), 'La copia tiene categorías con el mismo nombre.');
  assertUnique(paymentMethods.map((m) => m.id), 'La copia tiene métodos de pago repetidos.');
  assertUnique(paymentMethods.map((m) => m.name.toLowerCase()), 'La copia tiene métodos de pago con el mismo nombre.');
  assertUnique(expenses.map((e) => e.id), 'La copia tiene gastos repetidos.');
  assertUnique(budgets.map((b) => b.yearMonth), 'La copia tiene presupuestos repetidos.');

  const categoryIds = new Set(categories.map((c) => c.id));
  const methodIds = new Set(paymentMethods.map((m) => m.id));
  expenses.forEach((expense, index) => {
    if (!categoryIds.has(expense.categoryId) || !methodIds.has(expense.paymentMethodId)) fail('gasto', index);
  });
  cardStatementDates.forEach((item, index) => {
    if (!methodIds.has(item.paymentMethodId)) fail('fechas de extracto', index);
  });
  assertUnique(cardStatementDates.map((d) => `${d.paymentMethodId}|${d.period}`), 'La copia tiene extractos repetidos.');

  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    app: typeof raw.app === 'string' ? raw.app : APP_NAME,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : nowIso(),
    data: { categories, paymentMethods, expenses, budgets, settings, cardStatementDates },
  };
}

export const backupService = {
  async createBackup(): Promise<BackupFile> {
    const [categories, paymentMethods, expenses, budgets, settings, cardStatementDates] = await Promise.all([
      categoryRepository.list(true),
      paymentMethodRepository.list(true),
      expenseRepository.listAllRaw(),
      budgetRepository.listAll(),
      settingsRepository.listAll(),
      cardCycleRepository.listAll(),
    ]);
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: APP_NAME,
      exportedAt: nowIso(),
      data: { categories, paymentMethods, expenses, budgets, settings, cardStatementDates },
    };
  },

  /** Crea la copia y abre el menú de guardar/compartir. */
  async exportBackupFile(): Promise<{ fileName: string; outcome: 'shared' | 'downloaded' | 'cancelled' }> {
    const backup = await this.createBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `MiPlata_copia_${stamp}.json`;
    const { saveAndShareFile, textToBytes } = await import('@/lib/fileIO');
    const outcome = await saveAndShareFile({
      fileName,
      bytes: textToBytes(JSON.stringify(backup)),
      mimeType: 'application/json',
      title: 'Copia de seguridad de Mi Plata',
    });
    return { fileName, outcome };
  },

  /** Reemplaza todos los datos actuales por los de la copia. */
  async restore(text: string): Promise<{ expenses: number; categories: number; paymentMethods: number }> {
    const backup = parseBackup(text);
    await backupRepository.replaceAll(backup.data);
    notifyDataChanged();
    return {
      expenses: backup.data.expenses.length,
      categories: backup.data.categories.length,
      paymentMethods: backup.data.paymentMethods.length,
    };
  },
};
