import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { dueLabel } from '@/lib/statementText';
import type { DueSummary } from '@/services/cardService';

interface DueSummaryCardProps {
  summary: DueSummary;
  onPay: () => void;
}

/** Tarjeta de Inicio: cuánto se debe en tarjetas de crédito y cuándo vence lo más próximo. */
export function DueSummaryCard({ summary, onPay }: DueSummaryCardProps) {
  const hasCards = summary.cards.length > 0;
  const anyClosed = summary.cards.some((card) => card.hasClosedStatement);
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

      {summary.cards.map((card) => (
        <div className="due-summary__row" key={card.methodId}>
          <EmojiTile emoji={card.icon} color={card.color} />
          <div>
            <strong>{card.name}</strong>
            <span className={card.nextDue?.overdue ? 'due-summary__late' : undefined}>
              {card.nextDue
                ? dueLabel(card.nextDue.date, card.nextDue.daysLeft)
                : card.configured
                  ? 'Ciclo abierto'
                  : 'Falta configurar las fechas'}
            </span>
          </div>
          <strong>
            <Amount value={card.total} />
          </strong>
        </div>
      ))}

      {summary.other.count > 0 && (
        <Link className="due-summary__row due-summary__row--link" to="/gastos?estado=por-pagar">
          <EmojiTile emoji="🧾" color="#7A6F66" />
          <div>
            <strong>Otros métodos</strong>
            <span>
              {summary.other.count} {summary.other.count === 1 ? 'gasto pendiente' : 'gastos pendientes'}
            </span>
          </div>
          <strong>
            <Amount value={summary.other.total} />
          </strong>
        </Link>
      )}

      {hasCards && (
        <Button block icon={anyClosed ? 'check' : 'card'} onClick={onPay}>
          {anyClosed ? 'Pagar tarjeta' : 'Ver tarjetas'}
        </Button>
      )}
      <p className="due-summary__note">
        <Icon name="info" size={15} />
        <span>Ya está incluido en «Gastos del mes»: pagar no cambia tu presupuesto.</span>
      </p>
    </section>
  );
}
