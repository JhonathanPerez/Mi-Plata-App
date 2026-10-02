import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { cardScrim } from '@/lib/cardColor';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { cycleDatesLabel, dueShortLabel, periodMonthName, shadeColor } from '@/lib/statementText';
import type { CardOverview } from '@/services/cardService';

/** Desde mil millones la cifra no cabe en una línea de 32 px en 360 dp: se abrevia. */
const COMPACT_FROM = 1_000_000_000;

interface CreditCardTileProps {
  overview: CardOverview;
}

/**
 * Una tarjeta de crédito en la lista: primero cuánto se debe y cuándo vence, después el ciclo abierto,
 * el botón de pagar y dos accesos (extractos y reglas). El texto blanco se mantiene legible sobre cualquier color elegido.
 */
export function CreditCardTile({ overview }: CreditCardTileProps) {
  const navigate = useNavigate();
  const { method, payable, open, nextDue } = overview;
  const dueTotal = payable.reduce((total, statement) => total + statement.unpaidTotal, 0);
  const urgent = nextDue !== null && nextDue.daysLeft <= 0;

  return (
    <section
      className="credit-card"
      style={cssVars({ '--card-from': method.color, '--card-to': shadeColor(method.color, 0.42), '--card-scrim': cardScrim(method.color) })}
      aria-label={method.name}
    >
      <div className="credit-card__top">
        <span className="credit-card__name">{method.name}</span>
        {method.last4 && <span className="credit-card__num">•••• {method.last4}</span>}
      </div>

      {!overview.configured ? (
        <>
          <div className="credit-card__panel">
            <span className="credit-card__label">Falta configurar el corte y el pago</span>
            <span className="credit-card__note">Sin esas fechas no se pueden armar los extractos de esta tarjeta.</span>
          </div>
          <Button variant="inverse" block icon="calendar" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
            Configurar corte y pago
          </Button>
        </>
      ) : (
        <>
          {payable.length > 0 ? (
            <div className="credit-card__panel credit-card__panel--due">
              <span className="credit-card__label">
                {payable.length === 1 ? `Por pagar · extracto de ${periodMonthName(payable[0].period)}` : `Por pagar · ${payable.length} extractos`}
              </span>
              <strong className="credit-card__amount">
                <Amount value={dueTotal} compact={dueTotal >= COMPACT_FROM} />
              </strong>
              {nextDue && (
                <span className={cx('credit-card__chip', urgent && 'credit-card__chip--urgent')}>
                  <Icon name={urgent ? 'warning' : 'calendar'} size={18} />
                  {dueShortLabel(nextDue.date, nextDue.daysLeft)}
                </span>
              )}
              {payable.length > 1 && (
                <ul className="credit-card__list">
                  {payable.map((statement) => (
                    <li key={statement.period} className="credit-card__item">
                      <span>Extracto de {periodMonthName(statement.period)}</span>
                      <span>
                        <Amount value={statement.unpaidTotal} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {open && (
            <div className={cx('credit-card__panel', payable.length > 0 && 'credit-card__panel--compact')}>
              <span className="credit-card__label">Ciclo de {periodMonthName(open.period)} · abierto</span>
              <strong className="credit-card__amount">
                <Amount value={open.unpaidTotal} compact={open.unpaidTotal >= COMPACT_FROM} />
              </strong>
              <span className="credit-card__note">{cycleDatesLabel(open.cutDate, open.dueDate)}</span>
            </div>
          )}

          {payable.length > 0 && (
            <Button variant="inverse" block icon="check" onClick={() => navigate(`/tarjetas/${method.id}/pagar`)}>
              {payable.length === 1 ? `Pagar extracto de ${periodMonthName(payable[0].period)}` : 'Pagar tarjeta'}
            </Button>
          )}

          <div className="credit-card__links">
            <button type="button" className="credit-card__link" onClick={() => navigate(`/tarjetas/${method.id}/extractos`)}>
              Ver extractos
              <Icon name="chevronRight" size={18} />
            </button>
            <button type="button" className="credit-card__link" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
              Reglas de corte y pago
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
