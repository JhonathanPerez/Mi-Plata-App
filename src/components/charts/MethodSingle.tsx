import { EmojiTile } from '@/components/ui/EmojiTile';
import { Amount } from '@/components/ui/Money';
import type { MethodTotal } from '@/types/models';

interface MethodSingleProps {
  item: MethodTotal;
}

/** Un solo método de pago en el mes: una dona al 100 % no dice nada, así que se muestra como una fila (misma forma que las barras de categoría). */
export function MethodSingle({ item }: MethodSingleProps) {
  return (
    <ul className="bars">
      <li className="bars__row">
        <EmojiTile emoji={item.icon} color={item.color} size="sm" />
        <div className="bars__main">
          <div className="bars__line">
            <span className="bars__name">{item.name}</span>
            <span className="bars__value">
              <Amount value={item.total} />
            </span>
          </div>
          <span className="bars__percent">Todos tus gastos del mes</span>
        </div>
      </li>
    </ul>
  );
}
