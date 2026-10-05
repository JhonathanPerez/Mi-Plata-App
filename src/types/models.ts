import type { CycleRules } from '@/lib/cycles';

export type Id = string;
/** Fecha calendario local en formato YYYY-MM-DD. */
export type IsoDate = string;
/** Mes calendario en formato YYYY-MM. */
export type YearMonth = string;

export type PaymentMethodType = 'cash' | 'debit_card' | 'credit_card' | 'other';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Category {
  id: Id;
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryWithCount extends Category {
  expenseCount: number;
}

export interface PaymentMethod {
  id: Id;
  name: string;
  type: PaymentMethodType;
  icon: string;
  color: string;
  /** Solo los últimos 4 dígitos (opcional). Nunca se guarda el número completo. */
  last4: string | null;
  isActive: boolean;
  sortOrder: number;
  // Campos reservados de una versión anterior (hoy las fechas del ciclo salen de `cycle`).
  creditLimit: number | null;
  cutoffDay: number | null;
  dueDay: number | null;
  /** Reglas de corte y pago de una tarjeta de crédito; null = sin configurar. */
  cycle: CycleRules | null;
  /**
   * Si no es null, este método es el «espejo» de una cuenta de ahorro: pagar con él descuenta de esa cuenta.
   * Lo administra el servicio de ahorros; no aparece en «Métodos de pago».
   */
  savingsAccountId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodWithCount extends PaymentMethod {
  expenseCount: number;
}

export interface Expense {
  id: Id;
  /** Pesos colombianos enteros (sin decimales). */
  amount: number;
  categoryId: Id;
  paymentMethodId: Id;
  date: IsoDate;
  /** HH:MM (24 h) o null. */
  time: string | null;
  note: string | null;
  /** Fecha en que se pagó al banco (tarjetas) o se saldó; null = por pagar. */
  paidAt: IsoDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseWithRefs extends Expense {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  paymentMethodName: string;
  paymentMethodIcon: string;
  paymentMethodColor: string;
  paymentMethodType: PaymentMethodType;
}

export interface Budget {
  id: Id;
  yearMonth: YearMonth;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  amount: number;
  categoryId: Id;
  paymentMethodId: Id;
  date: IsoDate;
  time: string | null;
  note: string | null;
  /** true = pagado, false = por pagar. Si se omite: por pagar con tarjeta de crédito, pagado en los demás casos. */
  paid?: boolean;
}

export interface CategoryInput {
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
}

export interface PaymentMethodInput {
  name: string;
  type: PaymentMethodType;
  icon: string;
  color: string;
  last4: string | null;
  isActive: boolean;
}

export interface ExpenseFilters {
  from?: IsoDate;
  to?: IsoDate;
  categoryIds?: Id[];
  paymentMethodIds?: Id[];
  minAmount?: number;
  maxAmount?: number;
  /** 'due' = solo los por pagar; 'paid' = solo los pagados. */
  status?: 'paid' | 'due';
  /** Texto libre: nota, categoría o método de pago (sin distinguir tildes). */
  search?: string;
  limit?: number;
}

export interface CategoryTotal {
  categoryId: Id;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
  percent: number;
}

export interface MethodTotal {
  paymentMethodId: Id;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
  percent: number;
}

export interface DailyTotal {
  date: IsoDate;
  total: number;
}

export type PendingCaptureStatus = 'pending' | 'accepted' | 'dismissed' | 'spam';

/**
 * Gasto detectado en una notificación o SMS que aún no tiene categoría.
 * Al resolverse (categorizado o descartado) se borra el texto original y solo queda la huella para no duplicar.
 */
export interface PendingCapture {
  id: Id;
  /** Paquete Android de la app que lo originó, o 'manual' si se pegó el texto a mano. */
  source: string;
  bank: string | null;
  /** Pesos colombianos enteros. */
  amount: number;
  merchant: string | null;
  last4: string | null;
  rawText: string;
  /** Momento de la notificación (milisegundos desde 1970). */
  occurredAt: number;
  fingerprint: string;
  status: PendingCaptureStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export type SavingsMovementKind = 'deposit' | 'withdrawal';

/** Cuenta de ahorro de un banco o billetera (Bancolombia, Nequi, Davivienda…). */
export interface SavingsAccount {
  id: Id;
  name: string;
  /** Solo los últimos 4 dígitos (opcional). Nunca se guarda el número completo. */
  last4: string | null;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Cuenta con su saldo (suma de ingresos menos retiros) y la cantidad de movimientos. */
export interface SavingsAccountWithBalance extends SavingsAccount {
  /** Pesos colombianos enteros. */
  balance: number;
  movementCount: number;
}

export interface SavingsMovement {
  id: Id;
  accountId: Id;
  kind: SavingsMovementKind;
  /** Pesos colombianos enteros, siempre positivos: el signo lo da `kind`. */
  amount: number;
  date: IsoDate;
  note: string | null;
  /** Gasto que se pagó con este retiro; null en los movimientos manuales. */
  expenseId: Id | null;
  createdAt: string;
}

export interface SavingsAccountInput {
  name: string;
  last4: string | null;
  icon: string;
  color: string;
  isActive: boolean;
}

export interface SavingsMovementInput {
  accountId: Id;
  kind: SavingsMovementKind;
  amount: number;
  date: IsoDate;
  note: string | null;
}
