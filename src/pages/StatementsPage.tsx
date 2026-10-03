import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { StatementDatesSheet } from '@/components/cards/StatementDatesSheet';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Row } from '@/components/ui/Row';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { cx } from '@/lib/cx';
import { statementDates } from '@/lib/cycles';
import { diffDays, todayIso } from '@/lib/dates';
import { statementStatus, type StatementTone } from '@/lib/statementStatus';
import { formatDayMonth, periodMonthName, relativeDays, statementDatesLabel } from '@/lib/statementText';
import { capitalize, pluralize } from '@/lib/text';
import { cardService, type CardStatement } from '@/services/cardService';

const VISIBLE = 12;

/** Desde mil millones la cifra no cabe en una línea de 32 px en 360 dp: se abrevia (igual que en Tarjetas). */
const COMPACT_FROM = 1_000_000_000;

/** Icono de la pastilla de estado: el color no es lo único que distingue un estado de otro. */
const STATUS_ICON: Record<StatementTone, IconName> = { paid: 'check', neutral: 'calendar', warning: 'clockCountdown', danger: 'warning' };

/** Historial de extractos de una tarjeta, con sus fechas, su monto y si están pagados. */
export function StatementsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = todayIso();
  const { cop, hidden } = useAmountFormat();
  const { data: overview, loading, error, retry } = useQuery(() => cardService.getOverview(id), [id]);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<CardStatement | null>(null);

  const goToRules = () => navigate(`/tarjetas/${id}/fechas`);

  // Un error de lectura no es una tarjeta borrada: cada caso dice lo suyo y ofrece su salida.
  if (error && !overview) {
    return (
      <div className="page">
        <PageHeader title="Extractos" back actions={<PrivacyToggle />} />
        <div className="card">
          <ErrorState description="No pudimos leer los extractos de esta tarjeta. Inténtalo de nuevo." onRetry={retry} />
        </div>
      </div>
    );
  }
  if (!loading && !overview) {
    return (
      <div className="page">
        <PageHeader title="Extractos" back />
        <div className="card">
          <EmptyState
            icon="card"
            title="Esta tarjeta ya no existe"
            description="Puede que la hayas eliminado o desactivado."
            action={
              <Button icon="card" onClick={() => navigate('/tarjetas', { replace: true })}>
                Ir a Tarjetas
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const rules = overview?.method.cycle ?? null;
  const closed = (overview?.statements ?? []).filter((statement) => statement.closed);
  const shown = showAll ? closed : closed.slice(0, VISIBLE);
  const open = overview?.open;
  const spokenAmount = (value: number) => (hidden ? 'valor oculto' : cop(value));

  return (
    <div className="page">
      <PageHeader title={overview ? `Extractos · ${overview.method.name}` : 'Extractos'} back actions={<PrivacyToggle />} />

      {loading && !overview ? (
        <div className="page-skeleton" role="status" aria-label="Cargando extractos">
          <Skeleton height={184} radius="l" />
          <Skeleton height={22} width="45%" />
          <div className="card card--flush">
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton-row skeleton-row--expense">
                <div className="skeleton-row__body">
                  <Skeleton height={16} width="45%" />
                  <Skeleton height={22} width="60%" />
                  <Skeleton height={13} width="85%" />
                </div>
                <Skeleton height={18} width="72px" />
              </div>
            ))}
          </div>
        </div>
      ) : !rules ? (
        <div className="card">
          <EmptyState
            icon="calendar"
            title="Falta configurar el corte y el pago"
            description="Sin esas fechas no se pueden armar los extractos de esta tarjeta."
            action={
              <Button icon="calendar" onClick={goToRules}>
                Configurar corte y pago
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {open && (
            <Stat
              as="section"
              className="statement-open"
              aria-label={`Ciclo de ${periodMonthName(open.period)} abierto`}
              label={`Ciclo de ${periodMonthName(open.period)} · abierto`}
              value={<Amount value={open.total} compact={open.total >= COMPACT_FROM} />}
              foot={`Corta ${formatDayMonth(open.cutDate)} · ${relativeDays(diffDays(today, open.cutDate))}`}
            >
              <span className="stat__foot">
                {open.expenses.length} {pluralize(open.expenses.length, 'gasto', 'gastos')} · pago hasta {formatDayMonth(open.dueDate)}
              </span>
            </Stat>
          )}

          {closed.length === 0 ? (
            <div className="card card--flush">
              <EmptyState
                icon="list"
                title="Aún no hay extractos cerrados"
                description="Cuando llegue el corte de tu ciclo, aparecerá aquí con su monto y su fecha de pago."
              />
            </div>
          ) : (
            <section className="section">
              <div className="section__heading">
                <h2 className="section__title">Extractos cerrados</h2>
                <p className="section__hint">Toca uno para ajustar sus fechas</p>
              </div>
              <div className="card card--flush">
                {shown.map((statement) => {
                  const status = statementStatus(statement, today);
                  const normal = statementDates(rules, statement.period);
                  const adjusted = statement.fixed && (normal.cut !== statement.cutDate || normal.due !== statement.dueDate);
                  const year = statement.period.slice(0, 4);
                  const title = `${capitalize(periodMonthName(statement.period))}${year !== today.slice(0, 4) ? ` ${year}` : ''}`;
                  const dates = statementDatesLabel(statement.cutDate, statement.dueDate);
                  return (
                    <Row
                      key={statement.period}
                      onClick={() => setEditing(statement)}
                      aria-label={[
                        title,
                        status.label,
                        dates,
                        status.partialUnpaid !== null ? `quedan ${spokenAmount(status.partialUnpaid)} sin pagar` : null,
                        `total ${spokenAmount(statement.total)}`,
                        adjusted ? 'fechas ajustadas' : null,
                        'toca para ajustar sus fechas',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      title={
                        <span className="statement-head">
                          <span className="statement-head__month">{title}</span>
                          <span className="row__amount statement-head__amount">
                            <Amount value={statement.total} />
                          </span>
                        </span>
                      }
                    >
                      <span className="statement-flags">
                        <span className={cx('statement-status', `statement-status--${status.tone}`)}>
                          <Icon name={STATUS_ICON[status.tone]} size={16} />
                          {status.label}
                        </span>
                        {adjusted && <span className="statement-tag">Ajustado</span>}
                      </span>
                      {status.partialUnpaid !== null && (
                        <span className="row__detail">
                          Quedan <Amount value={status.partialUnpaid} /> sin pagar
                        </span>
                      )}
                      <span className="row__detail statement-dates">{dates}</span>
                    </Row>
                  );
                })}
              </div>
              {!showAll && closed.length > VISIBLE && <LinkButton onClick={() => setShowAll(true)}>Ver extractos anteriores</LinkButton>}
            </section>
          )}
        </>
      )}

      {editing && rules && (
        <StatementDatesSheet open methodId={id} rules={rules} statement={editing} onClose={() => setEditing(null)} onEditRules={goToRules} />
      )}
    </div>
  );
}
