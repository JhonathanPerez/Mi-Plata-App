import { MAX_AMOUNT, NOTE_MAX_LENGTH } from '@/config/constants';
import { isValidIsoDate } from '@/lib/dates';
import { formatCOP, percentOf } from '@/lib/money';
import type { IsoDate, SavingsAccount, SavingsMovement, SavingsMovementKind } from '@/types/models';

export type MovementField = 'amount' | 'date' | 'note';
export type MovementFieldErrors = Partial<Record<MovementField, string>>;

/** Lo que se necesita de un movimiento para sumar saldos. */
type Signed = Pick<SavingsMovement, 'kind' | 'amount'>;

/** «Cuenta de ahorro · •••• 1234» (sin los últimos 4 dígitos si no se guardaron). El espacio duro evita que puntos y dígitos queden en líneas distintas. */
export function describeAccount(last4: string | null): string {
  return last4 ? `Cuenta de ahorro · ••••\u00a0${last4}` : 'Cuenta de ahorro';
}

/** Ingreso suma, retiro resta. */
export function signedAmount(movement: Signed): number {
  return movement.kind === 'deposit' ? movement.amount : -movement.amount;
}

/** Saldo de una cuenta: ingresos menos retiros. */
export function balanceOf(movements: Signed[]): number {
  return movements.reduce((total, movement) => total + signedAmount(movement), 0);
}

export interface MovementTotals {
  deposited: number;
  withdrawn: number;
}

export function totalsOf(movements: Signed[]): MovementTotals {
  let deposited = 0;
  let withdrawn = 0;
  for (const movement of movements) {
    if (movement.kind === 'deposit') deposited += movement.amount;
    else withdrawn += movement.amount;
  }
  return { deposited, withdrawn };
}

export type MovementWithBalance = SavingsMovement & {
  /** Saldo de la cuenta justo después de este movimiento. */
  balanceAfter: number;
};

