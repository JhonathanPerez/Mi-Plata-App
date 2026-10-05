import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { DailyBars } from '@/components/charts/DailyBars';
import { DonutChart } from '@/components/charts/DonutChart';
import { MethodSingle } from '@/components/charts/MethodSingle';
import { SavingsBars } from '@/components/charts/SavingsBars';
import { StatsSkeleton } from '@/components/charts/StatsSkeleton';
import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { describeComparison } from '@/lib/comparison';
import { currentYearMonth, elapsedDaysInMonth, formatMonthTitle, todayIso } from '@/lib/dates';
import { categoryHistoryPath } from '@/lib/historyLink';
import { readStatsMonth, statsReturnTarget } from '@/lib/navigationState';
import { pluralize } from '@/lib/text';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import type { SavingsMonthSummary } from '@/lib/savings';
import { statsService, type MonthlySummary } from '@/services/statsService';

/** En los tiles de dos columnas una cifra de siete dígitos o más no cabe (menos aún con la letra grande): se abrevia ($18,7 M). */
const TILE_COMPACT_FROM = 1_000_000;

function ComparisonLine({ summary }: { summary: MonthlySummary }) {
  const { cop } = useAmountFormat();
  const { direction, text } = describeComparison(summary, cop);
  return (
    <p className="compare">
      {(direction === 'more' || direction === 'less') && <Icon name={direction === 'more' ? 'arrowUp' : 'arrowDown'} size={18} />}
      <span>{text}</span>
    </p>
  );
}

/** Cifra con su signo: «+» si el ahorro creció, «−» si bajó. El signo va escrito, no solo en el color. */
function SignedAmount({ value, compact }: { value: number; compact?: boolean }) {
  return (
    <>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      <Amount value={Math.abs(value)} compact={compact} />
    </>
  );
}

/**
 * Ahorros del mes: cuánto creció el ahorro, de dónde sale esa cifra (lo que se metió, lo que se sacó y lo que pagó gastos,
 * que ya cuenta en «Total gastado») y cuánto tiene cada cuenta. Sigue al mes elegido arriba.
 */
function SavingsSection({ summary, isCurrentMonth }: { summary: SavingsMonthSummary; isCurrentMonth: boolean }) {
  const tile = (value: number) => <Amount value={value} compact={Math.abs(value) >= TILE_COMPACT_FROM} />;
  return (
    <section className="section section--anchor" id="ahorros">
      <div className="section__head">
        <div className="section__heading">
          <h2 className="section__title">Ahorros</h2>
          <p className="section__hint">Lo que metiste y sacaste de tus cuentas en el mes</p>
        </div>
        <Link className="link" to="/ahorros">
          Ver cuentas
        </Link>
      </div>

      <Stat as="section" aria-label="Ahorro neto del mes" label="Ahorro neto del mes" value={<SignedAmount value={summary.net} />}>
        <p className="compare">
          <span>
            {summary.hasActivity ? (
              summary.previousNet !== 0 ? (
                <>
                  Mes anterior: <SignedAmount value={summary.previousNet} />
                </>
              ) : (
                'Sin ahorro el mes anterior'
              )
            ) : (
              'Sin movimientos de ahorro este mes'
            )}
          </span>
        </p>
      </Stat>

      <div className="tiles tiles--2x2">
        <Stat size="sm" label="Metiste" value={tile(summary.deposited)} />
        <Stat size="sm" label="Sacaste" value={tile(summary.withdrawn)} />
        <Stat size="sm" label="Pagado con ahorro" value={tile(summary.spent)} foot="ya está en tus gastos" />
        <Stat size="sm" label="Total en cuentas" value={tile(summary.balance)} foot={isCurrentMonth ? 'hoy' : 'al cerrar el mes'} />
      </div>

      {summary.accounts.length > 0 && (
        <div className="card">
          <SavingsBars items={summary.accounts} />
        </div>
      )}
    </section>
  );
}

