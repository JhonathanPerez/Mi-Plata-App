import { Fragment, useState, type ReactNode } from 'react';
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
  /**
   * Dos líneas: la descripción como título y «categoría · método» como meta. Es opt-in (Inicio y Gastos).
   * Sin descripción, la categoría pasa a ser el título.
   */
  compact?: boolean;
  /**
   * Solo con `compact`: cada dato en su propio renglón (descripción, categoría y método), para que todas las filas
   * de una lista tengan la misma forma sin importar cuánto mida el monto. Lo usa Gastos; Inicio mantiene la meta en una línea.
   */
  stacked?: boolean;
  /** Solo con `compact`: incluye el método de pago en la meta. Inicio lo oculta cuando todas las filas visibles lo comparten. */
  showMethod?: boolean;
}

export function ExpenseRow({ expense, onSelect, showDate, compact = false, stacked = false, showMethod = true }: ExpenseRowProps) {
  const { hidden } = usePrivacy();
  const [previewing, setPreviewing] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => {
      setPreviewing(true);
      void haptics.tap();
    },
  });
  const time = expense.time ? formatTime(expense.time) : null;
  // El método (ícono + nombre) va en un bloque que no se parte: si la meta no cabe en un renglón,
  // salta entero al siguiente en vez de dejar el ícono solo al final del primero.
  const unbreakable = (text: string): ReactNode => <span className="row__nowrap">{text}</span>;
  const method = unbreakable(`${expense.paymentMethodIcon} ${expense.paymentMethodName}`);
  const parts: ReactNode[] = (compact ? [expense.note ? expense.categoryName : null, showMethod ? method : null, time] : [method, time]).filter(Boolean);
  const joined = (items: ReactNode[]) =>
    items.map((part, index) => (
      <Fragment key={index}>
        {index > 0 && '\u00A0· '}
        {part}
      </Fragment>
    ));

  return (
    <>
      <Row
        holdable
        onClick={() => onSelect(expense.id)}
        aria-label={`${expense.categoryName}${hidden ? '' : `, ${formatCOP(expense.amount)}`}${expense.paidAt === null ? ', por pagar' : ''}. Editar gasto`}
        {...longPress}
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
            {showMethod && <span className="row__detail row__detail--truncate">{joined([method, time].filter(Boolean))}</span>}
          </>
        ) : (
          parts.length > 0 && <span className="row__detail">{joined(parts)}</span>
        )}
      </Row>
      {/* Fuera del <button>: un portal renderiza su contenido en otro punto del DOM, pero en React
          los clics dentro de él siguen "burbujeando" por el árbol de componentes. Si quedara dentro
          del botón, un clic en la X o en el fondo también dispararía el onClick de la fila (editar). */}
      {previewing && <ExpensePreviewCard expense={expense} onClose={() => setPreviewing(false)} />}
    </>
  );
}
