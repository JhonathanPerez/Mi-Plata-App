import { CATEGORY_COLORS, DEFAULT_CATEGORY_ICON, NAME_MAX_LENGTH } from '@/config/constants';
import { notifyDataChanged } from '@/lib/dataBus';
import { ValidationError } from '@/lib/errors';
import { newId, nowIso } from '@/lib/ids';
import { isEmoji, pluralize } from '@/lib/text';
import { categoryRepository } from '@/repositories/categoryRepository';
import type { Category, CategoryInput, CategoryWithCount } from '@/types/models';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clean(input: CategoryInput): CategoryInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new ValidationError('Escribe un nombre para la categoría.', 'name');
  if (name.length > NAME_MAX_LENGTH) {
    throw new ValidationError(`El nombre puede tener máximo ${NAME_MAX_LENGTH} caracteres.`, 'name');
  }
  const icon = input.icon.trim();
  if (!icon || icon.length > 20 || !isEmoji(icon)) throw new ValidationError('Elige un emoji como icono.', 'icon');
  if (!HEX_COLOR.test(input.color)) throw new ValidationError('Elige un color válido.', 'color');
  return { ...input, name, icon: input.icon.trim() };
}

async function assertUniqueName(name: string, selfId: string | null): Promise<void> {
  const found = await categoryRepository.findByName(name);
  if (found && found.id !== selfId) {
    throw new ValidationError('Ya existe una categoría con ese nombre.', 'name');
  }
}

export const categoryService = {
  list(includeInactive = false): Promise<Category[]> {
    return categoryRepository.list(includeInactive);
  },

  listWithCounts(): Promise<CategoryWithCount[]> {
    return categoryRepository.listWithCounts();
  },

  async create(input: Partial<CategoryInput> & { name: string }): Promise<Category> {
    const data = clean({
      name: input.name,
      icon: input.icon ?? DEFAULT_CATEGORY_ICON,
      color: input.color ?? CATEGORY_COLORS[0],
      isActive: input.isActive ?? true,
    });
    await assertUniqueName(data.name, null);
    const now = nowIso();
    const category: Category = {
      id: newId(),
      ...data,
      sortOrder: await categoryRepository.nextSortOrder(),
      createdAt: now,
      updatedAt: now,
    };
    await categoryRepository.insert(category);
    notifyDataChanged();
    return category;
  },

  async update(id: string, input: CategoryInput): Promise<Category> {
    const existing = await categoryRepository.getById(id);
    if (!existing) throw new ValidationError('Esta categoría ya no existe.');
    const data = clean(input);
    await assertUniqueName(data.name, id);
    const updated: Category = { ...existing, ...data, updatedAt: nowIso() };
    await categoryRepository.update(updated);
    notifyDataChanged();
    return updated;
  },

  /** Solo se pueden eliminar categorías sin gastos asociados; si los tienen, se sugiere desactivarla. */
  async remove(id: string): Promise<void> {
    const existing = await categoryRepository.getById(id);
    if (!existing) return;
    const count = await categoryRepository.countExpenses(id);
    if (count > 0) {
      throw new ValidationError(
        `«${existing.name}» tiene ${count} ${pluralize(count, 'gasto', 'gastos')} y no se puede eliminar. Puedes ocultarla para que no aparezca al registrar gastos.`,
      );
    }
    await categoryRepository.remove(id);
    notifyDataChanged();
  },
};