export function StatsPage() {
  const navigate = useNavigate();
  // Estado de la ubicación: `scrollTo` lo manda Inicio; `yearMonth` lo deja el botón Atrás al volver desde Gastos (se abre en el mes que se veía).
  const location = useLocation();
  const [yearMonth, setYearMonth] = useState(() => readStatsMonth(location.state) ?? currentYearMonth());
  const { data, error, retry } = useQuery(() => statsService.getMonthlySummary(yearMonth), [yearMonth]);
  // Los ahorros se leen aparte: si fallan, el resto de Estadísticas sigue funcionando y la sección simplemente no aparece.
  const { data: savings } = useQuery(() => statsService.getSavingsMonth(yearMonth), [yearMonth]);

  // Inicio puede mandar aquí con `state.scrollTo` (HashRouter no admite anclas #): se baja a esa sección una sola vez, cuando ya hay datos.
  const scrollTo = (location.state as { scrollTo?: string } | null)?.scrollTo;
  const hasSections = Boolean((data && data.transactions > 0) || savings?.hasAccounts);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrollTo || !hasSections || scrolled.current) return;
    let frame = requestAnimationFrame(() => {
      // Dos cuadros: deja que la pantalla pinte (y que useScrollRestoration termine) antes de bajar.
      frame = requestAnimationFrame(() => {
        scrolled.current = true;
        document.getElementById(scrollTo)?.scrollIntoView({ block: 'start' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTo, hasSections]);

  const isCurrentMonth = yearMonth === currentYearMonth();
  // El promedio se divide entre los días transcurridos (en el mes actual, los que van); el pie lo dice para que a inicio de mes no parezca un error.
  const elapsedDays = elapsedDaysInMonth(yearMonth);
  const tileAmount = (value: number) => <Amount value={value} compact={Math.abs(value) >= TILE_COMPACT_FROM} />;

  return (
    <div className="page">
      <PageHeader title="Estadísticas" actions={<PrivacyToggle />} />
      <MonthNavigator value={yearMonth} onChange={setYearMonth} max={currentYearMonth()} />

      {!data ? (
        error ? (
          <div className="card">
            <ErrorState description="No pudimos leer tus estadísticas. Inténtalo de nuevo." onRetry={retry} />
          </div>
        ) : (
          <StatsSkeleton />
        )
      ) : data.transactions === 0 ? (
        <div className="card">
          <EmptyState
            icon="chart"
            title="Sin gastos en este mes"
            description={`No hay movimientos en ${formatMonthTitle(yearMonth)}. Usa las flechas para ver otros meses.`}
            action={
              isCurrentMonth ? (
                <Button icon="plus" onClick={() => navigate('/gasto/nuevo')}>
                  Agregar gasto
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setYearMonth(currentYearMonth())}>
                  Ir a este mes
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <Stat as="section" aria-label="Total del mes" label="Total gastado" value={<Amount value={data.total} />}>
            <ComparisonLine summary={data} />
          </Stat>

          <div className="tiles tiles--2x2">
            <Stat
              size="sm"
              label="Promedio diario"
              value={tileAmount(Math.round(data.dailyAverage))}
              foot={`en ${elapsedDays} ${pluralize(elapsedDays, 'día', 'días')}`}
            />
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
            <div className="section__heading">
              <h2 className="section__title">Gasto por día</h2>
              <p className="section__hint">Toca o desliza para ver cada día</p>
            </div>
            <div className="card">
              <DailyBars days={data.daily} today={isCurrentMonth ? todayIso() : undefined} />
            </div>
          </section>

          <section className="section section--anchor" id="por-categoria">
            <div className="section__heading">
              <h2 className="section__title">Por categoría</h2>
              <p className="section__hint">Toca una categoría para ver sus gastos</p>
            </div>
            <div className="card">
              <CategoryBars items={data.byCategory} onSelect={(item) => navigate(categoryHistoryPath(item.categoryId, yearMonth), { state: { returnTo: statsReturnTarget(yearMonth) } })} />
            </div>
          </section>

          <section className="section">
            <h2 className="section__title">Por método de pago</h2>
            <div className="card">
              {data.byMethod.length === 1 ? (
                <MethodSingle item={data.byMethod[0]} />
              ) : (
                <DonutChart items={data.byMethod} total={data.total} />
              )}
            </div>
          </section>
        </>
      )}

      {data && savings?.hasAccounts && <SavingsSection summary={savings} isCurrentMonth={isCurrentMonth} />}
    </div>
  );
}
