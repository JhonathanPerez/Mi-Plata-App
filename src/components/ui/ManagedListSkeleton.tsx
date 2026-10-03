import { Skeleton } from './Skeleton';

/** Esqueleto de «Categorías» y «Métodos de pago»: filas del mismo alto que las reales, para que no haya saltos al llegar los datos. */
export function ManagedListSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className="card card--flush" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, n) => (
        <div key={n} className="skeleton-row skeleton-row--expense">
          <Skeleton height={40} width="40px" />
          <div className="skeleton-row__body">
            <Skeleton height={16} width="45%" />
            <Skeleton height={13} width="65%" />
          </div>
          <Skeleton height={20} width="20px" radius="xs" />
        </div>
      ))}
    </div>
  );
}
