import { DEFAULT_PAYMENT_ICON, NAME_MAX_LENGTH, PAYMENT_TYPES } from '@/config/constants';
import { validateCycleRules, type CycleRules } from '@/lib/cycles';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { isEmoji, pluralize } from '@/lib/text';
import { paymentMethodRepository } from '@/repositories/paymentMethodRepository';
import type { PaymentMethod, PaymentMethodInput, PaymentMethodWithCount } from '@/types/models';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clean(input: PaymentMethodInput): PaymentMethodInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new ValidationError('Escribe un nombre para el método de pago.', 'name');
  if (name.length > NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre puede tener máximo ${NAME_MAX_LENGTH} caracteres.`, 'name');
  }
  if (!PAYMENT_TYPES.includes(input.type)) throw new ValidationError('Elige un tipo válido.', 'type');
  const icon = input.icon.trim();
  if (!icon || icon.length > 20 || !isEmoji(icon)) throw new ValidationError('Elige un emoji como icono.', 'icon');
  if (!HEX_COLOR.test(input.color)) throw new ValidationError('Elige un color válido.', 'color');

  const last4 = input.last4 ? input.last4.trim() : '';
  if (last4 && !/^\d{4}$/.test(last4)) {
    throw new ValidationError('Escribe solo los últimos 4 dígitos (o déjalo vacío).', 'last4');
  }
  // Por seguridad, solo las tarjetas admiten los últimos 4 dígitos.
  const isCard = input.type === 'debit_card' || input.type === 'credit_card';
  return { ...input, name, icon: input.icon.trim(), last4: isCard && last4 ? last4 : null };
}

async function assertUniqueName(name: string, selfId: string | null): Promise<void> {
  const found = await paymentMethodRepository.findByName(name);
  if (found && found.id !== selfId) {
    throw new ValidationError('Ya existe un método de pago con ese nombre.', 'name');
  }
}

export const paymentMethodService = {
  list(includeInactive = false): Promise<PaymentMethod[]> {
    return paymentMethodRepository.list(includeInactive);
  },

  listWithCounts(): Promise<PaymentMethodWithCount[]> {
    return paymentMethodRepository.listWithCounts();
  },

  async create(input: Partial<PaymentMethodInput> & { name: string }): Promise<PaymentMethod> {
    const data = clean({
      name: input.name,
      type: input.type ?? 'credit_card',
      icon: input.icon ?? DEFAULT_PAYMENT_ICON,
      color: input.color ?? '#3D8FD1',
      last4: input.last4 ?? null,
      isActive: input.isActive ?? true,
    });
    await assertUniqueName(data.name, null);
    const now = nowIso();
    const method: PaymentMethod = {
      id: newId(),
      ...data,
      sortOrder: await paymentMethodRepository.nextSortOrder(),
      creditLimit: null,
      cutoffDay: null,
      dueDay: null,
      cycle: null,
      savingsAccountId: null,
      createdAt: now,
      updatedAt: now,
    };
    await paymentMethodRepository.insert(method);
    notifyDataChanged();
    return method;
  },

  async update(id: string, input: PaymentMethodInput): Promise<PaymentMethod> {
    const existing = await paymentMethodRepository.getById(id);
    if (!existing) throw new ValidationError('Este método de pago ya no existe.');
    const data = clean(input);
    await assertUniqueName(data.name, id);
    // Los campos de crédito futuros (cupo, corte, pago) se conservan tal cual.
    const updated: PaymentMethod = { ...existing, ...data, updatedAt: nowIso() };
    await paymentMethodRepository.update(updated);
    notifyDataChanged();
    return updated;
  },

  /** Guarda (o quita, con null) las reglas de corte y pago de una tarjeta de crédito. */
  async setCycleRules(id: string, rules: CycleRules | null): Promise<PaymentMethod> {
    const existing = await paymentMethodRepository.getById(id);
    if (!existing) throw new ValidationError('Este método de pago ya no existe.');
    if (existing.type !== 'credit_card') throw new ValidationError('Las fechas de corte y pago son solo para tarjetas de crédito.');
    if (rules) {
      const problem = validateCycleRules(rules);
      if (problem) throw new ValidationError(problem, 'cycle');
    }
    const updated: PaymentMethod = { ...existing, cycle: rules, updatedAt: nowIso() };
    await paymentMethodRepository.update(updated);
    notifyDataChanged();
    return updated;
  },

  async remove(id: string): Promise<void> {
    const existing = await paymentMethodRepository.getById(id);
    if (!existing) return;
    const count = await paymentMethodRepository.countExpenses(id);
    if (count > 0) {
      throw new ValidationError(
        `«${existing.name}» tiene ${count} ${pluralize(count, 'gasto', 'gastos')} y no se puede eliminar. Puedes ocultarlo para que no aparezca al registrar gastos.`,
      );
    }
    await paymentMethodRepository.remove(id);
    notifyDataChanged();
  },
};
