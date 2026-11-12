import type { Migration } from './types';

/**
 * Observaciones de un gasto: texto libre y opcional (con quién fue, para qué fue, un detalle de la compra…),
 * distinto de la descripción, que es corta y obligatoria en el formulario. Los gastos que ya existían quedan sin observaciones.
 */
export const migration008: Migration = {
  version: 8,
  name: 'expense_observations',
  statements: ['ALTER TABLE expenses ADD COLUMN observations TEXT'],
};
