import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { formatShortDate } from '@/lib/dates';
import type { DailyTotal } from '@/types/models';

interface DailyBarsProps {
  days: DailyTotal[];
}

export function DailyBars({ days }: DailyBarsProps) {
  const max = Math.max(...days.map((d) => d.total), 0);
  const peak = max > 0 ? days.find((d) => d.total === max) : undefined;

  return (
    <div>
      <div className="daily" role="img" aria-label="Gasto por día del mes">
        {days.map((day) => (
          <span
            key={day.date}
            className={`daily__bar${day.total === 0 ? ' is-empty' : ''}${peak && day.date === peak.date ? ' is-peak' : ''}`}
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
