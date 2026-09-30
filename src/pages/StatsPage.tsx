import { useState } from 'react';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { DailyBars } from '@/components/charts/DailyBars';
import { DonutChart } from '@/components/charts/DonutChart';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { addMonths, currentYearMonth, formatMonthTitle } from '@/lib/dates';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { statsService, type MonthlySummary } from '@/services/statsService';

function ComparisonLine({ summary }: { summary: MonthlySummary }) {
  const { cop } = useAmountFormat();
  const previousLabel = formatMonthTitle(addMonths(summary.yearMonth, -1)).toLowerCase();
  if (summary.previousTotal === 0) {
    return <p className="compare">Sin gastos en {previousLabel} para comparar.</p>;
  }
  const more = summary.changeAmount > 0;
  const same = summary.changeAmount === 0;
  const percent = Math.abs(Math.round(summary.changePercent ?? 0));
  return (
    <p className="compare">
      {!same && <Icon name={more ? 'arrowUp' : 'arrowDown'} size={18} />}
      <span>
        {same
          ? `Igual que en ${previousLabel}.`
          : `Gastaste ${cop(Math.abs(summary.changeAmount))} ${more ? 'más' : 'menos'} que en ${previousLabel} (${percent}%).`}
      </span>
    </p>
  );
}

export function StatsPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const { data, loading } = useQuery(() => statsService.getMonthlySummary(yearMonth), [yearMonth]);

  return (
    <div className="page">
      <PageHeader title="Estadísticas" actions={<PrivacyToggle />} />
      <MonthNavigator value={yearMonth} onChange={setYearMonth} />

      {!data ? (
        <p className="muted">{loading ? 'Cargando…' : 'No se pudieron cargar las estadísticas.'}</p>
      ) : data.transactions === 0 ? (
        <div className="card">
          <EmptyState
            icon="chart"
            title="Sin gastos en este mes"
            description={`No hay movimientos en ${formatMonthTitle(yearMonth)}. Usa las flechas para ver otros meses.`}
          />
        </div>
      ) : (
        <>
          <Stat as="section" aria-label="Total del mes" label="Total gastado" value={<Amount value={data.total} />}>
            <ComparisonLine summary={data} />
          </Stat>

          <div className="tiles tiles--2x2">
            <Stat size="sm" label="Promedio diario" value={<Amount value={Math.round(data.dailyAverage)} />} />
            <Stat size="sm" label="Transacciones" value={data.transactions} />
            <Stat
              size="sm"
              label="Más gasto en"
              leading={data.topCategory && <EmojiTile emoji={data.topCategory.icon} color={data.topCategory.color} size="sm" />}
              value={data.topCategory?.name}
            />
            <Stat
              size="sm"
              label="Método más usado"
              leading={data.topMethod && <EmojiTile emoji={data.topMethod.icon} color={data.topMethod.color} size="sm" />}
              value={data.topMethod?.name}
            />
          </div>

          <section className="section">
            <h2 className="section__title">Gasto por día</h2>
            <div className="card">
              <DailyBars days={data.daily} />
            </div>
          </section>

          <section className="section">
            <h2 className="section__title">Por categoría</h2>
            <div className="card">
              <CategoryBars items={data.byCategory} />
            </div>
          </section>

          <section className="section">
            <h2 className="section__title">Por método de pago</h2>
            <div className="card">
              <DonutChart items={data.byMethod} total={data.total} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
