import { Skeleton } from '@/components/ui/Skeleton';

/** Alturas aproximadas de cada bloque real de Estadísticas, para que no haya saltos al llegar los datos. */
const SECTION_HEIGHTS = [208, 340, 240];

/** Esqueleto de Estadísticas: total, cuatro tiles y tres gráficas con las proporciones de la pantalla real. */
export function StatsSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="Cargando estadísticas">
      <Skeleton height={138} radius="l" />
      <div className="tiles">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} height={80} radius="l" />
        ))}
      </div>
      {SECTION_HEIGHTS.map((height) => (
        <div key={height} className="section">
          <Skeleton height={22} width="44%" />
          <Skeleton height={height} radius="l" />
        </div>
      ))}
    </div>
  );
}
