import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { indexAtPosition, stepIndex } from '@/lib/dailyChart';
import { formatDayHeading, formatShortDate } from '@/lib/dates';
import type { DailyTotal, IsoDate } from '@/types/models';

interface DailyBarsProps {
  days: DailyTotal[];
  /** Hoy, solo si el mes que se ve es el actual: los días posteriores se dibujan punteados («aún no llegan»). */
  today?: IsoDate;
}

/**
 * Gasto por día. Tocar o deslizar el dedo sobre el gráfico elige un día y su monto aparece abajo (cada barra mide ~8 px: no se
 * puede tocar una por una). Alternativa accesible: el gráfico es un control deslizante que se mueve con flechas, Inicio y Fin.
 */
export function DailyBars({ days, today }: DailyBarsProps) {
  const { cop } = useAmountFormat();
  const [selectedDate, setSelectedDate] = useState<IsoDate | null>(null);

  const max = Math.max(...days.map((d) => d.total), 0);
  const peak = max > 0 ? days.find((d) => d.total === max) : undefined;
  const peakIndex = peak ? days.indexOf(peak) : -1;
  // Al cambiar de mes la fecha elegida ya no está en `days`: se vuelve solo al día de mayor gasto.
  const selectedIndex = selectedDate === null ? -1 : days.findIndex((d) => d.date === selectedDate);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(peakIndex, 0);
  const active = days[activeIndex];

  const isFuture = (day: DailyTotal) => today !== undefined && day.date > today;
  const amountText = (day: DailyTotal) => (isFuture(day) ? 'aún no llega' : day.total === 0 ? 'sin gastos' : cop(day.total));

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const day = days[indexAtPosition(event.clientX - rect.left, rect.width, days.length)];
    if (day) setSelectedDate(day.date);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(activeIndex, event.key, days.length);
    if (next === null) return;
    event.preventDefault();
    setSelectedDate(days[next].date);
  };

  // Sin selección (o con el pico seleccionado) se muestra el día de mayor gasto, como antes.
  const showingPeak = peak !== undefined && (selectedIndex < 0 || selectedIndex === peakIndex);

  return (
    <div>
      <div
        className="daily"
        role="slider"
        tabIndex={0}
        aria-label="Gasto por día"
        aria-valuemin={1}
        aria-valuemax={days.length}
        aria-valuenow={activeIndex + 1}
        aria-valuetext={
          selectedIndex >= 0 || !peak ? `${formatShortDate(active.date)}: ${amountText(active)}` : `Mayor gasto el ${formatShortDate(peak.date)}: ${cop(peak.total)}`
        }
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
        }}
        onPointerUp={pick}
        onKeyDown={onKeyDown}
      >
        {days.map((day, index) => (
          <span
            key={day.date}
            className={cx(
              'daily__bar',
              day.total === 0 && 'is-empty',
              isFuture(day) && 'is-future',
              peak && day.date === peak.date && 'is-peak',
              selectedIndex === index && 'is-selected',
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
      {showingPeak ? (
        <p className="daily__readout">
          Día de mayor gasto: {formatShortDate(peak.date)} · <Amount value={peak.total} />
        </p>
      ) : (
        <p className="daily__readout">
          {formatDayHeading(active.date)} · {isFuture(active) ? 'Aún no llega' : active.total === 0 ? 'Sin gastos' : <Amount value={active.total} />}
        </p>
      )}
    </div>
  );
}
