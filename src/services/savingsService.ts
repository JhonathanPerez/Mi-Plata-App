import { NAME_MAX_LENGTH } from '@/config/constants';
import { getDb } from '@/db/connection';
import { notifyDataChanged } from '@/lib/dataBus';
import { todayIso } from '@/lib/dates';
import { ValidationError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { ADJUSTMENT_NOTE, adjustmentFor, insufficientMessage, totalsOf, validateMovement, withRunningBalance, type MovementTotals, type MovementWithBalance } from '@/lib/savings';
import { isEmoji, pluralize } from '@/lib/text';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import { savingsRepository } from '@/repositories/savingsRepository';
import type {
  IsoDate,
  PaymentMethod,
  SavingsAccount,
  SavingsAccountInput,
  SavingsAccountWithBalance,
  SavingsMovement,
  SavingsMovementInput,
} from '@/types/models';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface SavingsDetail {
  account: SavingsAccount;
  balance: number;
  totals: MovementTotals;
  /** Del más reciente al más antiguo, cada uno con el saldo que quedó después. */
  movements: MovementWithBalance[];
  /** Gastos que se pagaron con esta cuenta. */
  expenseCount: number;
}

function cleanAccount(input: SavingsAccountInput): SavingsAccountInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new ValidationError('Escribe un nombre para la cuenta.', 'name');
  if (name.length > NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre puede tener máximo ${NAME_MAX_LENGTH} caracteres.`, 'name');
  }
  const icon = input.icon.trim();
  if (!icon || icon.length > 20 || !isEmoji(icon)) throw new ValidationError('Elige un emoji como icono.', 'icon');
  if (!HEX_COLOR.test(input.color)) throw new ValidationError('Elige un color válido.', 'color');
  const last4 = input.last4 ? input.last4.trim() : '';
  if (last4 && !/^\d{4}$/.test(last4)) {
    throw new ValidationError('Escribe solo los últimos 4 dígitos (o déjalo vacío).', 'last4');
  }
  return { name, last4: last4 || null, icon, color: input.color, isActive: input.isActive };
}

/** El nombre de la cuenta también es el de su método de pago «espejo», así que no puede repetir ni el de otra cuenta ni el de un método. */
async function assertUniqueName(name: string, selfId: string | null): Promise<void> {
  const method = await paymentMethodRepository.findByName(name);
  const isOwnMirror = method !== null && selfId !== null && method.savingsAccountId === selfId;
  if (method && !isOwnMirror) throw new ValidationError('Ya existe una cuenta o un método de pago con ese nombre.', 'name');
}

function mirrorOf(account: SavingsAccount, sortOrder: number, now: string): PaymentMethod {
  return {
    id: newId(),
    name: account.name,
    type: 'other',
    icon: account.icon,
    color: account.color,
    last4: account.last4,
    isActive: account.isActive,
    sortOrder,
    creditLimit: null,
    cutoffDay: null,
    dueDay: null,
    cycle: null,
    savingsAccountId: account.id,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanNote(note: string | null): string | null {
  const text = note ? note.trim() : '';
  return text.length > 0 ? text : null;
}

export const savingsService = {
  listAccounts(includeInactive = false): Promise<SavingsAccountWithBalance[]> {
    return savingsRepository.listAccountsWithBalance(includeInactive);
  },

  /** Plata total guardada en las cuentas activas (para Inicio). */
  async totalSaved(): Promise<{ total: number; accounts: number }> {
    const accounts = await savingsRepository.listAccountsWithBalance(false);
    return { total: accounts.reduce((sum, account) => sum + account.balance, 0), accounts: accounts.length };
  },

  async getDetail(id: string): Promise<SavingsDetail | null> {
    const account = await savingsRepository.getAccount(id);
    if (!account) return null;
    const [movements, expenseCount] = await Promise.all([savingsRepository.listMovements(id), savingsRepository.countExpenseMovements(id)]);
    const totals = totalsOf(movements);
    return { account, balance: totals.deposited - totals.withdrawn, totals, movements: withRunningBalance(movements), expenseCount };
  },

  /** Crea la cuenta (con su método de pago espejo) y, si se indica, el saldo inicial como un primer ingreso. Todo o nada. */
  async createAccount(input: SavingsAccountInput, openingBalance = 0): Promise<SavingsAccount> {
    const data = cleanAccount(input);
    if (!Number.isInteger(openingBalance) || openingBalance < 0) throw new ValidationError('El saldo inicial no es válido.', 'openingBalance');
    if (openingBalance > 0) {
      const problem = validateMovement({ amount: openingBalance, date: todayIso(), note: null }).amount;
      if (problem) throw new ValidationError(problem, 'openingBalance');
    }
    await assertUniqueName(data.name, null);
    const now = nowIso();
    const account: SavingsAccount = { id: newId(), ...data, sortOrder: await savingsRepository.nextSortOrder(), createdAt: now, updatedAt: now };
    const mirror = mirrorOf(account, await paymentMethodRepository.nextSortOrder(), now);

    const db = await getDb();
    await db.transaction(async () => {
      await savingsRepository.insertAccount(account);
      await paymentMethodRepository.insert(mirror);
      if (openingBalance > 0) {
        await savingsRepository.insertMovement({
          id: newId(),
          accountId: account.id,
          kind: 'deposit',
          amount: openingBalance,
          date: todayIso(),
          note: 'Saldo inicial',
          expenseId: null,
          createdAt: now,
        });
      }
    });
    notifyDataChanged();
    return account;
  },

  /** Edita la cuenta y mantiene al día su método de pago espejo (nombre, icono, color y si aparece al registrar gastos). */
  async updateAccount(id: string, input: SavingsAccountInput): Promise<SavingsAccount> {
    const existing = await savingsRepository.getAccount(id);
    if (!existing) throw new ValidationError('Esta cuenta ya no existe.');
    const data = cleanAccount(input);
    await assertUniqueName(data.name, id);
    const now = nowIso();
    const updated: SavingsAccount = { ...existing, ...data, updatedAt: now };

    const db = await getDb();
    await db.transaction(async () => {
      await savingsRepository.updateAccount(updated);
      const mirror = await paymentMethodRepository.getBySavingsAccount(id);
      if (mirror) {
        await paymentMethodRepository.update({ ...mirror, name: updated.name, last4: updated.last4, icon: updated.icon, color: updated.color, isActive: updated.isActive, updatedAt: now });
      }
    });
    notifyDataChanged();
    return updated;
  },

  /** Elimina la cuenta y sus movimientos. Si ya pagó gastos no se puede: esos gastos quedarían sin origen del dinero. */
  async removeAccount(id: string): Promise<void> {
    const existing = await savingsRepository.getAccount(id);
    if (!existing) return;
    const mirror = await paymentMethodRepository.getBySavingsAccount(id);
    const paidExpenses = Math.max(await savingsRepository.countExpenseMovements(id), mirror ? await paymentMethodRepository.countExpenses(mirror.id) : 0);
    if (paidExpenses > 0) {
      throw new ValidationError(
        `«${existing.name}» pagó ${paidExpenses} ${pluralize(paidExpenses, 'gasto', 'gastos')} y no se puede eliminar. Puedes ocultarla para que no aparezca al registrar gastos.`,
      );
    }
    const db = await getDb();
    await db.transaction(async () => {
      await savingsRepository.removeAccount(id);
      if (mirror) await paymentMethodRepository.remove(mirror.id);
    });
    notifyDataChanged();
  },

  /**
   * Cuadra la cuenta con el saldo que dice el banco: crea un ingreso o un retiro por la diferencia y lo deja en los
   * movimientos como «Ajuste de saldo». Así el historial sigue contando qué pasó, en vez de sobrescribir el saldo.
   */
  async adjustBalance(accountId: string, bankBalance: number, date: IsoDate = todayIso()): Promise<SavingsMovement> {
    if (!Number.isInteger(bankBalance) || bankBalance < 0) throw new ValidationError('Escribe el saldo que ves en el banco.', 'amount');
    const current = await savingsRepository.getBalance(accountId);
    const adjustment = adjustmentFor(current, bankBalance);
    if (!adjustment) throw new ValidationError('El saldo ya coincide con el del banco.', 'amount');
    return savingsService.addMovement({ accountId, ...adjustment, date, note: ADJUSTMENT_NOTE });
  },

  /** Registra un ingreso o un retiro manual. Un retiro nunca puede superar el saldo. */
  async addMovement(input: SavingsMovementInput): Promise<SavingsMovement> {
    const errors = validateMovement(input, { maxDate: todayIso() });
    const first = Object.entries(errors)[0];
    if (first) throw new ValidationError(first[1], first[0]);
    if (input.kind !== 'deposit' && input.kind !== 'withdrawal') throw new ValidationError('El tipo de movimiento no es válido.');

    const account = await savingsRepository.getAccount(input.accountId);
    if (!account) throw new ValidationError('Esta cuenta ya no existe.');
    if (input.kind === 'withdrawal') {
      const balance = await savingsRepository.getBalance(account.id);
      if (input.amount > balance) throw new ValidationError(insufficientMessage(account.name, balance), 'amount');
    }
    const movement: SavingsMovement = {
      id: newId(),
      accountId: account.id,
      kind: input.kind,
      amount: input.amount,
      date: input.date,
      note: cleanNote(input.note),
      expenseId: null,
      createdAt: nowIso(),
    };
    await savingsRepository.insertMovement(movement);
    notifyDataChanged();
    return movement;
  },

  /**
   * Borra un movimiento manual (para corregir un error). Los retiros que pagaron un gasto se manejan desde el gasto,
   * y no se puede borrar un ingreso si lo que ya se sacó dejaría la cuenta en negativo.
   */
  async removeMovement(id: string): Promise<void> {
    const movement = await savingsRepository.getMovement(id);
    if (!movement) return;
    if (movement.expenseId) {
      throw new ValidationError('Este retiro pagó un gasto. Edita o elimina el gasto para devolver la plata a la cuenta.');
    }
    if (movement.kind === 'deposit') {
      const balance = await savingsRepository.getBalance(movement.accountId);
      if (balance - movement.amount < 0) {
        throw new ValidationError('No se puede borrar este ingreso: la plata ya se usó y la cuenta quedaría en negativo.');
      }
    }
    await savingsRepository.removeMovement(id);
    notifyDataChanged();
  },
};

