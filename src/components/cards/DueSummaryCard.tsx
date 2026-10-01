import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { Notice } from '@/components/ui/Notice';
import { Row } from '@/components/ui/Row';
import { dueShortLabel } from '@/lib/statementText';
import type { DueSummary } from '@/services/cardService';

interface DueSummaryCardProps {
  summary: DueSummary;
  onPay: () => void;
}

/** Tarjeta de Inicio: cuánto se debe en tarjetas de crédito y cuándo vence lo más próximo. */
export function DueSummaryCard({ summary, onPay }: DueSummaryCardProps) {
  const hasCards = summary.cards.length > 0;
  const anyClosed = summary.cards.some((card) => card.hasClosedStatement);
  // Con una sola fila, su monto sería el mismo del encabezado: se muestra una sola vez.
  const singleRow = summary.cards.length + (summary.other.count > 0 ? 1 : 0) === 1;
  return (
    <section className="due-summary" aria-label="Por pagar">
      <div className="due-summary__head">
        <span>
          <Icon name="card" size={18} />
          Por pagar
        </span>
        <strong>
          <Amount value={summary.total + summary.other.total} />
        </strong>
      </div>

      <div className="due-summary__list">
        {summary.cards.map((card) => {
          const label = card.nextDue
            ? dueShortLabel(card.nextDue.date, card.nextDue.daysLeft)
            : card.configured
              ? 'Ciclo abierto'
              : 'Falta configurar las fechas';
          return (
            <Row
              as="div"
              key={card.methodId}
              leading={<EmojiTile emoji={card.icon} color={card.color} />}
              title={card.name}
              detail={card.nextDue?.overdue ? <span className="row__status row__status--late">{label}</span> : label}
              amount={singleRow ? undefined : <Amount value={card.total} />}
            />
          );
        })}

        {summary.other.count > 0 && (
          <Row
            to="/gastos?estado=por-pagar"
            leading={<EmojiTile emoji="🧾" color="var(--neutral-tile)" />}
            title="Otros métodos"
            detail={`${summary.other.count} ${summary.other.count === 1 ? 'gasto pendiente' : 'gastos pendientes'}`}
            amount={singleRow ? undefined : <Amount value={summary.other.total} />}
          />
        )}
      </div>

      {hasCards && (
        <Button block icon={anyClosed ? 'check' : 'card'} onClick={onPay}>
          {anyClosed ? 'Pagar tarjeta' : 'Ver tarjetas'}
        </Button>
      )}
      <Notice>Ya está incluido en «Gastos del mes»: pagar no cambia tu presupuesto.</Notice>
    </section>
  );
}
