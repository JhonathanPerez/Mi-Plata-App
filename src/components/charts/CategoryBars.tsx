import { EmojiTile } from '@/components/ui/EmojiTile';
import { Amount } from '@/components/ui/Money';
import { formatPercent } from '@/lib/money';
import type { CategoryTotal } from '@/types/models';

interface CategoryBarsProps {
  items: CategoryTotal[];
  limit?: number;
}

export function CategoryBars({ items, limit }: CategoryBarsProps) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(...shown.map((item) => item.total), 1);

  return (
    <ul className="bars">
      {shown.map((item) => (
        <li key={item.categoryId} className="bars__row">
          <EmojiTile emoji={item.icon} color={item.color} size="sm" />
          <div className="bars__main">
            <div className="bars__line">
              <span className="bars__name">{item.name}</span>
              <span className="bars__value">
                <Amount value={item.total} />
              </span>
            </div>
            <div className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(item.total / max) * 100}%`, background: item.color }} />
            </div>
            <span className="bars__percent">{formatPercent(item.percent)} del mes</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
