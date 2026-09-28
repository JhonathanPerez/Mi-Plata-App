import { formatDayHeading } from '@/lib/dates';
import { Amount } from '@/components/ui/Money';
import type { ExpenseWithRefs } from '@/types/models';
import { ExpenseRow } from './ExpenseRow';
import { SwipeToPayRow } from './SwipeToPayRow';

interface ExpenseListProps {
  expenses: ExpenseWithRefs[];
  onSelect: (id: string) => void;
  /** Si se pasa, cada fila se puede deslizar a la derecha para marcarla como pagada (o por pagar). */
  onTogglePaid?: (expense: ExpenseWithRefs) => void;
  /** Si se pasa (junto con onTogglePaid), deslizar a la izquierda pide eliminar el gasto. */
  onDelete?: (expense: ExpenseWithRefs) => void;
}

/** Lista agrupada por día, con el total de cada día. */
export function ExpenseList({ expenses, onSelect, onTogglePaid, onDelete }: ExpenseListProps) {
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
                <SwipeToPayRow
                  key={expense.id}
                  expense={expense}
                  onSelect={onSelect}
                  onTogglePaid={onTogglePaid}
                  onDelete={onDelete}
                />
              ) : (
                <ExpenseRow key={expense.id} expense={expense} onSelect={onSelect} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
