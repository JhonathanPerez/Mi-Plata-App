import type {
  Budget,
  Category,
  Expense,
  ExpenseWithRefs,
  PaymentMethod,
  PaymentMethodType,
  PendingCapture,
  PendingCaptureStatus,
  SavingsAccount,
  SavingsMovement,
  SavingsMovementKind,
} from '@/types/models';
import { parseCycleRules } from '@/lib/cycles';
import type { Row } from './types';

const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export function toCategory(row: Row): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: String(row.icon),
    color: String(row.color),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toPaymentMethod(row: Row): PaymentMethod {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as PaymentMethodType,
    icon: String(row.icon),
    color: String(row.color),
    last4: row.last4 === null || row.last4 === undefined ? null : String(row.last4),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
    creditLimit: toNullableNumber(row.credit_limit),
    cutoffDay: toNullableNumber(row.cutoff_day),
    dueDay: toNullableNumber(row.due_day),
    cycle: parseCycleRules(row.cycle_rules === null || row.cycle_rules === undefined ? null : String(row.cycle_rules)),
    savingsAccountId:
      row.savings_account_id === null || row.savings_account_id === undefined ? null : String(row.savings_account_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toExpense(row: Row): Expense {
  return {
    id: String(row.id),
    amount: Number(row.amount),
    categoryId: String(row.category_id),
    paymentMethodId: String(row.payment_method_id),
    date: String(row.expense_date),
    time: row.expense_time === null || row.expense_time === undefined ? null : String(row.expense_time),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    paidAt: row.paid_at === null || row.paid_at === undefined ? null : String(row.paid_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toExpenseWithRefs(row: Row): ExpenseWithRefs {
  return {
    ...toExpense(row),
    categoryName: String(row.category_name),
    categoryIcon: String(row.category_icon),
    categoryColor: String(row.category_color),
    paymentMethodName: String(row.pm_name),
    paymentMethodIcon: String(row.pm_icon),
    paymentMethodColor: String(row.pm_color),
    paymentMethodType: String(row.pm_type) as PaymentMethodType,
  };
}

export function toBudget(row: Row): Budget {
  return {
    id: String(row.id),
    yearMonth: String(row.year_month),
    amount: Number(row.amount),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toPendingCapture(row: Row): PendingCapture {
  const nullableText = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
  return {
    id: String(row.id),
    source: String(row.source),
    bank: nullableText(row.bank),
    amount: Number(row.amount),
    merchant: nullableText(row.merchant),
    last4: nullableText(row.last4),
    rawText: String(row.raw_text ?? ''),
    occurredAt: Number(row.occurred_at),
    fingerprint: String(row.fingerprint),
    status: String(row.status) as PendingCaptureStatus,
    createdAt: String(row.created_at),
    resolvedAt: nullableText(row.resolved_at),
  };
}

export function toSavingsAccount(row: Row): SavingsAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    last4: row.last4 === null || row.last4 === undefined ? null : String(row.last4),
    icon: String(row.icon),
    color: String(row.color),
    isActive: Number(row.is_active) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toSavingsMovement(row: Row): SavingsMovement {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    kind: String(row.kind) as SavingsMovementKind,
    amount: Number(row.amount),
    date: String(row.movement_date),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    expenseId: row.expense_id === null || row.expense_id === undefined ? null : String(row.expense_id),
    createdAt: String(row.created_at),
  };
}
