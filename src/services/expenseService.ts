import { MAX_AMOUNT, NOTE_MAX_LENGTH, SETTING_KEYS } from '@/config/constants';
import { isValidIsoDate, isValidTime, todayIso } from '@/lib/dates';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { formatCOP } from '@/lib/money';
import { normalizeText } from '@/lib/text';
import { categoryRepository } from '@/repositories/categoryRepository';
import { expenseRepository } from '@/repositories/expenseRepository';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import { settingsRepository } from '@/repositories/settingsRepository';
import type { Expense, ExpenseFilters, ExpenseInput, ExpenseWithRefs, IsoDate, PaymentMethodType } from '@/types/models';

export type ExpenseField = 'amount' | 'category' | 'method' | 'date' | 'time' | 'note';
export type ExpenseFieldErrors = Partial<Record<ExpenseField, string>>;

export interface ValidateExpenseOptions {
  /**
   * Exige descripción. Es una regla del formulario: los gastos importados, los de pruebas y los
   * anteriores a esta regla pueden no tenerla, así que el servicio no la impone por defecto.
   */
  requireNote?: boolean;
}

/** Validación pura (sin base de datos). La usa el formulario para mostrar errores en línea. */
export function validateExpenseInput(input: ExpenseInput, options: ValidateExpenseOptions = {}): ExpenseFieldErrors {
  const errors: ExpenseFieldErrors = {};

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = 'Escribe un valor mayor a $0.';
  } else if (!Number.isInteger(input.amount)) {
    errors.amount = 'Usa pesos enteros, sin decimales.';
  } else if (input.amount > MAX_AMOUNT) {
    errors.amount = `El valor máximo es ${formatCOP(MAX_AMOUNT)}.`;
  }

  if (!input.categoryId) errors.category = 'Elige una categoría.';
  if (!input.paymentMethodId) errors.method = 'Elige cómo pagaste.';

  if (!isValidIsoDate(input.date)) {
    errors.date = 'La fecha no es válida.';
  } else {
    const year = Number(input.date.slice(0, 4));
    if (year < 2000 || year > 2100) errors.date = 'Usa una fecha entre 2000 y 2100.';
  }

  if (input.time !== null && !isValidTime(input.time)) errors.time = 'La hora no es válida.';
  if (options.requireNote && !input.note?.trim()) {
    errors.note = 'Escribe una descripción.';
  } else if (input.note && input.note.trim().length > NOTE_MAX_LENGTH) {
    errors.note = `Máximo ${NOTE_MAX_LENGTH} caracteres.`;
  }
  return errors;
}

interface Prepared {
  input: ExpenseInput;
  methodType: PaymentMethodType;
}

/**
 * Fecha de pago que le corresponde a un gasto.
 *  - Sin indicarlo, un gasto nuevo con tarjeta de crédito queda POR PAGAR y con cualquier otro método, PAGADO.
 *  - Al editar sin indicarlo, se conserva el estado que tenía.
 *  - Un gasto nuevo "pagado" se pagó el mismo día; uno existente que pasa a pagado, hoy.
 */
export function decidePaidAt(
  input: Pick<ExpenseInput, 'paid' | 'date'>,
  methodType: PaymentMethodType,
  existing: Pick<Expense, 'paidAt'> | null,
  today: IsoDate,
): IsoDate | null {
  const paid = input.paid ?? (existing ? existing.paidAt !== null : methodType !== 'credit_card');
  if (!paid) return null;
  if (existing?.paidAt) return existing.paidAt;
  return existing ? today : input.date;
}

async function prepare(input: ExpenseInput): Promise<Prepared> {
  const errors = validateExpenseInput(input);
  const first = Object.values(errors)[0];
  if (first) throw new ValidationError(first);

  const [category, method] = await Promise.all([
    categoryRepository.getById(input.categoryId),
    paymentMethodRepository.getById(input.paymentMethodId),
  ]);
  if (!category) throw new ValidationError('La categoría elegida ya no existe.', 'category');
  if (!method) throw new ValidationError('El método de pago elegido ya no existe.', 'method');

  const note = input.note ? input.note.trim() : '';
  return { input: { ...input, note: note.length > 0 ? note : null }, methodType: method.type };
}

export const expenseService = {
  /**
   * Crea un gasto. Si viene de un aviso detectado automáticamente (`fromPendingId`), el aviso se marca como
   * categorizado en la misma transacción: nunca queda el gasto guardado y el pendiente vivo (ni al revés).
   */
  async create(input: ExpenseInput, options: { fromPendingId?: string } = {}): Promise<Expense> {
    const { input: clean, methodType } = await prepare(input);
    const now = nowIso();
    const expense: Expense = {
      id: newId(),
      amount: clean.amount,
      categoryId: clean.categoryId,
      paymentMethodId: clean.paymentMethodId,
      date: clean.date,
      time: clean.time,
      note: clean.note,
      paidAt: decidePaidAt(clean, methodType, null, todayIso()),
      createdAt: now,
      updatedAt: now,
    };
    if (options.fromPendingId) await expenseRepository.insertFromPending(expense, options.fromPendingId);
    else await expenseRepository.insert(expense);
    // Recuerda el último método usado para dejarlo preseleccionado la próxima vez.
    await settingsRepository.set(SETTING_KEYS.lastPaymentMethodId, expense.paymentMethodId);
    notifyDataChanged();
    return expense;
  },

  async update(id: string, input: ExpenseInput): Promise<Expense> {
    const existing = await expenseRepository.getById(id);
    if (!existing) throw new ValidationError('Este gasto ya no existe.');
    const { input: clean, methodType } = await prepare(input);
    const updated: Expense = {
      ...existing,
      amount: clean.amount,
      categoryId: clean.categoryId,
      paymentMethodId: clean.paymentMethodId,
      date: clean.date,
      time: clean.time,
      note: clean.note,
      paidAt: decidePaidAt(clean, methodType, existing, todayIso()),
      updatedAt: nowIso(),
    };
    await expenseRepository.update(updated);
    notifyDataChanged();
    return updated;
  },

  /** Marca un gasto como pagado (hoy) o de nuevo como por pagar. Sirve para el gesto de deslizar en el historial. */
  async setPaid(id: string, paid: boolean, today: IsoDate = todayIso()): Promise<void> {
    const existing = await expenseRepository.getById(id);
    if (!existing) throw new ValidationError('Este gasto ya no existe.');
    await expenseRepository.setPaid([id], paid ? (existing.paidAt ?? today) : null, nowIso());
    notifyDataChanged();
  },

  async remove(id: string): Promise<void> {
    await expenseRepository.remove(id);
    notifyDataChanged();
  },

  getById(id: string): Promise<Expense | null> {
    return expenseRepository.getById(id);
  },

  /** Lista gastos con filtros. La búsqueda de texto ignora mayúsculas y tildes. */
  async list(filters: ExpenseFilters = {}): Promise<ExpenseWithRefs[]> {
    const { search, limit, ...sqlFilters } = filters;
    const term = search ? normalizeText(search) : '';

    if (!term) return expenseRepository.query({ ...sqlFilters, limit });

    const numericTerm = /^[\d.$\s]+$/.test(term) ? term.replace(/\D/g, '') : '';
    const rows = await expenseRepository.query(sqlFilters);
    const matches = rows.filter((expense) => {
      const haystack = normalizeText(`${expense.note ?? ''} ${expense.categoryName} ${expense.paymentMethodName}`);
      if (haystack.includes(term)) return true;
      return numericTerm.length > 0 && String(expense.amount).includes(numericTerm);
    });
    return limit && limit > 0 ? matches.slice(0, limit) : matches;
  },
};
