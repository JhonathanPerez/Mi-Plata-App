import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { dueSpoken, dueTone, openCycleProgress, type CycleProgress, type DueTone } from '@/lib/cardDue';
import { cardScrim } from '@/lib/cardColor';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { formatWeekdayDate, todayIso } from '@/lib/dates';
import { formatCOP } from '@/lib/money';
import { cycleDatesLabel, dueShortLabel, periodMonthName, shadeColor } from '@/lib/statementText';
import type { CardOverview } from '@/services/cardService';

/** Desde mil millones la cifra no cabe en una línea de 32 px en 360 dp: se abrevia. */
const COMPACT_FROM = 1_000_000_000;

/** Icono de la pastilla de vencimiento: no depende solo del color (calma, atención, urgente). */
const DUE_ICON: Record<DueTone, IconName> = { neutral: 'calendar', warning: 'clockCountdown', danger: 'warning' };

interface CreditCardTileProps {
  overview: CardOverview;
}

interface PanelProps {
  className: string;
  /** Frase completa para el lector de pantalla (el panel entero abre los extractos). */
  label: string;
  onOpen: () => void;
  children: ReactNode;
}

/**
 * Panel de vidrio tocable: todo el panel abre los extractos de la tarjeta. El botón se extiende sobre el panel
 * (así el contenido sigue siendo texto normal, sin elementos de bloque dentro de un botón) y la flecha avisa que se puede tocar.
 */
function TapPanel({ className, label, onOpen, children }: PanelProps) {
  return (
    <div className={className}>
      {children}
      <button type="button" className="credit-card__hit" aria-label={label} onClick={onOpen} />
      <Icon name="chevronRight" size={20} className="credit-card__chevron" />
    </div>
  );
}

/** Barra fina de los días transcurridos hasta el corte; el dato también está en la frase del panel para el lector de pantalla. */
function CycleBar({ progress }: { progress: CycleProgress }) {
  return (
    <div className="credit-card__progress" aria-hidden="true">
      <span className="credit-card__progress-bar" style={cssVars({ '--progress': progress.ratio })} />
    </div>
  );
}

/**
 * Una tarjeta de crédito en la lista: primero cuánto se debe y cuándo vence, después el ciclo abierto,
 * el botón de pagar y un acceso a las reglas. Los paneles abren los extractos, salvo el ciclo abierto cuando hay un extracto por pagar (solo informa). El texto blanco se mantiene legible sobre cualquier color elegido.
 */
export function CreditCardTile({ overview }: CreditCardTileProps) {
  const navigate = useNavigate();
  const { hidden } = usePrivacy();
  const { method, payable, open, nextDue } = overview;
  const today = todayIso();
  const dueTotal = payable.reduce((total, statement) => total + statement.unpaidTotal, 0);
  const tone: DueTone = nextDue ? dueTone(nextDue.daysLeft) : 'neutral';
  const progress = openCycleProgress(overview, today);
  const upToDate = overview.configured && payable.length === 0 && (open?.unpaidTotal ?? 0) === 0;
  const openStatements = () => navigate(`/tarjetas/${method.id}/extractos`);

  const spokenAmount = (value: number) => (hidden ? 'valor oculto' : formatCOP(value));
  const progressSpoken = progress ? `, día ${progress.elapsed} de ${progress.total}` : '';
  const dueLabel = [
    payable.length === 1 ? `Por pagar ${spokenAmount(dueTotal)}` : `Por pagar ${spokenAmount(dueTotal)} en ${payable.length} extractos`,
    nextDue ? dueSpoken(nextDue.date, nextDue.daysLeft) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const openLabel = open
    ? upToDate
      ? `${method.name} al día${progressSpoken}, corta el ${formatWeekdayDate(open.cutDate)}`
      : `Ciclo de ${periodMonthName(open.period)} abierto ${spokenAmount(open.unpaidTotal)}${progressSpoken}, corta el ${formatWeekdayDate(open.cutDate)}`
    : '';

  // Con un extracto por pagar, ese panel es el que abre los extractos y el ciclo abierto solo informa; sin extractos por pagar, el ciclo abierto sí es tocable.
  const openPanelClass = cx('credit-card__panel', payable.length > 0 && 'credit-card__panel--compact');
  const openPanelBody =
    open && !upToDate ? (
      <>
        <span className="credit-card__label">Ciclo de {periodMonthName(open.period)} · abierto</span>
        <strong className="credit-card__amount">
          <Amount value={open.unpaidTotal} compact={open.unpaidTotal >= COMPACT_FROM} />
        </strong>
        {progress && <CycleBar progress={progress} />}
        <span className="credit-card__note">{cycleDatesLabel(open.cutDate, open.dueDate)}</span>
      </>
    ) : null;

  const payLabel = payable.length === 1 ? `Pagar extracto de ${periodMonthName(payable[0].period)}` : 'Pagar tarjeta';

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
          {payable.length > 0 && (
            <TapPanel className="credit-card__panel credit-card__panel--due" label={`${dueLabel}. Ver extractos de ${method.name}`} onOpen={openStatements}>
              <span className="credit-card__label">
                {payable.length === 1 ? `Por pagar · extracto de ${periodMonthName(payable[0].period)}` : `Por pagar · ${payable.length} extractos`}
              </span>
              <strong className="credit-card__amount">
                <Amount value={dueTotal} compact={dueTotal >= COMPACT_FROM} />
              </strong>
              {nextDue && (
                <span className={cx('credit-card__chip', tone !== 'neutral' && `credit-card__chip--${tone}`)}>
                  <Icon name={DUE_ICON[tone]} size={18} />
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
            </TapPanel>
          )}

          {open && upToDate && (
            <TapPanel className="credit-card__panel" label={`${openLabel}. Ver extractos de ${method.name}`} onOpen={openStatements}>
              <span className="credit-card__chip">
                <Icon name="check" size={18} />
                Al día
              </span>
              {progress && <CycleBar progress={progress} />}
              <span className="credit-card__note">{cycleDatesLabel(open.cutDate, open.dueDate)}</span>
            </TapPanel>
          )}

          {open &&
            !upToDate &&
            (payable.length > 0 ? (
              <div className={openPanelClass} role="group" aria-label={openLabel}>
                {openPanelBody}
              </div>
            ) : (
              <TapPanel className={openPanelClass} label={`${openLabel}. Ver extractos de ${method.name}`} onOpen={openStatements}>
                {openPanelBody}
              </TapPanel>
            ))}

          {payable.length > 0 && (
            <Button variant="inverse" block icon="check" onClick={() => navigate(`/tarjetas/${method.id}/pagar`)}>
              {payLabel} · <Amount value={dueTotal} compact={dueTotal >= COMPACT_FROM} />
            </Button>
          )}

          <button type="button" className="credit-card__link" onClick={() => navigate(`/tarjetas/${method.id}/fechas`)}>
            Reglas de corte y pago
            <Icon name="chevronRight" size={18} />
          </button>
        </>
      )}
    </section>
  );
}
