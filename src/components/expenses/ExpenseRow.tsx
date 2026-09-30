import { useState } from 'react';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Row } from '@/components/ui/Row';
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
      <Row
        holdable
        onClick={() => onSelect(expense.id)}
        aria-label={`${expense.categoryName}${hidden ? '' : `, ${formatCOP(expense.amount)}`}${expense.paidAt === null ? ', por pagar' : ''}. Editar gasto`}
        {...longPress}
        leading={<EmojiTile emoji={expense.categoryIcon} color={expense.categoryColor} />}
        title={expense.categoryName}
        amount={<Amount value={expense.amount} />}
        aside={showDate ? formatShortDate(expense.date) : undefined}
      >
        {expense.note && <span className="row__note">{expense.note}</span>}
        <span className="row__detail">
          {meta}
          {expense.paidAt === null && <span className="payment-badge">Por pagar</span>}
        </span>
      </Row>
      {/* Fuera del <button>: un portal renderiza su contenido en otro punto del DOM, pero en React
          los clics dentro de él siguen "burbujeando" por el árbol de componentes. Si quedara dentro
          del botón, un clic en la X o en el fondo también dispararía el onClick de la fila (editar). */}
      {previewing && <ExpensePreviewCard expense={expense} onClose={() => setPreviewing(false)} />}
    </>
  );
}
