/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_PAYMENT_ICON,
  MAX_AMOUNT,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
} from '@/config/constants';
import { getDb } from '@/db/connection';
import { isValidIsoDate } from '@/lib/dates';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { parseLooseAmount } from '@/lib/money';
import { normalizeText } from '@/lib/text';
import { categoryRepository } from '@/repositories/categoryRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import type { Category, Expense, IsoDate, PaymentMethod } from '@/types/models';

export interface ParsedImportRow {
  line: number;
  date: IsoDate;
  category: string;
  note: string | null;
  method: string;
  amount: number;
  /** false = "Por pagar". Sin la columna Estado (o vacía) los gastos entran como pagados. */
  paid: boolean;
}

export interface ParseResult {
  rows: ParsedImportRow[];
  errors: string[];
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  createdCategories: number;
  createdMethods: number;
  errors: string[];
}

const pad = (n: number): string => String(n).padStart(2, '0');

function fromUtcParts(date: Date): IsoDate {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Acepta Date (Excel), número de serie de Excel, "dd/mm/yyyy" y "yyyy-mm-dd". */
export function parseImportedDate(value: unknown): IsoDate | null {
  let iso: string | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    iso = fromUtcParts(value);
  } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    iso = fromUtcParts(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000));
  } else if (typeof value === 'string') {
    const text = value.trim();
    let match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (match) iso = `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!iso && match) iso = `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
  }
  if (!iso || !isValidIsoDate(iso)) return null;
  const year = Number(iso.slice(0, 4));
  return year >= 2000 && year <= 2100 ? iso : null;
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

/** Convierte la cuadrícula de celdas de la hoja en filas de gasto. Función pura y probada. */
export function parseImportRows(grid: unknown[][]): ParseResult {
  const cellText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(grid.length, 15); i += 1) {
    const normalized = grid[i].map((cell) => normalizeText(cellText(cell)));
    if (normalized.includes('fecha') && (normalized.includes('valor') || normalized.includes('monto'))) {
      headerIndex = i;
      headers = normalized;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new ValidationError(
      'No encontré las columnas del archivo. Usa una hoja con Fecha, Categoría, Descripción, Método de pago y Valor.',
    );
  }

  const colDate = findColumn(headers, ['fecha']);
  const colCategory = findColumn(headers, ['categoria']);
  const colNote = findColumn(headers, ['descripcion', 'nota', 'notas', 'detalle']);
  const colMethod = findColumn(headers, ['metodo de pago', 'metodo', 'medio de pago']);
  const colAmount = findColumn(headers, ['valor', 'monto', 'importe']);
  const colStatus = findColumn(headers, ['estado']);

  const rows: ParsedImportRow[] = [];
  const errors: string[] = [];

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i];
    const line = i + 1;
    if (cells.every((cell) => cellText(cell).trim() === '')) continue;
    if (normalizeText(cellText(cells[colDate])) === 'total') continue;

    const date = parseImportedDate(cells[colDate]);
    const amount = parseLooseAmount(cells[colAmount]);
    if (!date) {
      errors.push(`Fila ${line}: la fecha no es válida.`);
      continue;
    }
    if (amount === null || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      errors.push(`Fila ${line}: el valor no es válido.`);
      continue;
    }

    const category = (colCategory >= 0 ? cellText(cells[colCategory]).trim() : '') || 'Otros';
    const method = (colMethod >= 0 ? cellText(cells[colMethod]).trim() : '') || 'Efectivo';
    const note = (colNote >= 0 ? cellText(cells[colNote]).trim() : '').slice(0, NOTE_MAX_LENGTH);
    const status = colStatus >= 0 ? normalizeText(cellText(cells[colStatus])) : '';
    const paid = !['por pagar', 'pendiente', 'sin pagar', 'no pagado', 'no'].includes(status);
    rows.push({ line, date, category, method, amount, paid, note: note || null });
  }
  return { rows, errors };
}

function cellToPrimitive(value: any): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'object') {
    if ('result' in value) return cellToPrimitive(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => part.text ?? '').join('');
    if ('text' in value) return String(value.text);
  }
  return String(value);
}

async function readXlsxGrid(buffer: ArrayBuffer): Promise<unknown[][]> {
  const module: any = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Gastos') ?? workbook.worksheets[0];
  if (!sheet) throw new ValidationError('El archivo no tiene hojas.');

  const grid: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
    const values: unknown[] = (row.values as unknown[]).slice(1).map(cellToPrimitive);
    grid[rowNumber - 1] = values;
  });
  // eachRow con includeEmpty puede dejar huecos; se rellenan con filas vacías.
  for (let i = 0; i < grid.length; i += 1) if (!grid[i]) grid[i] = [];
  return grid;
}

function shorten(name: string, fallback: string): string {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX_LENGTH);
  return clean || fallback;
}

