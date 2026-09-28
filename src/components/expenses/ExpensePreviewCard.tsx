import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { IconButton } from '@/components/ui/Button';
import { Amount } from '@/components/ui/Money';
import { formatLongDate, formatTime } from '@/lib/dates';
import { pushBackHandler } from '@/lib/backStack';
import type { ExpenseWithRefs } from '@/types/models';

interface ExpensePreviewCardProps {
  expense: ExpenseWithRefs;
  onClose: () => void;
}

/**
 * Vista previa rápida de un gasto: se abre al mantener presionada su fila y queda abierta hasta
 * que se toque afuera, se pulse la X o (en Android) se use el botón Atrás. Es de solo lectura
 * (para editar, un toque normal en la fila abre la pantalla del gasto).
 */
export function ExpensePreviewCard({ expense, onClose }: ExpensePreviewCardProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => pushBackHandler(() => closeRef.current()), []);

  return createPortal(
    <div className="preview-root">
      <div className="preview-backdrop" onClick={onClose} />
      <div className="preview-card" role="dialog" aria-modal="true" aria-label={`Vista previa del gasto: ${expense.categoryName}`}>
        <IconButton icon="close" label="Cerrar" className="preview-card__close" onClick={onClose} />
        <div className="preview-card__head">
          <EmojiTile emoji={expense.categoryIcon} color={expense.categoryColor} />
          <span className="preview-card__amount">
            <Amount value={expense.amount} />
          </span>
        </div>
        <dl className="preview-card__list">
          <div className="preview-card__row">
            <dt>Descripción</dt>
            <dd>{expense.note?.trim() || 'Sin descripción'}</dd>
          </div>
          <div className="preview-card__row">
            <dt>Fecha</dt>
            <dd>
              {formatLongDate(expense.date)}
              {expense.time ? ` · ${formatTime(expense.time)}` : ''}
            </dd>
          </div>
          <div className="preview-card__row">
            <dt>Valor</dt>
            <dd>
              <Amount value={expense.amount} />
            </dd>
          </div>
          <div className="preview-card__row">
            <dt>Categoría</dt>
            <dd>
              {expense.categoryIcon} {expense.categoryName}
            </dd>
          </div>
          <div className="preview-card__row">
            <dt>Método de pago</dt>
            <dd>
              {expense.paymentMethodIcon} {expense.paymentMethodName}
            </dd>
          </div>
        </dl>
      </div>
    </div>,
    document.body,
  );
}
