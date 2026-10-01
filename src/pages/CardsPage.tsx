import { useNavigate } from 'react-router-dom';
import { ReminderPrompt } from '@/components/cards/ReminderPrompt';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { diffDays, todayIso } from '@/lib/dates';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { dueLabel, formatDayMonth, periodMonthName, relativeDays, shadeColor } from '@/lib/statementText';
import { cardService } from '@/services/cardService';

/** Tarjetas de crédito: qué se debe, cuándo corta cada una y cuándo vence el pago. */
export function CardsPage() {
  const navigate = useNavigate();
  const today = todayIso();
  const { data, loading } = useQuery(() => cardService.listOverviews());

  return (
    <div className="page">
      <PageHeader title="Tarjetas" back actions={<PrivacyToggle />} />

      {loading && !data ? (
        <div className="page-skeleton" role="status" aria-label="Cargando tarjetas">
          <Skeleton height={64} radius="m" />
          <Skeleton height={300} radius="l" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            icon="card"
            title="No tienes tarjetas de crédito"
            description="Crea una en Ajustes ▸ Métodos de pago (tipo «Tarjeta de crédito») y configura sus fechas de corte y pago."
          />
        </div>
      ) : (
        <>
          <ReminderPrompt />

          {(data ?? []).map((overview) => {
            const { method } = overview;
            return (
              <section
                key={method.id}
                className="credit-card"
                style={cssVars({ '--card-from': method.color, '--card-to': shadeColor(method.color, 0.42) })}
                aria-label={method.name}
              >
                <div className="credit-card__top">
                  <span className="credit-card__name">{method.name}</span>
                  {method.last4 && <span className="credit-card__num">•••• {method.last4}</span>}
                </div>

                {!overview.configured ? (
                  <>
                    <div className="credit-card__statement">
                      <span>Falta configurar el corte y el pago</span>
                      <small>Sin esas fechas no se pueden armar los extractos de esta tarjeta.</small>
                    </div>
                    <Button variant="inverse" block icon="calendar" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
                      Configurar corte y pago
                    </Button>
                  </>
                ) : (
                  <>
                    {overview.payable.map((statement) => (
                      <div className="credit-card__statement credit-card__statement--due" key={statement.period}>
                        <span>
                          Extracto de {periodMonthName(statement.period)} · cerrado el {formatDayMonth(statement.cutDate)}
                        </span>
                        <strong>
                          <Amount value={statement.unpaidTotal} />
                        </strong>
                        <em className={cx(diffDays(today, statement.dueDate) <= 0 && 'credit-card__badge')}>
                          {diffDays(today, statement.dueDate) <= 0 && <Icon name="warning" size={15} />}
                          {dueLabel(statement.dueDate, diffDays(today, statement.dueDate))}
                        </em>
                      </div>
                    ))}
                    {overview.open && (
                      <div className="credit-card__statement">
                        <span>Ciclo de {periodMonthName(overview.open.period)} · abierto</span>
                        <strong>
                          <Amount value={overview.open.unpaidTotal} />
                        </strong>
                        <small>
                          Corta el {formatDayMonth(overview.open.cutDate)} ({relativeDays(diffDays(today, overview.open.cutDate))}) · se paga hasta el{' '}
                          {formatDayMonth(overview.open.dueDate)}
                        </small>
                      </div>
                    )}
                    {overview.payable.length > 0 && (
                      <Button variant="inverse" block icon="check" onClick={() => navigate(`/tarjetas/${method.id}/pagar`)}>
                        {overview.payable.length === 1
                          ? `Pagar extracto de ${periodMonthName(overview.payable[0].period)}`
                          : 'Pagar tarjeta'}
                      </Button>
                    )}
                    <div className="credit-card__links">
                      <LinkButton tone="inverse" onClick={() => navigate(`/tarjetas/${method.id}/extractos`)}>
                        Ver extractos
                        <Icon name="chevronRight" size={16} />
                      </LinkButton>
                      <LinkButton tone="inverse" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
                        Reglas de corte y pago
                        <Icon name="chevronRight" size={16} />
                      </LinkButton>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
