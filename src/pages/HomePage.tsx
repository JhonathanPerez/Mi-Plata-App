import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { BudgetStrip } from '@/components/charts/BudgetStrip';
import { CategoryBars } from '@/components/charts/CategoryBars';
import { DonutChart } from '@/components/charts/DonutChart';
import { BudgetSheet } from '@/components/expenses/BudgetSheet';
import { ExpenseRow } from '@/components/expenses/ExpenseRow';
import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Money } from '@/components/ui/Money';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { formatLongDate, formatMonthTitle } from '@/lib/dates';
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

  return (
    <div className="page">
      <header className="home-head">
        <div className="home-head__text">
          <h1 className="home-head__month">{formatMonthTitle(data.yearMonth)}</h1>
          <p className="home-head__date">Hoy es {formatLongDate(data.today)}</p>
        </div>
        <PrivacyToggle />
      </header>

      {pendingCount ? (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <Link to="/pendientes" className="pending-banner">
          <span className="pending-banner__badge" aria-hidden="true">
            {pendingCount}
          </span>
          <span className="pending-banner__text">
            <strong>
              {pendingCount} {pluralize(pendingCount, 'gasto por categorizar', 'gastos por categorizar')}
            </strong>
            <small>Detectados en tus notificaciones y mensajes</small>
          </span>
          <Icon name="chevronRight" size={20} />
        </Link>
        </motion.div>
      ) : null}

      <section className="hero" aria-label="Resumen del presupuesto">
        {budget.hasBudget ? (
          <>
            <p className="hero__label">{budget.level === 'over' ? 'Presupuesto superado' : 'Disponible este mes'}</p>
            <p className="hero__value">
              <Money value={budget.level === 'over' ? budget.overBy : budget.available} />
            </p>
            {budget.level === 'over' && <p className="hero__sub">por encima de tu presupuesto</p>}
          </>
        ) : (
          <>
            <p className="hero__label">Gastado este mes</p>
            <p className="hero__value">
              <Money value={data.monthTotal} />
            </p>
          </>
        )}

        <BudgetStrip segments={data.byCategory} budget={budget.budget} spent={budget.spent} />

        {budget.hasBudget ? (
          <button type="button" className="hero__foot" onClick={() => setBudgetOpen(true)}>
            <span>{formatPercent(budget.percentUsed)} usado</span>
            <span className="hero__budget">
              Presupuesto {cop(budget.budget)}
              <Icon name="edit" size={16} />
            </span>
          </button>
        ) : (
          <Button variant="secondary" className="hero__cta" onClick={() => setBudgetOpen(true)} icon="target">
            Definir presupuesto mensual
          </Button>
        )}

        {budget.level === 'over' && (
          <p className="hero__notice" role="status">
            <Icon name="warning" size={20} />
            <span>
              Este mes gastaste {cop(budget.overBy)} más de lo planeado. Puedes ajustar el presupuesto o revisar tus gastos.
            </span>
          </p>
        )}
        {budget.level === 'near' && (
          <p className="hero__notice" role="status">
            <Icon name="info" size={20} />
            <span>Ya usaste {formatPercent(budget.percentUsed)} de tu presupuesto. Te quedan {cop(budget.available)}.</span>
          </p>
        )}
      </section>

      <div className="tiles">
        <div className="tile">
          <span className="tile__label">Gastos de hoy</span>
          <span className="tile__value">
            <Money value={data.todayTotal} />
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">Gastos del mes</span>
          <span className="tile__value">
            <Money value={data.monthTotal} />
          </span>
        </div>
      </div>

      {dueSummary && dueSummary.total + dueSummary.other.total > 0 && (
        <DueSummaryCard summary={dueSummary} onPay={() => navigate('/tarjetas')} />
      )}

      {!hasSpending ? (
        <div className="card">
          <EmptyState
            emoji="🧾"
            title="Aún no hay gastos este mes"
            description="Toca el botón + para registrar el primero. Toma menos de diez segundos."
            action={
              <Button icon="plus" onClick={() => navigate('/gasto/nuevo')}>
                Agregar gasto
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {data.topCategory && (
            <section className="card top-category" aria-label="Categoría con más gasto">
              <EmojiTile emoji={data.topCategory.icon} color={data.topCategory.color} />
              <div>
                <p className="top-category__label">Mayor gasto del mes</p>
                <p className="top-category__name">{data.topCategory.name}</p>
              </div>
              <p className="top-category__amount">
                <Money value={data.topCategory.total} />
              </p>
            </section>
          )}

          <section className="section">
            <h2 className="section__title">Por categoría</h2>
            <div className="card">
              <CategoryBars items={data.byCategory} limit={5} />
              {data.byCategory.length > 5 && (
                <Link className="link" to="/estadisticas">
                  Ver todas las categorías
                </Link>
              )}
            </div>
          </section>

          <section className="section">
            <h2 className="section__title">Método de pago</h2>
            <div className="card">
              <DonutChart items={data.byMethod} total={data.monthTotal} />
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Recientes</h2>
              <Link className="link" to="/gastos">
                Ver todos
              </Link>
            </div>
            <div className="card card--flush">
              {data.recent.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} showDate onSelect={(id) => navigate(`/gasto/${id}`)} />
              ))}
            </div>
          </section>
        </>
      )}

      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} yearMonth={data.yearMonth} currentAmount={budget.budget} />
    </div>
  );
}
