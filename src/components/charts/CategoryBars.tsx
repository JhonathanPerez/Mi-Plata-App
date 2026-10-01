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
}

export function CategoryBars({ items, limit, highlightFirst = false }: CategoryBarsProps) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(...shown.map((item) => item.total), 1);

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
            <div className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={cssVars({ '--fill': `${(item.total / max) * 100}%`, '--swatch': item.color })} />
            </div>
            <span className="bars__percent">{formatPercent(item.percent)} del mes</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
