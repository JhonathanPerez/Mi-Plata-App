import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { formatShortDate } from '@/lib/dates';
import type { DailyTotal, IsoDate } from '@/types/models';

interface DailyBarsProps {
  days: DailyTotal[];
  /** Hoy, solo si el mes que se ve es el actual: los días posteriores se dibujan punteados («aún no llegan»). */
  today?: IsoDate;
}

export function DailyBars({ days, today }: DailyBarsProps) {
  const { cop } = useAmountFormat();
  const max = Math.max(...days.map((d) => d.total), 0);
  const peak = max > 0 ? days.find((d) => d.total === max) : undefined;
  const summary = peak
    ? `Gasto por día del mes. Mayor gasto el ${formatShortDate(peak.date)}: ${cop(peak.total)}.`
    : 'Gasto por día del mes. Sin gastos.';

  return (
    <div>
      <div className="daily" role="img" aria-label={summary}>
        {days.map((day) => (
          <span
            key={day.date}
            className={cx(
              'daily__bar',
              day.total === 0 && 'is-empty',
              today !== undefined && day.date > today && 'is-future',
              peak && day.date === peak.date && 'is-peak',
            )}
            style={cssVars({ '--bar-h': `${max > 0 ? Math.max((day.total / max) * 100, day.total > 0 ? 6 : 0) : 0}%` })}
          />
        ))}
      </div>
      <div className="daily__axis" aria-hidden="true">
        <span>1</span>
        <span>{Math.ceil(days.length / 2)}</span>
        <span>{days.length}</span>
      </div>
      {peak && (
        <p className="daily__peak">
          Día de mayor gasto: {formatShortDate(peak.date)} · <Amount value={peak.total} />
        </p>
      )}
    </div>
  );
}
