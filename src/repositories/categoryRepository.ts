import { getDb } from '@/db/connection';
import { toCategory } from '@/db/mappers';
import type { Category, CategoryWithCount } from '@/types/models';

const COLUMNS = 'id, name, icon, color, is_active, sort_order, created_at, updated_at';

export const categoryRepository = {
  async list(includeInactive = false): Promise<Category[]> {
    const db = await getDb();
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    const rows = await db.query(`SELECT ${COLUMNS} FROM categories ${where} ORDER BY sort_order, name`);
    return rows.map(toCategory);
  },

  async listWithCounts(): Promise<CategoryWithCount[]> {
    const db = await getDb();
    const rows = await db.query(
      `SELECT c.id, c.name, c.icon, c.color, c.is_active, c.sort_order, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id) AS expense_count
       FROM categories c
       ORDER BY c.sort_order, c.name`,
    );
    return rows.map((row) => ({ ...toCategory(row), expenseCount: Number(row.expense_count) }));
  },

  async getById(id: string): Promise<Category | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${COLUMNS} FROM categories WHERE id = ?`, [id]);
    return rows.length ? toCategory(rows[0]) : null;
  },

  async findByName(name: string): Promise<Category | null> {
    const db = await getDb();
    const rows = await db.query(`SELECT ${COLUMNS} FROM categories WHERE name = ? COLLATE NOCASE`, [name]);
    return rows.length ? toCategory(rows[0]) : null;
  },

  async nextSortOrder(): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories');
    return Number(rows[0].next);
  },

  async insert(category: Category): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO categories (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.name,
        category.icon,
        category.color,
        category.isActive ? 1 : 0,
        category.sortOrder,
        category.createdAt,
        category.updatedAt,
      ],
    );
  },

  async update(category: Category): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE categories SET name = ?, icon = ?, color = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      [
        category.name,
        category.icon,
        category.color,
        category.isActive ? 1 : 0,
        category.sortOrder,
        category.updatedAt,
        category.id,
      ],
    );
  },

  async countExpenses(id: string): Promise<number> {
    const db = await getDb();
    const rows = await db.query('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?', [id]);
    return Number(rows[0].n);
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM categories WHERE id = ?', [id]);
  },
};
