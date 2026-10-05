import { useNavigate } from 'react-router-dom';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { formatPercent } from '@/lib/money';
import type { SavingsMonthAccount } from '@/lib/savings';

interface SavingsBarsProps {
  items: SavingsMonthAccount[];
}

/**
 * Cuánto hay en cada cuenta al cerrar el mes y qué parte del total es. Misma forma que las barras de categoría;
 * cada fila abre la cuenta con sus movimientos.
 */
export function SavingsBars({ items }: SavingsBarsProps) {
  const navigate = useNavigate();
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="bars__row bars__row--button" onClick={() => navigate(`/ahorros/${item.id}`)}>
            <EmojiTile emoji={item.icon} color={item.color} size="sm" />
            <span className="bars__main">
              <span className="bars__line">
                <span className="bars__name">{item.name}</span>
                <span className="bars__value">
                  <Amount value={item.balance} />
                </span>
              </span>
              <span className="bars__track" aria-hidden="true">
                <span className="bars__fill" style={cssVars({ '--fill': `${item.percent > 0 ? Math.max(item.percent, 2) : 0}%`, '--swatch': item.color })} />
              </span>
              <span className="bars__percent">
                {formatPercent(item.percent)} del total
                {' · '}
                {item.deposited === 0 && item.withdrawn === 0 ? (
                  'Sin movimientos este mes'
                ) : (
                  <>
                    {item.deposited > 0 && (
                      <>
                        Metiste <Amount value={item.deposited} />
                      </>
                    )}
                    {item.deposited > 0 && item.withdrawn > 0 && ' · '}
                    {item.withdrawn > 0 && (
                      <>
                        Salió <Amount value={item.withdrawn} />
                      </>
                    )}
                  </>
                )}
              </span>
            </span>
            <Icon name="chevronRight" size={20} className="bars__chevron" />
          </button>
        </li>
      ))}
    </ul>
  );
}
