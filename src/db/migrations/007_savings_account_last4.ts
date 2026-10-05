import type { Migration } from './types';

/**
 * Los últimos 4 dígitos de una cuenta de ahorro de un banco (opcionales; nunca se guarda el número completo).
 * Sirven para reconocer la cuenta en la lista y para que una compra detectada en una notificación del banco
 * («terminada en 1234») se sugiera con la cuenta correcta.
 */
export const migration007: Migration = {
  version: 7,
  name: 'savings_account_last4',
  statements: ['ALTER TABLE savings_accounts ADD COLUMN last4 TEXT'],
};
