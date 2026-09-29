import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatementDatesSheet } from '@/components/cards/StatementDatesSheet';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { cx } from '@/lib/cx';
import { statementDates } from '@/lib/cycles';
import { diffDays, todayIso } from '@/lib/dates';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { dueLabel, formatDayMonth, periodMonthName, relativeDays } from '@/lib/statementText';
import { capitalize } from '@/lib/text';
import { cardService, type CardStatement } from '@/services/cardService';

const VISIBLE = 12;

/** Historial de extractos de una tarjeta, con sus fechas, su monto y si están pagados. */
export function StatementsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = todayIso();
  const { cop } = useAmountFormat();
  const { data: overview, loading } = useQuery(() => cardService.getOverview(id), [id]);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<CardStatement | null>(null);

  if (!loading && !overview) {
    return (
      <div className="page">
        <PageHeader title="Extractos" back />
        <p className="muted">Esta tarjeta ya no existe.</p>
      </div>
    );
  }
  const rules = overview?.method.cycle ?? null;
  const closed = (overview?.statements ?? []).filter((s) => s.closed || s.expenses.length > 0);
  const shown = showAll ? closed : closed.slice(0, VISIBLE);
  const open = overview?.open;

  const stateOf = (statement: CardStatement): { text: string; tone: 'paid' | 'due' | 'late' | 'open' } => {
    if (!statement.closed) return { text: `Corta el ${formatDayMonth(statement.cutDate)}`, tone: 'open' };
    if (statement.unpaidCount === 0) {
      return { text: statement.lastPaidAt ? `Pagado el ${formatDayMonth(statement.lastPaidAt)}` : 'Pagado', tone: 'paid' };
    }
    const days = diffDays(today, statement.dueDate);
    const partial = statement.paidCount > 0 ? `Quedan ${cop(statement.unpaidTotal)} sin pagar · ` : '';
    return { text: partial + dueLabel(statement.dueDate, days), tone: days < 0 ? 'late' : 'due' };
  };

  return (
    <div className="page">
      <PageHeader title={overview ? `Extractos · ${overview.method.name}` : 'Extractos'} back actions={<PrivacyToggle />} />

      {loading && !overview ? (
        <div className="page-skeleton" role="status" aria-label="Cargando extractos">
          <Skeleton height={90} radius={20} />
          <Skeleton height={260} radius={24} />
        </div>
      ) : !rules ? (
        <section className="statement-open">
          <span className="muted">Falta configurar el corte y el pago de esta tarjeta.</span>
          <button type="button" className="link link--button" onClick={() => navigate(`/tarjetas/${id}/fechas`)}>
            Configurar fechas
          </button>
        </section>
      ) : (
        <>
          {open && (
            <section className="statement-open">
              <span className="muted">
                Ciclo abierto · corta el {formatDayMonth(open.cutDate)} ({relativeDays(diffDays(today, open.cutDate))})
              </span>
              <strong>
                <Amount value={open.total} />
              </strong>
              <small>
                {open.expenses.length} {open.expenses.length === 1 ? 'gasto' : 'gastos'} hasta hoy · se paga hasta el {formatDayMonth(open.dueDate)}
              </small>
            </section>
          )}

          <div className="card card--flush">
            {shown.filter((s) => s.closed).map((statement) => {
              const state = stateOf(statement);
              const normal = statementDates(rules, statement.period);
              const adjusted = statement.fixed && (normal.cut !== statement.cutDate || normal.due !== statement.dueDate);
              return (
                <button type="button" className="statement-row statement-row--button" key={statement.period} onClick={() => setEditing(statement)}>
                  <EmojiTile emoji={state.tone === 'paid' ? '✅' : '🧾'} color={state.tone === 'paid' ? '#2A9D8F' : '#F5B301'} />
                  <span className="statement-row__body">
                    <strong>
                      {capitalize(periodMonthName(statement.period))} {statement.period.slice(0, 4) !== today.slice(0, 4) ? statement.period.slice(0, 4) : ''}
                      {adjusted && <span className="statement-tag">Ajustado</span>}
                    </strong>
                    <span className="muted nowrap">Corte {formatDayMonth(statement.cutDate)}</span>
                    <span className="muted nowrap">Pago máx. {formatDayMonth(statement.dueDate)}</span>
                    <span className={cx('statement-row__state', state.tone === 'due' && 'is-due', state.tone === 'late' && 'is-late')}>{state.text}</span>
                  </span>
                  <strong className="statement-row__amount">
                    <Amount value={statement.total} />
                  </strong>
                </button>
              );
            })}
            {shown.filter((s) => s.closed).length === 0 && <p className="muted empty-note">Aún no hay extractos cerrados.</p>}
          </div>

          {!showAll && closed.length > VISIBLE && (
            <button type="button" className="link link--button" onClick={() => setShowAll(true)}>
              Ver extractos anteriores
            </button>
          )}

          <p className="muted statement-footnote">
            <Icon name="info" size={16} />
            <span>Toca un extracto para ajustar sus fechas. Cada uno guarda las suyas: cambiar un mes no altera los demás.</span>
          </p>
          <button type="button" className="link link--button" onClick={() => navigate(`/tarjetas/${id}/fechas`)}>
            Editar las reglas de corte y pago
          </button>
        </>
      )}

      {editing && rules && (
        <StatementDatesSheet
          open
          methodId={id}
          rules={rules}
          statement={editing}
          onClose={() => setEditing(null)}
          onEditRules={() => navigate(`/tarjetas/${id}/fechas`)}
        />
      )}
    </div>
  );
}