/** Orden cronológico estable: por fecha del movimiento y, a igual fecha, por el momento en que se registró. */
function chronological(a: SavingsMovement, b: SavingsMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Historial de la cuenta: del movimiento más reciente al más antiguo, cada uno con el saldo que quedó después.
 * El saldo corrido se calcula en orden cronológico, así un movimiento con fecha pasada se acomoda donde corresponde.
 */
export function withRunningBalance(movements: SavingsMovement[]): MovementWithBalance[] {
  let running = 0;
  return [...movements]
    .sort(chronological)
    .map((movement) => {
      running += signedAmount(movement);
      return { ...movement, balanceAfter: running };
    })
    .reverse();
}

/** Validación pura (sin base de datos) del formulario de ingreso o retiro. */
export function validateMovement(
  input: { amount: number; date: IsoDate; note: string | null },
  options: { maxDate?: IsoDate } = {},
): MovementFieldErrors {
  const errors: MovementFieldErrors = {};
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = 'Escribe un valor mayor a $0.';
  else if (!Number.isInteger(input.amount)) errors.amount = 'Usa pesos enteros, sin decimales.';
  else if (input.amount > MAX_AMOUNT) errors.amount = `El valor máximo es ${formatCOP(MAX_AMOUNT)}.`;

  if (!isValidIsoDate(input.date)) {
    errors.date = 'La fecha no es válida.';
  } else {
    const year = Number(input.date.slice(0, 4));
    if (year < 2000 || year > 2100) errors.date = 'Usa una fecha entre 2000 y 2100.';
    else if (options.maxDate && input.date > options.maxDate) errors.date = 'La fecha no puede ser futura.';
  }

  if (input.note && input.note.trim().length > NOTE_MAX_LENGTH) errors.note = `Máximo ${NOTE_MAX_LENGTH} caracteres.`;
  return errors;
}

/**
 * Movimiento que cuadra el saldo de la app con el que dice el banco. `null` si ya coinciden.
 * Si el banco tiene más, es un ingreso por la diferencia; si tiene menos, un retiro.
 */
export function adjustmentFor(currentBalance: number, bankBalance: number): { kind: SavingsMovementKind; amount: number } | null {
  const difference = bankBalance - currentBalance;
  if (difference === 0) return null;
  return { kind: difference > 0 ? 'deposit' : 'withdrawal', amount: Math.abs(difference) };
}

/** Nota de los movimientos que crea «Ajustar saldo». */
export const ADJUSTMENT_NOTE = 'Ajuste de saldo';

/** Mensaje cuando el retiro o el pago supera lo que hay en la cuenta. */
export function insufficientMessage(accountName: string, available: number): string {
  return available > 0
    ? `«${accountName}» solo tiene ${formatCOP(available)}. Baja el valor, o ingresa lo que falta si su saldo en el banco es mayor.`
    : `«${accountName}» no tiene saldo en la app. Ingresa plata, o ajusta el saldo si en el banco sí tiene.`;
}

/** Títulos de la lista de movimientos y de los botones: una sola fuente para los dos textos. */
export const MOVEMENT_LABELS: Record<SavingsMovementKind, { title: string; action: string; saved: string }> = {
  deposit: { title: 'Ingreso', action: 'Meter plata', saved: 'Ingreso guardado' },
  withdrawal: { title: 'Retiro', action: 'Sacar plata', saved: 'Retiro guardado' },
};

/** Texto del movimiento en la lista: la nota, o un título según su origen. */
export function movementTitle(movement: Pick<SavingsMovement, 'kind' | 'note' | 'expenseId'>): string {
  if (movement.note) return movement.note;
  if (movement.expenseId) return 'Pago de un gasto';
  return MOVEMENT_LABELS[movement.kind].title;
}

export interface SavingsMonthAccount {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Saldo al cerrar el mes. */
  balance: number;
  /** Lo que se metió en el mes. */
  deposited: number;
  /** Lo que salió en el mes, sea un retiro o un gasto pagado con la cuenta. */
  withdrawn: number;
  /** Parte del total ahorrado (al cerrar el mes) que tiene esta cuenta. */
  percent: number;
}

export interface SavingsMonthSummary {
  /** Hay al menos una cuenta activa: sin cuentas, Estadísticas no muestra la sección. */
  hasAccounts: boolean;
  /** Metido en el mes. */
  deposited: number;
  /** Retirado en el mes a mano (no pagó ningún gasto). */
  withdrawn: number;
  /** Retirado en el mes porque pagó gastos: ese dinero ya cuenta en «Total gastado». */
  spent: number;
  /** Lo que creció (o bajó) el ahorro: metido − retirado − gastos pagados. */
  net: number;
  /** Lo mismo del mes anterior. */
  previousNet: number;
  /** Total ahorrado al cerrar el mes, sumando las cuentas activas. */
  balance: number;
  /** Cuentas con movimientos en el mes o con saldo, de mayor a menor saldo. */
  accounts: SavingsMonthAccount[];
  hasActivity: boolean;
}

interface SummarizeInput {
  accounts: Array<Pick<SavingsAccount, 'id' | 'name' | 'icon' | 'color' | 'isActive'>>;
  movements: SavingsMovement[];
  from: IsoDate;
  to: IsoDate;
  previousFrom: IsoDate;
  previousTo: IsoDate;
}

/**
 * Resumen de ahorros de un mes para Estadísticas. Solo cuenta las cuentas activas (igual que el total de Inicio y de Ahorros).
 * Las fechas ISO se comparan como texto, que para AAAA-MM-DD equivale a compararlas como fechas.
 */
export function summarizeSavingsMonth({ accounts, movements, from, to, previousFrom, previousTo }: SummarizeInput): SavingsMonthSummary {
  const active = accounts.filter((account) => account.isActive);
  const activeIds = new Set(active.map((account) => account.id));
  const own = movements.filter((movement) => activeIds.has(movement.accountId));

  const inRange = (movement: SavingsMovement, start: IsoDate, end: IsoDate) => movement.date >= start && movement.date <= end;
  const netOf = (list: SavingsMovement[]) => balanceOf(list);

  const month = own.filter((movement) => inRange(movement, from, to));
  const deposited = totalsOf(month).deposited;
  const withdrawn = month.filter((m) => m.kind === 'withdrawal' && !m.expenseId).reduce((sum, m) => sum + m.amount, 0);
  const spent = month.filter((m) => m.kind === 'withdrawal' && m.expenseId).reduce((sum, m) => sum + m.amount, 0);

  const upToEnd = own.filter((movement) => movement.date <= to);
  const total = Math.max(balanceOf(upToEnd), 0);
  const rows = active
    .map((account): SavingsMonthAccount => {
      const mine = upToEnd.filter((movement) => movement.accountId === account.id);
      const inMonth = month.filter((movement) => movement.accountId === account.id);
      const totals = totalsOf(inMonth);
      const balance = balanceOf(mine);
      return {
        id: account.id,
        name: account.name,
        icon: account.icon,
        color: account.color,
        balance,
        deposited: totals.deposited,
        withdrawn: totals.withdrawn,
        percent: percentOf(Math.max(balance, 0), total),
      };
    })
    .filter((row) => row.balance !== 0 || row.deposited > 0 || row.withdrawn > 0)
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

  return {
    hasAccounts: active.length > 0,
    deposited,
    withdrawn,
    spent,
    net: deposited - withdrawn - spent,
    previousNet: netOf(own.filter((movement) => inRange(movement, previousFrom, previousTo))),
    balance: balanceOf(upToEnd),
    accounts: rows,
    hasActivity: month.length > 0,
  };
}
