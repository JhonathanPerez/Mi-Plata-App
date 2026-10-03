import { Skeleton } from '@/components/ui/Skeleton';

/** Esqueleto de la lista de gastos: un día con filas del mismo alto que las reales, para que no haya saltos al llegar los datos. */
export function ExpenseListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="expense-list" role="status" aria-label="Cargando gastos">
      <section className="expense-group">
        <header className="expense-group__head">
          <Skeleton height={14} width="96px" />
          <Skeleton height={14} width="72px" />
        </header>
        <div className="card card--flush">
          {Array.from({ length: rows }, (_, n) => (
            <div key={n} className="skeleton-row skeleton-row--expense">
              <Skeleton height={40} width="40px" />
              <div className="skeleton-row__body">
                <Skeleton height={16} width="55%" />
                <Skeleton height={13} width="75%" />
              </div>
              <Skeleton height={18} width="72px" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
