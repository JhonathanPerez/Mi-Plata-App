import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReminderPrompt } from '@/components/cards/ReminderPrompt';
import { StatementDatesSheet } from '@/components/cards/StatementDatesSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { diffDays, todayIso } from '@/lib/dates';
import { dueLabel, formatDayMonth, periodMonthName, relativeDays, shadeColor } from '@/lib/statementText';
import { cardService, type CardOverview, type CardStatement } from '@/services/cardService';

/** Tarjetas de crédito: qué se debe, cuándo corta cada una y cuándo vence el pago. */
export function CardsPage() {
  const navigate = useNavigate();
  const today = todayIso();
  const { cop } = useAmountFormat();
  const { data, loading } = useQuery(() => cardService.listOverviews());
  const [editing, setEditing] = useState<{ overview: CardOverview; statement: CardStatement } | null>(null);

  // Avisos: extractos que vencen en 3 días o menos (o ya vencidos).
  const alerts = useMemo(
    () =>
      (data ?? []).flatMap((overview) =>
        overview.payable
          .map((statement) => ({ overview, statement, daysLeft: diffDays(today, statement.dueDate) }))
          .filter((item) => item.daysLeft <= 3),
      ),
    [data, today],
  );

  return (
    <div className="page">
      <PageHeader title="Tarjetas" back actions={<PrivacyToggle />} />

      {loading && !data ? (
        <div className="page-skeleton" role="status" aria-label="Cargando tarjetas">
          <Skeleton height={64} radius={20} />
          <Skeleton height={300} radius={26} />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            emoji="💳"
            title="No tienes tarjetas de crédito"
            description="Crea una en Ajustes ▸ Métodos de pago (tipo «Tarjeta de crédito») y configura sus fechas de corte y pago."
          />
        </div>
      ) : (
        <>
          <ReminderPrompt />

          {alerts.map(({ overview, statement, daysLeft }) => (
            <section className="pv-alert" key={`${overview.method.id}-${statement.period}`} role="status">
              <Icon name="warning" size={22} />
              <span>
                <strong>
                  Tu extracto de {periodMonthName(statement.period)} de {overview.method.name}{' '}
                  {daysLeft < 0 ? `venció ${relativeDays(daysLeft)}` : daysLeft === 0 ? 'vence hoy' : `vence ${relativeDays(daysLeft)}`}
                </strong>
                . Son {cop(statement.unpaidTotal)}.
              </span>
            </section>
          ))}

          {(data ?? []).map((overview) => {
            const { method } = overview;
            const target = overview.payable[0] ?? overview.open;
            return (
              <section
                key={method.id}
                className="pv-card"
                style={{ background: `linear-gradient(145deg, ${method.color}, ${shadeColor(method.color, 0.42)})` }}
                aria-label={method.name}
              >
                <div className="pv-card__top">
                  <span className="pv-card__name">{method.name}</span>
                  {method.last4 && <span className="pv-card__num">•••• {method.last4}</span>}
                </div>

                {!overview.configured ? (
                  <>
                    <div className="rl-stm">
                      <span>Falta configurar el corte y el pago</span>
                      <small>Sin esas fechas no se pueden armar los extractos de esta tarjeta.</small>
                    </div>
                    <button type="button" className="pv-pay" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
                      <Icon name="calendar" size={18} />
                      Configurar fechas
                    </button>
                  </>
                ) : (
                  <>
                    {overview.payable.map((statement) => (
                      <div className="rl-stm rl-stm--due" key={statement.period}>
                        <span>
                          Extracto de {periodMonthName(statement.period)} · cerrado el {formatDayMonth(statement.cutDate)}
                        </span>
                        <strong>
                          <Amount value={statement.unpaidTotal} />
                        </strong>
                        <em>
                          {diffDays(today, statement.dueDate) <= 0 && <Icon name="warning" size={15} />}
                          {dueLabel(statement.dueDate, diffDays(today, statement.dueDate))}
                        </em>
                      </div>
                    ))}
                    {overview.open && (
                      <div className="rl-stm">
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
                      <button type="button" className="pv-pay" onClick={() => navigate(`/tarjetas/${method.id}/pagar`)}>
                        <Icon name="check" size={18} />
                        {overview.payable.length === 1
                          ? `Pagar extracto de ${periodMonthName(overview.payable[0].period)}`
                          : 'Pagar tarjeta'}
                      </button>
                    )}
                    <div className="cy-links">
                      {target && (
                        <button type="button" className="cy-link cy-link--button" onClick={() => setEditing({ overview, statement: target })}>
                          <Icon name="edit" size={16} />
                          Cambiar fechas de este mes
                        </button>
                      )}
                      <button type="button" className="cy-link cy-link--button" onClick={() => navigate(`/tarjetas/${method.id}/extractos`)}>
                        Fechas y extractos
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}

      {editing && editing.overview.method.cycle && (
        <StatementDatesSheet
          open
          methodId={editing.overview.method.id}
          rules={editing.overview.method.cycle}
          statement={editing.statement}
          onClose={() => setEditing(null)}
          onEditRules={() => navigate(`/tarjetas/${editing.overview.method.id}/fechas`)}
        />
      )}
    </div>
  );
}
