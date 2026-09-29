import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { formatPercent } from '@/lib/money';
import type { MethodTotal } from '@/types/models';

interface DonutChartProps {
  items: MethodTotal[];
  total: number;
}

/** Dona con leyenda: cada método muestra nombre, porcentaje y valor (no depende solo del color). */
export function DonutChart({ items, total }: DonutChartProps) {
  let offset = 25; // arranca arriba
  return (
    <div className="donut">
      <div className="donut__chart">
        <svg viewBox="0 0 42 42" role="img" aria-label="Distribución por método de pago">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--line)" strokeWidth="5" />
          {items.map((item) => {
            const length = Math.max(item.percent, 0);
            const circle = (
              <circle
                key={item.paymentMethodId}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={item.color}
                strokeWidth="5"
                strokeDasharray={`${Math.max(length - 0.6, 0)} ${100 - Math.max(length - 0.6, 0)}`}
                strokeDashoffset={offset}
              />
            );
            offset -= length;
            return circle;
          })}
        </svg>
        <div className="donut__center">
          <span className="donut__total">
            <Amount value={total} compact />
          </span>
        </div>
      </div>
      <ul className="donut__legend">
        {items.map((item) => (
          <li key={item.paymentMethodId}>
            <span className="donut__swatch" style={cssVars({ '--swatch': item.color })} aria-hidden="true" />
            <span className="donut__name">
              {item.icon} {item.name}
            </span>
            <span className="donut__pct">{formatPercent(item.percent)}</span>
            <span className="donut__amount">
              <Amount value={item.total} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
