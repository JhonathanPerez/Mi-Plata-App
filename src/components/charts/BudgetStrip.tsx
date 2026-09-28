import type { CategoryTotal } from '@/types/models';
import { formatPercent } from '@/lib/money';

interface BudgetStripProps {
  segments: CategoryTotal[];
  budget: number;
  spent: number;
}

/**
 * La "regla" del mes: cada tramo de color es una categoría y el largo total es el presupuesto.
 * Si se excede, la escala pasa a ser el gasto y una marca vertical señala dónde estaba el presupuesto.
 */
export function BudgetStrip({ segments, budget, spent }: BudgetStripProps) {
  const hasBudget = budget > 0;
  const scale = Math.max(hasBudget ? budget : spent, spent, 1);
  const budgetMark = hasBudget && spent > budget ? (budget / scale) * 100 : null;
  const percent = hasBudget ? (spent / budget) * 100 : 0;
  const description = hasBudget
    ? `Has usado ${formatPercent(percent)} de tu presupuesto mensual.`
    : 'Distribución de tus gastos del mes por categoría.';

  return (
    <div className="strip" role="img" aria-label={description}>
      <div className="strip__track">
        {segments.map((segment) => (
          <span
            key={segment.categoryId}
            className="strip__segment"
            style={{ width: `${(segment.total / scale) * 100}%`, background: segment.color }}
          />
        ))}
        <span className="strip__tick" style={{ left: '25%' }} />
        <span className="strip__tick" style={{ left: '50%' }} />
        <span className="strip__tick" style={{ left: '75%' }} />
        {budgetMark !== null && <span className="strip__limit" style={{ left: `${budgetMark}%` }} />}
      </div>
    </div>
  );
}
