import { useRef, type ReactNode } from 'react';
import { useDrag } from '@use-gesture/react';
import { animate, motion, useMotionValue, useTransform, type HTMLMotionProps, type MotionValue } from 'motion/react';
import { cx } from '@/lib/cx';
import { haptics } from '@/lib/haptics';
import { Icon, type IconName } from './Icon';

/** Lo que pasa al deslizar una fila hacia un lado. */
export interface SwipeAction {
  /** Texto del aviso que se descubre al deslizar. */
  label: string;
  icon: IconName;
  /** Color del aviso: `primary` (confirmar), `neutral` (deshacer) o `danger` (borrar). */
  tone?: 'primary' | 'neutral' | 'danger';
  /** Texto del botón oculto equivalente, para lector de pantalla y teclado. */
  srLabel: string;
  onCommit: () => void;
}

interface SwipeRowProps {
  /** Acción al deslizar hacia la derecha (el aviso aparece en el borde izquierdo). */
  swipeRight?: SwipeAction;
  /** Acción al deslizar hacia la izquierda (el aviso aparece en el borde derecho). */
  swipeLeft?: SwipeAction;
  /** Anima la entrada y la salida de la fila (alto y opacidad). Úsalo dentro de `AnimatePresence`. */
  collapse?: boolean;
  className?: string;
  children: ReactNode;
}

/** Cuánto hay que deslizar (px) para que cuente como confirmar la acción. */
const COMMIT_DISTANCE = 96;
/** Ancho máximo que se puede arrastrar (con un poco de resistencia). */
const MAX_PULL = 160;
/** Por debajo de esta distancia un gesto rápido no cuenta como "lanzar" la fila. */
const FLICK_MIN_DISTANCE = 32;

/** Efecto "goma": pasado el máximo, cada píxel extra cuesta 6 veces más. */
function rubberPull(distance: number): number {
  return distance <= MAX_PULL ? distance : MAX_PULL + (distance - MAX_PULL) / 6;
}

function tapFor(action: SwipeAction): Promise<void> {
  return action.tone === 'danger' ? haptics.warning() : haptics.tap();
}

interface RevealProps {
  action: SwipeAction;
  side: 'left' | 'right';
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
}

function Reveal({ action, side, opacity, scale }: RevealProps) {
  const tone = action.tone ?? 'primary';
  return (
    <motion.div className={cx('swipe-row__reveal', `swipe-row__reveal--${side}`, `swipe-row__reveal--${tone}`)} style={{ opacity }} aria-hidden="true">
      <motion.span className="swipe-row__reveal-inner" style={{ scale }}>
        <Icon name={action.icon} size={22} />
        {action.label}
      </motion.span>
    </motion.div>
  );
}

/**
 * Fila que se desliza para ejecutar una acción: hacia la derecha (`swipeRight`) y/o hacia la izquierda (`swipeLeft`).
 * Se pasa el contenido como hijos. Si el gesto pasa de cierta distancia (o es un lanzamiento rápido) se ejecuta la acción;
 * si no, la fila vuelve a su sitio. Un clic justo después de arrastrar se ignora, así el contenido no se abre por accidente.
 * Para lector de pantalla y teclado se añaden botones ocultos equivalentes a cada acción.
 */
export function SwipeRow({ swipeRight, swipeLeft, collapse, className, children }: SwipeRowProps) {
  const x = useMotionValue(0);
  // Cada aviso solo se ve mientras x se mueve hacia su lado: useTransform deja en el extremo del rango cuando x se sale de él.
  const rightOpacity = useTransform(x, [0, FLICK_MIN_DISTANCE, COMMIT_DISTANCE], [0, 0.55, 1]);
  const rightScale = useTransform(x, [FLICK_MIN_DISTANCE, COMMIT_DISTANCE], [0.85, 1]);
  const leftOpacity = useTransform(x, [-COMMIT_DISTANCE, -FLICK_MIN_DISTANCE, 0], [1, 0.55, 0]);
  const leftScale = useTransform(x, [-COMMIT_DISTANCE, -FLICK_MIN_DISTANCE], [1, 0.85]);
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

      // Solo se puede arrastrar hacia un lado si ese lado tiene acción.
      const toRight = mx >= 0;
      const action = toRight ? swipeRight : swipeLeft;
      const pulled = action ? rubberPull(Math.abs(mx)) : 0;

      if (!last) {
        x.set(toRight ? pulled : -pulled);
        const past = pulled >= COMMIT_DISTANCE;
        if (action && past && !crossed.current) void tapFor(action);
        crossed.current = past;
        return;
      }

      const flicked = vx > 0.7 && (toRight ? dx > 0 : dx < 0) && pulled > FLICK_MIN_DISTANCE;
      void animate(x, 0, { type: 'spring', stiffness: 520, damping: 42 });
      if (action && (pulled >= COMMIT_DISTANCE || flicked)) action.onCommit();
      // El "click" llega justo después de soltar: se ignora mientras dure el arrastre.
      setTimeout(() => {
        dragged.current = false;
      }, 60);
    },
    { axis: 'x', filterTaps: true, pointer: { touch: true } },
  );

  const collapseMotion: HTMLMotionProps<'div'> = collapse
    ? {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: 'auto' },
        exit: { opacity: 0, height: 0 },
        transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
      }
    : {};

  return (
    <motion.div className={cx('swipe-row', className)} {...collapseMotion}>
      {swipeRight && <Reveal action={swipeRight} side="left" opacity={rightOpacity} scale={rightScale} />}
      {swipeLeft && <Reveal action={swipeLeft} side="right" opacity={leftOpacity} scale={leftScale} />}
      {/* Los manejadores de useDrag son del DOM; motion.div tipa algunos (onAnimationStart...) distinto. Solo choca el tipo. */}
      <motion.div
        className="swipe-row__front"
        style={{ x }}
        {...(bind() as unknown as HTMLMotionProps<'div'>)}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        {children}
        {swipeRight && (
          <button type="button" className="sr-only" onClick={swipeRight.onCommit}>
            {swipeRight.srLabel}
          </button>
        )}
        {swipeLeft && (
          <button type="button" className="sr-only" onClick={swipeLeft.onCommit}>
            {swipeLeft.srLabel}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
