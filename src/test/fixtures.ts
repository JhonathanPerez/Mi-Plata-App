import type { PaymentMethodSeed } from '@/config/seeds';
import { serializeCycleRules, type CycleRules } from '@/lib/cycles';
import { nowIso } from '@/lib/ids';
import { getDb } from '@/db/connection';

/** Nubank: corte el último día de cada mes; pago el día 20 del mes siguiente. */
export const NUBANK_CYCLE: CycleRules = { cut: { kind: 'last' }, due: { kind: 'day', day: 20 }, dueNextMonth: true, weekend: 'keep' };
/** Davibank: corte el segundo viernes de cada mes; pago máximo el segundo martes del mes siguiente. */
export const DAVIBANK_CYCLE: CycleRules = {
  cut: { kind: 'nth', nth: 2, weekday: 5 },
  due: { kind: 'nth', nth: 2, weekday: 2 },
  dueNextMonth: true,
  weekend: 'keep',
};

type CardFixture = PaymentMethodSeed & { cycle?: CycleRules };

/** Tarjetas de ejemplo para las pruebas. La app ya no las trae de fábrica: el usuario las crea. */
export const TEST_CARDS: CardFixture[] = [
  { id: 'pm_davibank', name: 'Davibank', type: 'credit_card', icon: '💳', color: '#E4572E', cycle: DAVIBANK_CYCLE },
  { id: 'pm_nubank', name: 'Nubank', type: 'credit_card', icon: '💳', color: '#9B5DE5', cycle: NUBANK_CYCLE },
  { id: 'pm_rappicard', name: 'RappiCard', type: 'credit_card', icon: '💳', color: '#F29E4C' },
];

/**
 * Métodos de pago que traían las instalaciones anteriores (antes de que solo vinieran Efectivo y Transferencia).
 * Sirve para probar que esas instalaciones conservan sus datos.
 */
export const LEGACY_PAYMENT_METHODS: CardFixture[] = [
  { id: 'pm_efectivo', name: 'Efectivo', type: 'cash', icon: '💵', color: '#2A9D8F' },
  ...TEST_CARDS,
  { id: 'pm_transferencia', name: 'Transferencia', type: 'other', icon: '🏦', color: '#3D8FD1' },
];

/** Crea las tarjetas de ejemplo después de los métodos de fábrica (Efectivo y Transferencia). */
export async function seedTestCards(): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const rows = await db.query<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM payment_methods');
  const first = Number(rows[0].next);
  await db.runMany(
    `INSERT OR IGNORE INTO payment_methods
       (id, name, type, icon, color, last4, is_active, sort_order, credit_limit, cutoff_day, due_day, cycle_rules, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 1, ?, NULL, NULL, NULL, ?, ?, ?)`,
    TEST_CARDS.map((m, index) => [m.id, m.name, m.type, m.icon, m.color, first + index, m.cycle ? serializeCycleRules(m.cycle) : null, now, now]),
  );
}
