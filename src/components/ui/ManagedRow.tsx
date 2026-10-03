import type { ReactNode } from 'react';
import { pluralize } from '@/lib/text';
import { EmojiTile } from './EmojiTile';
import { Row } from './Row';

interface ManagedRowProps {
  emoji: string;
  color: string;
  name: string;
  /** Pieza gris junto al nombre (por ejemplo los últimos 4 dígitos de una tarjeta). */
  suffix?: ReactNode;
  /** Tipo bajo el nombre (solo métodos de pago). */
  kind?: string | null;
  expenseCount: number;
  /** No aparece al registrar un gasto: la fila se atenúa y lo dice en un renglón propio. */
  hidden: boolean;
  onEdit: () => void;
}

/** Fila de «Categorías» y de «Métodos de pago»: misma estructura en las dos listas. */
export function ManagedRow({ emoji, color, name, suffix, kind, expenseCount, hidden, onEdit }: ManagedRowProps) {
  const count = `${expenseCount} ${pluralize(expenseCount, 'gasto', 'gastos')}`;
  return (
    <Row
      className={hidden ? 'row--dim' : undefined}
      leading={<EmojiTile emoji={emoji} color={color} />}
      title={
        <>
          {name}
          {suffix}
        </>
      }
      detail={kind ? `${kind} · ${count}` : count}
      chevron="edit"
      onClick={onEdit}
    >
      {hidden && <span className="row__detail">No aparece al registrar un gasto</span>}
    </Row>
  );
}
