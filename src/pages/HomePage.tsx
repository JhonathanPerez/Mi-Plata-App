import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { BudgetStrip } from '@/components/charts/BudgetStrip';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { BudgetSheet } from '@/components/expenses/BudgetSheet';
import { ExpenseRow } from '@/components/expenses/ExpenseRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { formatMonthTitle, formatWeekdayDay } from '@/lib/dates';
import { formatPercent } from '@/lib/money';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { pluralize } from '@/lib/text';
import { DueSummaryCard } from '@/components/cards/DueSummaryCard';
import { cardService } from '@/services/cardService';
import { captureService } from '@/services/captureService';
import { statsService } from '@/services/statsService';

export function HomePage() {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(() => statsService.getDashboard());
  const { data: pendingCount } = useQuery(() => captureService.countPending());
  const { data: dueSummary } = useQuery(() => cardService.dueSummary());
  const [budgetOpen, setBudgetOpen] = useState(false);
  const { cop } = useAmountFormat();

  if (!data) {
    return (
      <div className="page">
        {error ? (
          <p className="muted" role="status">
            No se pudieron cargar tus gastos.
          </p>
        ) : (
          <div className="page-skeleton" role="status" aria-label="Cargando tus gastos">
            <Skeleton height={34} width="62%" radius="s" />
            <Skeleton height={150} radius="l" />
            <div className="tiles">
              <Skeleton height={76} radius="l" />
              <Skeleton height={76} radius="l" />
            </div>
            <Skeleton height={72} radius="l" />
          </div>
        )}
      </div>
    );
  }

  const { budget } = data;
  const hasSpending = data.monthCount > 0;
  // Si todos los gastos visibles son del mismo método, repetirlo en cada fila es ruido.
  const showMethod = new Set(data.recent.map((expense) => expense.paymentMethodId)).size > 1;

  return (
    <div className="page">
      <PageHeader
        title={formatMonthTitle(data.yearMonth)}
        subtitle={`Hoy es ${formatWeekdayDay(data.today)}`}
        actions={<PrivacyToggle />}
      />

      {pendingCount ? (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <Notice tone="warning" icon="inbox" to="/pendientes" title={`${pendingCount} ${pluralize(pendingCount, 'gasto por categorizar', 'gastos por categorizar')}`} />
        </motion.div>
      ) : null}

      <section className="hero" aria-label="Resumen del presupuesto">
        {budget.hasBudget ? (
          <Stat
            tone="hero"
            size="lg"
            label={budget.level === 'over' ? 'Presupuesto superado' : 'Disponible este mes'}
            value={<Money value={budget.level === 'over' ? budget.overBy : budget.available} />}
            foot={budget.level === 'over' ? 'por encima de tu presupuesto' : undefined}
          />
        ) : (
          <Stat tone="hero" size="lg" label="Gastado este mes" value={<Money value={data.monthTotal} />} />
        )}

        <Link to="/estadisticas" className="hero__strip" aria-label="Ver estadísticas del mes">
          <BudgetStrip segments={data.byCategory} budget={budget.budget} spent={budget.spent} />
        </Link>

        {budget.hasBudget ? (
          <button type="button" className="hero__foot" onClick={() => setBudgetOpen(true)}>
            <span>{formatPercent(budget.percentUsed)} usado</span>
            <span className="hero__budget">
              Presupuesto {cop(budget.budget)}
              <Icon name="edit" size={16} />
            </span>
          </button>
        ) : (
          <button type="button" className="hero__foot" onClick={() => setBudgetOpen(true)}>
            <span className="hero__cta">
              <Icon name="target" size={20} />
              Definir presupuesto mensual
            </span>
            <Icon name="chevronRight" size={20} />
          </button>
        )}

        {budget.level === 'over' && (
          <Notice tone="danger" role="status">
            Superaste el presupuesto
          </Notice>
        )}
        {budget.level === 'near' && (
          <Notice tone="warning" icon="info" role="status">
            Vas cerca del límite
          </Notice>
        )}
      </section>

      {dueSummary && dueSummary.total + dueSummary.other.total > 0 && (
        <DueSummaryCard summary={dueSummary} onPay={() => navigate('/tarjetas')} />
      )}

      {budget.hasBudget ? (
        <div className="tiles">
          <Stat size="sm" label="Gastos de hoy" value={<Money value={data.todayTotal} />} />
          <Stat size="sm" label="Gastos del mes" value={<Money value={data.monthTotal} />} />
        </div>
      ) : (
        <Stat
          size="sm"
          className={data.todayTotal === 0 ? 'stat--inline stat--quiet' : 'stat--inline'}
          label="Hoy"
          value={data.todayTotal === 0 ? 'Sin gastos' : <Money value={data.todayTotal} />}
        />
      )}

      {!hasSpending ? (
        <div className="card">
          <EmptyState
            icon="list"
            title="Aún no hay gastos este mes"
            description="Toca el botón + para registrar el primero. Toma menos de diez segundos."
          />
        </div>
      ) : (
        <>
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Recientes</h2>
              <Link className="link" to="/gastos">
                Ver todos
              </Link>
            </div>
            <div className="card card--flush">
              {data.recent.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} showDate showStatus={false} compact showMethod={showMethod} onSelect={(id) => navigate(`/gasto/${id}`)} />
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Por categoría</h2>
              {data.byCategory.length > 3 && (
                <Link className="link" to="/estadisticas">
                  Ver todas
                </Link>
              )}
            </div>
            <div className="card">
              <CategoryBars items={data.byCategory} limit={3} highlightFirst compact />
            </div>
          </section>
        </>
      )}

      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} yearMonth={data.yearMonth} currentAmount={budget.budget} />
    </div>
  );
}
