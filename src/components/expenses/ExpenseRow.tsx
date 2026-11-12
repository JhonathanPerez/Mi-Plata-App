import { Fragment, type ReactNode } from 'react';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Row } from '@/components/ui/Row';
import { formatShortDate, formatTime } from '@/lib/dates';
import { formatCOP } from '@/lib/money';
import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { Amount } from '@/components/ui/Money';
import type { ExpenseWithRefs } from '@/types/models';

interface ExpenseRowProps {
  expense: ExpenseWithRefs;
  onSelect: (id: string) => void;
  /** Muestra la fecha (útil cuando la lista no está agrupada por día). */
  showDate?: boolean;
  /**
   * Descripción como título y «categoría · método» como meta. Es opt-in (Inicio y Gastos).
   * Sin descripción, la categoría pasa a ser el título.
   */
  compact?: boolean;
  /**
   * Solo con `compact`: descripción, categoría y método cada uno en su renglón, sin saltar de línea (si no caben, se recortan
   * con «…»), para que todas las filas de una lista midan lo mismo. Lo usa Gastos; Inicio deja que la meta se parta.
   */
  stacked?: boolean;
  /** Solo con `compact`: incluye el método de pago en la meta. Inicio lo oculta cuando todas las filas visibles lo comparten. */
  showMethod?: boolean;
}

export function ExpenseRow({ expense, onSelect, showDate, compact = false, stacked = false, showMethod = true }: ExpenseRowProps) {
  const { hidden } = usePrivacy();
  const time = expense.time ? formatTime(expense.time) : null;
  // El método (ícono + nombre) va en un bloque que no se parte: si la meta no cabe en un renglón,
  // salta entero al siguiente en vez de dejar el ícono solo al final del primero.
  const unbreakable = (text: string): ReactNode => <span className="row__nowrap">{text}</span>;
  const method = unbreakable(`${expense.paymentMethodIcon} ${expense.paymentMethodName}`);
  const parts: ReactNode[] = (compact ? [expense.note ? expense.categoryName : null, showMethod ? method : null, time] : [method, time]).filter(Boolean);
  // Gastos: categoría y método cada uno en su renglón, sin saltar de línea (si no caben, se recortan con «…»).
  const stackedMethod = showMethod ? [`${expense.paymentMethodIcon} ${expense.paymentMethodName}`, time].filter(Boolean).join(' · ') : null;
  const joined = (items: ReactNode[]) =>
    items.map((part, index) => (
      <Fragment key={index}>
        {index > 0 && '\u00A0· '}
        {part}
      </Fragment>
    ));

  return (
    <Row
      onClick={() => onSelect(expense.id)}
      aria-label={`${expense.categoryName}${hidden ? '' : `, ${formatCOP(expense.amount)}`}${expense.paidAt === null ? ', por pagar' : ''}. Ver detalle del gasto`}
      leading={<EmojiTile emoji={expense.categoryIcon} color={expense.categoryColor} />}
      className={compact ? (stacked ? 'row--compact row--stacked' : 'row--compact') : undefined}
      title={compact ? (expense.note || expense.categoryName) : expense.categoryName}
      amount={<Amount value={expense.amount} />}
      aside={showDate ? formatShortDate(expense.date) : undefined}
    >
      {!compact && expense.note && <span className="row__note">{expense.note}</span>}
      {compact && stacked ? (
        <>
          {expense.note && <span className="row__detail row__detail--truncate">{expense.categoryName}</span>}
          {stackedMethod && <span className="row__detail row__detail--truncate">{stackedMethod}</span>}
        </>
      ) : (
        parts.length > 0 && <span className="row__detail">{joined(parts)}</span>
      )}
    </Row>
  );
}
