import { IconButton } from '@/components/ui/Button';
import { formatDayHeading } from '@/lib/dates';
import { Amount } from '@/components/ui/Money';
import { SwipeRow } from '@/components/ui/SwipeRow';
import type { ExpenseWithRefs } from '@/types/models';
import { ExpenseRow } from './ExpenseRow';

interface ExpenseListProps {
  expenses: ExpenseWithRefs[];
  onSelect: (id: string) => void;
  /** Si se pasa, cada fila se puede deslizar a la derecha para marcarla como pagada (o por pagar). */
  onTogglePaid?: (expense: ExpenseWithRefs) => void;
  /** Si se pasa (junto con onTogglePaid), deslizar a la izquierda pide eliminar el gasto. */
  onDelete?: (expense: ExpenseWithRefs) => void;
  /** Si se pasa (junto con onTogglePaid), cada fila muestra un botón ⋮ con las mismas acciones que los gestos, para quien no los conoce. */
  onMore?: (expense: ExpenseWithRefs) => void;
}

interface PayableRowProps {
  expense: ExpenseWithRefs;
  onSelect: (id: string) => void;
  onTogglePaid: (expense: ExpenseWithRefs) => void;
  onDelete?: (expense: ExpenseWithRefs) => void;
  onMore?: (expense: ExpenseWithRefs) => void;
}

/**
 * Una fila del historial que se desliza a la derecha para marcarla como pagada (si estaba por pagar) o de nuevo
 * como por pagar, y a la izquierda para eliminarla (si hay `onDelete`; la confirmación queda a cargo de quien lo reciba).
 */
function PayableExpenseRow({ expense, onSelect, onTogglePaid, onDelete, onMore }: PayableRowProps) {
  const isDue = expense.paidAt === null;
  const subject = `${expense.categoryName} ${expense.note ?? ''}`;
  return (
    <SwipeRow
      swipeRight={{
        label: isDue ? 'Pagado' : 'Por pagar',
        icon: isDue ? 'check' : 'refresh',
        tone: isDue ? 'primary' : 'neutral',
        srLabel: `${isDue ? 'Marcar como pagado' : 'Marcar como por pagar'}: ${subject}`,
        onCommit: () => onTogglePaid(expense),
      }}
      swipeLeft={
        onDelete && {
          label: 'Eliminar',
          icon: 'trash',
          tone: 'danger',
          srLabel: `Eliminar gasto: ${subject}`,
          onCommit: () => onDelete(expense),
        }
      }
    >
      <div className="expense-item">
        <ExpenseRow expense={expense} onSelect={onSelect} compact stacked />
        {onMore && (
          <IconButton className="expense-item__more" icon="more" label={`Opciones del gasto: ${subject}`} onClick={() => onMore(expense)} />
        )}
      </div>
    </SwipeRow>
  );
}

/** Lista agrupada por día, con el total de cada día. Cada fila usa dos líneas: la descripción como título y «categoría · método» debajo. */
export function ExpenseList({ expenses, onSelect, onTogglePaid, onDelete, onMore }: ExpenseListProps) {
  const groups: Array<{ date: string; items: ExpenseWithRefs[]; total: number }> = [];
  for (const expense of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.date === expense.date) {
      last.items.push(expense);
      last.total += expense.amount;
    } else {
      groups.push({ date: expense.date, items: [expense], total: expense.amount });
    }
  }

  return (
    <div className="expense-list">
      {groups.map((group) => (
        <section key={group.date} className="expense-group" aria-label={formatDayHeading(group.date)}>
          <header className="expense-group__head">
            <h3>{formatDayHeading(group.date)}</h3>
            <span>
              <Amount value={group.total} />
            </span>
          </header>
          <div className="card card--flush">
            {group.items.map((expense) =>
              onTogglePaid ? (
                <PayableExpenseRow
                  key={expense.id}
                  expense={expense}
                  onSelect={onSelect}
                  onTogglePaid={onTogglePaid}
                  onDelete={onDelete}
                  onMore={onMore}
                />
              ) : (
                <ExpenseRow key={expense.id} expense={expense} onSelect={onSelect} compact stacked />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
