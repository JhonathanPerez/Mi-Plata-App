import { EmojiTile } from '@/components/ui/EmojiTile';
import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { formatPercent } from '@/lib/money';
import type { CategoryTotal } from '@/types/models';

interface CategoryBarsProps {
  items: CategoryTotal[];
  limit?: number;
  /** Marca la primera barra como «Mayor gasto» (la lista llega ordenada de mayor a menor). */
  highlightFirst?: boolean;
  /**
   * Versión de Inicio: el porcentaje va al final de la barra (una línea menos por fila) y, si `limit` recorta la lista,
   * una fila «Otras» suma el resto para que los porcentajes cierren en 100 %.
   */
  compact?: boolean;
}

export function CategoryBars({ items, limit, highlightFirst = false, compact = false }: CategoryBarsProps) {
  const shown = limit ? items.slice(0, limit) : items;
  const rest = compact && limit ? items.slice(limit) : [];
  const restTotal = rest.reduce((sum, item) => sum + item.total, 0);
  const restPercent = rest.reduce((sum, item) => sum + item.percent, 0);
  const max = Math.max(...shown.map((item) => item.total), restTotal, 1);

  return (
    <ul className="bars">
      {shown.map((item, index) => (
        <li key={item.categoryId} className={cx('bars__row', highlightFirst && index === 0 && 'bars__row--top')}>
          <EmojiTile emoji={item.icon} color={item.color} size="sm" />
          <div className="bars__main">
            <div className="bars__line">
              <span className="bars__name">
                {item.name}
                {highlightFirst && index === 0 && <span className="bars__tag">Mayor gasto</span>}
              </span>
              <span className="bars__value">
                <Amount value={item.total} />
              </span>
            </div>
            {compact ? (
              <div className="bars__meter">
                <div className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={cssVars({ '--fill': `${(item.total / max) * 100}%`, '--swatch': item.color })} />
                </div>
                <span className="bars__percent bars__percent--inline">{formatPercent(item.percent)}</span>
              </div>
            ) : (
              <>
                <div className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={cssVars({ '--fill': `${(item.total / max) * 100}%`, '--swatch': item.color })} />
                </div>
                <span className="bars__percent">{formatPercent(item.percent)} del mes</span>
              </>
            )}
          </div>
        </li>
      ))}
      {restTotal > 0 && (
        <li className="bars__row">
          <EmojiTile emoji="📦" color="var(--neutral-tile)" size="sm" />
          <div className="bars__main">
            <div className="bars__line">
              <span className="bars__name">Otras</span>
              <span className="bars__value">
                <Amount value={restTotal} />
              </span>
            </div>
            <div className="bars__meter">
              <div className="bars__track" aria-hidden="true">
                <span className="bars__fill" style={cssVars({ '--fill': `${(restTotal / max) * 100}%`, '--swatch': 'var(--neutral-tile)' })} />
              </div>
              <span className="bars__percent bars__percent--inline">{formatPercent(restPercent)}</span>
            </div>
          </div>
        </li>
      )}
    </ul>
  );
}
