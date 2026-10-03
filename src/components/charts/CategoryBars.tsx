import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { formatPercent } from '@/lib/money';
import type { CategoryTotal } from '@/types/models';

interface CategoryBarsProps {
  items: CategoryTotal[];
  limit?: number;
  /** Marca la primera barra como «Mayor gasto» (la lista llega ordenada de mayor a menor). Con una sola categoría no se marca: sería obvio. */
  highlightFirst?: boolean;
  /**
   * Versión de Inicio: el porcentaje va al final de la barra (una línea menos por fila) y, si `limit` recorta la lista,
   * una fila «Otras» suma el resto para que los porcentajes cierren en 100 %.
   */
  compact?: boolean;
  /** Con esto cada categoría es un botón (con flecha) que llama aquí; sin esto las filas son solo informativas. */
  onSelect?: (item: CategoryTotal) => void;
}

export function CategoryBars({ items, limit, highlightFirst = false, compact = false, onSelect }: CategoryBarsProps) {
  const shown = limit ? items.slice(0, limit) : items;
  const rest = compact && limit ? items.slice(limit) : [];
  const restTotal = rest.reduce((sum, item) => sum + item.total, 0);
  const restPercent = rest.reduce((sum, item) => sum + item.percent, 0);
  const max = Math.max(...shown.map((item) => item.total), restTotal, 1);
  // Inicio: el largo de la barra es el porcentaje real sobre el total del mes (coincide con la cifra y con el texto de ayuda).
  // Estadísticas: se escala contra la categoría mayor para comparar entre ellas.
  // En Inicio una categoría con gasto nunca queda con la barra invisible: mínimo 2 % de carril.
  const fillOf = (total: number, percent: number) => `${compact ? (percent > 0 ? Math.max(percent, 2) : 0) : (total / max) * 100}%`;
  const markTop = highlightFirst && items.length > 1;

  return (
    <ul className="bars">
      {shown.map((item, index) => {
        const top = markTop && index === 0;
        // Todo el contenido son <span>: dentro de un <button> solo es válido contenido en línea.
        const content = (
          <>
            <EmojiTile emoji={item.icon} color={item.color} size="sm" />
            <span className="bars__main">
              <span className="bars__line">
                <span className="bars__name">
                  {item.name}
                  {top && <span className="bars__tag">Mayor gasto</span>}
                </span>
                <span className="bars__value">
                  <Amount value={item.total} />
                </span>
              </span>
              {compact ? (
                <span className="bars__meter">
                  <span className="bars__track" aria-hidden="true">
                    <span className="bars__fill" style={cssVars({ '--fill': fillOf(item.total, item.percent), '--swatch': item.color })} />
                  </span>
                  <span className="bars__percent bars__percent--inline">{formatPercent(item.percent)}</span>
                </span>
              ) : (
                <>
                  <span className="bars__track" aria-hidden="true">
                    <span className="bars__fill" style={cssVars({ '--fill': fillOf(item.total, item.percent), '--swatch': item.color })} />
                  </span>
                  <span className="bars__percent">{formatPercent(item.percent)} del mes</span>
                </>
              )}
            </span>
          </>
        );
        return (
          <li key={item.categoryId}>
            {onSelect ? (
              <button type="button" className={cx('bars__row', 'bars__row--button', top && 'bars__row--top')} onClick={() => onSelect(item)}>
                {content}
                <Icon name="chevronRight" size={20} className="bars__chevron" />
              </button>
            ) : (
              <div className={cx('bars__row', top && 'bars__row--top')}>{content}</div>
            )}
          </li>
        );
      })}
      {restTotal > 0 && (
        <li>
          <div className="bars__row">
            <EmojiTile emoji="📦" color="var(--neutral-tile)" size="sm" />
            <span className="bars__main">
              <span className="bars__line">
                <span className="bars__name">Otras</span>
                <span className="bars__value">
                  <Amount value={restTotal} />
                </span>
              </span>
              <span className="bars__meter">
                <span className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={cssVars({ '--fill': fillOf(restTotal, restPercent), '--swatch': 'var(--neutral-tile)' })} />
                </span>
                <span className="bars__percent bars__percent--inline">{formatPercent(restPercent)}</span>
              </span>
            </span>
          </div>
        </li>
      )}
    </ul>
  );
}