/** Guarda las filas: crea categorías/métodos que falten y omite gastos ya existentes. */
export async function importRows(rows: ParsedImportRow[]): Promise<Omit<ImportResult, 'errors' | 'invalid'>> {
  const db = await getDb();
  let createdCategories = 0;
  let createdMethods = 0;
  let duplicates = 0;
  let imported = 0;

  await db.transaction(async () => {
    const categories = new Map<string, Category>();
    (await categoryRepository.list(true)).forEach((c) => categories.set(normalizeText(c.name), c));
    const methods = new Map<string, PaymentMethod>();
    // Los métodos «espejo» de las cuentas de ahorro no se usan al importar: un gasto importado no descuenta de ninguna cuenta.
    const allMethods = await paymentMethodRepository.list(true);
    allMethods.filter((m) => m.savingsAccountId === null).forEach((m) => methods.set(normalizeText(m.name), m));
    const savingsNames = new Set(allMethods.filter((m) => m.savingsAccountId !== null).map((m) => normalizeText(m.name)));

    let categoryOrder = await categoryRepository.nextSortOrder();
    let methodOrder = await paymentMethodRepository.nextSortOrder();
    const now = nowIso();

    const ensureCategory = async (rawName: string): Promise<Category> => {
      const name = shorten(rawName, 'Otros');
      const key = normalizeText(name);
      const found = categories.get(key);
      if (found) return found;
      const created: Category = {
        id: newId(), name, icon: DEFAULT_CATEGORY_ICON,
        color: CATEGORY_COLORS[(categories.size + createdCategories) % CATEGORY_COLORS.length],
        isActive: true, sortOrder: categoryOrder++, createdAt: now, updatedAt: now,
      };
      await categoryRepository.insert(created);
      categories.set(key, created);
      createdCategories += 1;
      return created;
    };

    const ensureMethod = async (rawName: string): Promise<PaymentMethod> => {
      const name = shorten(rawName, 'Efectivo');
      const key = normalizeText(name);
      const found = methods.get(key);
      if (found) return found;
      const isCash = key === 'efectivo';
      // El nombre de una cuenta de ahorro ya está tomado (los nombres de métodos no se repiten): el método importado lleva una marca.
      const uniqueName = savingsNames.has(key) ? shorten(`${name.slice(0, NAME_MAX_LENGTH - 12)} (importado)`, name) : name;
      const created: PaymentMethod = {
        id: newId(), name: uniqueName, type: isCash ? 'cash' : 'other', icon: isCash ? '💵' : DEFAULT_PAYMENT_ICON,
        color: CATEGORY_COLORS[(methods.size + createdMethods + 4) % CATEGORY_COLORS.length],
        last4: null, isActive: true, sortOrder: methodOrder++,
        creditLimit: null, cutoffDay: null, dueDay: null, cycle: null, savingsAccountId: null, createdAt: now, updatedAt: now,
      };
      await paymentMethodRepository.insert(created);
      methods.set(key, created);
      createdMethods += 1;
      return created;
    };

    // Gastos ya guardados en el mismo rango de fechas (se cuentan para respetar repetidos legítimos).
    const dates = rows.map((r) => r.date).sort();
    const existing = await expenseRepository.query({ from: dates[0], to: dates[dates.length - 1] });
    const seen = new Map<string, number>();
    const keyOf = (date: string, amount: number, categoryId: string, methodId: string, note: string | null): string =>
      `${date}|${amount}|${categoryId}|${methodId}|${normalizeText(note ?? '')}`;
    existing.forEach((e) => {
      const key = keyOf(e.date, e.amount, e.categoryId, e.paymentMethodId, e.note);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });

    const toInsert: Expense[] = [];
    for (const row of rows) {
      const category = await ensureCategory(row.category);
      const method = await ensureMethod(row.method);
      const key = keyOf(row.date, row.amount, category.id, method.id, row.note);
      const left = seen.get(key) ?? 0;
      if (left > 0) {
        seen.set(key, left - 1);
        duplicates += 1;
        continue;
      }
      toInsert.push({
        id: newId(), amount: row.amount, categoryId: category.id, paymentMethodId: method.id,
        date: row.date, time: null, note: row.note, paidAt: row.paid ? row.date : null, createdAt: now, updatedAt: now,
      });
    }
    await expenseRepository.insertMany(toInsert);
    imported = toInsert.length;
  });

  notifyDataChanged();
  return { imported, duplicates, createdCategories, createdMethods };
}

export const importService = {
  /** Importa gastos desde un .xlsx con las columnas: Fecha, Categoría, Descripción, Método de pago, Valor. */
  async importFromXlsx(buffer: ArrayBuffer): Promise<ImportResult> {
    let grid: unknown[][];
    try {
      grid = await readXlsxGrid(buffer);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('No pude leer el archivo. Asegúrate de que sea un Excel (.xlsx).');
    }
    const { rows, errors } = parseImportRows(grid);
    if (rows.length === 0) {
      throw new ValidationError(errors[0] ?? 'El archivo no tiene gastos para importar.');
    }
    const result = await importRows(rows);
    return { ...result, invalid: errors.length, errors: errors.slice(0, 10) };
  },
};
