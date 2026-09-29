import { useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import { animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { haptics } from '@/lib/haptics';
import type { ExpenseWithRefs } from '@/types/models';
import { ExpenseRow } from './ExpenseRow';

interface SwipeToPayRowProps {
  expense: ExpenseWithRefs;
  onSelect: (id: string) => void;
  onTogglePaid: (expense: ExpenseWithRefs) => void;
  /** Si se pasa, deslizar hacia la izquierda pide eliminar el gasto (con confirmación a cargo de quien reciba el callback). */
  onDelete?: (expense: ExpenseWithRefs) => void;
}

/** Cuánto hay que deslizar (px) para que cuente como "cambiar estado". */
const COMMIT_DISTANCE = 96;
const MAX_PULL = 160;

/** Aplica el efecto "goma": pasado el máximo, cada píxel extra cuesta 6 veces más. */
function rubberPull(distance: number): number {
  return distance <= MAX_PULL ? distance : MAX_PULL + (distance - MAX_PULL) / 6;
}

/**
 * Una fila del historial que se desliza a la derecha para marcarla como pagada (si estaba por pagar)
 * o de nuevo como por pagar, y hacia la izquierda para eliminarla. Para lector de pantalla y teclado
 * hay botones equivalentes ocultos.
 */
export function SwipeToPayRow({ expense, onSelect, onTogglePaid, onDelete }: SwipeToPayRowProps) {
  const isDue = expense.paidAt === null;
  const x = useMotionValue(0);
  // Cada aviso solo se ve mientras x se mueve hacia su lado: useTransform deja en el extremo del rango cuando x se sale de él.
  const payOpacity = useTransform(x, [0, 32, COMMIT_DISTANCE], [0, 0.55, 1]);
  const deleteOpacity = useTransform(x, [-COMMIT_DISTANCE, -32, 0], [1, 0.55, 0]);
  const dragged = useRef(false);
  const crossed = useRef(false);

  const bind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], first, last, tap }) => {
      if (tap) return;
      if (first) {
        dragged.current = false;
        crossed.current = false;
      }
      if (Math.abs(mx) > 6) dragged.current = true;

      const rightPull = rubberPull(Math.max(0, mx));
      const leftPull = onDelete ? rubberPull(Math.max(0, -mx)) : 0;
      const pull = mx >= 0 ? rightPull : -leftPull;

      if (!last) {
        x.set(pull);
        const past = mx >= 0 ? rightPull >= COMMIT_DISTANCE : leftPull >= COMMIT_DISTANCE;
        if (past && !crossed.current) void (mx >= 0 ? haptics.tap() : haptics.warning());
        crossed.current = past;
        return;
      }

      const commitPay = rightPull >= COMMIT_DISTANCE || (vx > 0.7 && dx > 0 && rightPull > 32);
      const commitDelete = onDelete && (leftPull >= COMMIT_DISTANCE || (vx > 0.7 && dx < 0 && leftPull > 32));
      void animate(x, 0, { type: 'spring', stiffness: 520, damping: 42 });
      if (commitPay) onTogglePaid(expense);
      else if (commitDelete) onDelete?.(expense);
      setTimeout(() => {
        dragged.current = false;
      }, 60);
    },
    { axis: 'x', filterTaps: true, pointer: { touch: true } },
  );

  return (
    <div className="swipe-row">
      <motion.div className={`swipe-row__reveal${isDue ? '' : ' swipe-row__reveal--undo'}`} style={{ opacity: payOpacity }} aria-hidden="true">
        <Icon name={isDue ? 'check' : 'refresh'} size={22} />
        <span>{isDue ? 'Pagado' : 'Por pagar'}</span>
      </motion.div>
      {onDelete && (
        <motion.div className="swipe-row__reveal swipe-row__reveal--danger" style={{ opacity: deleteOpacity }} aria-hidden="true">
          <span>Eliminar</span>
          <Icon name="trash" size={22} />
        </motion.div>
      )}
      {/* Los manejadores de useDrag son del DOM; motion.div tipa algunos (onAnimationStart...) distinto. Solo choca el tipo. */}
      <motion.div className="swipe-row__front" style={{ x }} {...(bind() as unknown as HTMLMotionProps<'div'>)}>
        <ExpenseRow
          expense={expense}
          onSelect={(id) => {
            if (dragged.current) return;
            onSelect(id);
          }}
        />
        <button type="button" className="sr-only" onClick={() => onTogglePaid(expense)}>
          {isDue ? 'Marcar como pagado' : 'Marcar como por pagar'}: {expense.categoryName} {expense.note ?? ''}
        </button>
        {onDelete && (
          <button type="button" className="sr-only" onClick={() => onDelete(expense)}>
            Eliminar gasto: {expense.categoryName} {expense.note ?? ''}
          </button>
        )}
      </motion.div>
    </div>
  );
}
