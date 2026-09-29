import { useState } from 'react';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { formatShortDate, formatTime } from '@/lib/dates';
import { formatCOP } from '@/lib/money';
import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { Amount } from '@/components/ui/Money';
import { ExpensePreviewCard } from './ExpensePreviewCard';
import { useLongPress } from '@/hooks/useLongPress';
import { haptics } from '@/lib/haptics';
import type { ExpenseWithRefs } from '@/types/models';

interface ExpenseRowProps {
  expense: ExpenseWithRefs;
  onSelect: (id: string) => void;
  /** Muestra la fecha (útil cuando la lista no está agrupada por día). */
  showDate?: boolean;
}

export function ExpenseRow({ expense, onSelect, showDate }: ExpenseRowProps) {
  const { hidden } = usePrivacy();
  const [previewing, setPreviewing] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => {
      setPreviewing(true);
      void haptics.tap();
    },
  });
  const meta = [
    `${expense.paymentMethodIcon} ${expense.paymentMethodName}`,
    expense.time ? formatTime(expense.time) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <button
        type="button"
        className="expense-row"
        onClick={() => onSelect(expense.id)}
        aria-label={`${expense.categoryName}${hidden ? '' : `, ${formatCOP(expense.amount)}`}${expense.paidAt === null ? ', por pagar' : ''}. Editar gasto`}
        {...longPress}
      >
        <EmojiTile emoji={expense.categoryIcon} color={expense.categoryColor} />
        <span className="expense-row__body">
          <span className="expense-row__title">{expense.categoryName}</span>
          {expense.note && <span className="expense-row__note">{expense.note}</span>}
          <span className="expense-row__meta">
            {meta}
            {expense.paidAt === null && <span className="payment-badge">Por pagar</span>}
          </span>
        </span>
        <span className="expense-row__side">
          <span className="expense-row__amount">
            <Amount value={expense.amount} />
          </span>
          {showDate && <span className="expense-row__date">{formatShortDate(expense.date)}</span>}
        </span>
      </button>
      {/* Fuera del <button>: un portal renderiza su contenido en otro punto del DOM, pero en React
          los clics dentro de él siguen "burbujeando" por el árbol de componentes. Si quedara dentro
          del botón, un clic en la X o en el fondo también dispararía el onClick de la fila (editar). */}
      {previewing && <ExpensePreviewCard expense={expense} onClose={() => setPreviewing(false)} />}
    </>
  );
}
