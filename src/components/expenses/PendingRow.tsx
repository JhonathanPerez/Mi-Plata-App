import { useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { describeSource } from '@/config/capture';
import { useLongPress } from '@/hooks/useLongPress';
import { formatDayHeading, formatTime, todayIso } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { formatCOP } from '@/lib/money';
import type { PendingCapture } from '@/types/models';

interface PendingRowProps {
  item: PendingCapture;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  onReportSpam: (id: string) => void;
}

/** Cuánto hay que deslizar (px) para que cuente como "descartar". */
const DISMISS_DISTANCE = 96;
/** Ancho máximo que se puede arrastrar (con un poco de resistencia). */
const MAX_PULL = 160;

function whenLabel(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  // Espacios duros: "6:49 a. m." y "sáb 19 sep" no deben partirse en dos líneas.
  const NBSP = '\u00a0';
  const day = formatDayHeading(todayIso(date)).replace(/ /g, NBSP);
  const time = formatTime(`${hh}:${mm}`).replace(/ /g, NBSP);
  return `${day} · ${time}`;
}

/**
 * Un gasto detectado que espera categoría. Tocar la fila lo abre; deslizarla a la izquierda lo descarta
 * (con confirmación, así un roce accidental no borra nada). Mantenerla presionada abre un menú con
 * "Descartar" y "Reportar como publicidad". Para lector de pantalla y teclado hay botones equivalentes.
 */
export function PendingRow({ item, onOpen, onDismiss, onReportSpam }: PendingRowProps) {
  const title = item.merchant ?? 'Comercio sin identificar';
  const x = useMotionValue(0);
  const revealOpacity = useTransform(x, [-DISMISS_DISTANCE, -32, 0], [1, 0.55, 0]);
  const revealScale = useTransform(x, [-DISMISS_DISTANCE, -32], [1, 0.85]);
  const dragged = useRef(false);
  const crossed = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress({
    onLongPress: () => {
      setMenuOpen(true);
      void haptics.tap();
    },
  });

  const bind = useDrag(
    ({ movement: [mx], velocity: [vx], direction: [dx], first, last, tap }) => {
      if (tap) return;
      if (first) {
        dragged.current = false;
        crossed.current = false;
      }
      if (Math.abs(mx) > 6) dragged.current = true;

      // Solo hacia la izquierda; pasado el máximo, cada píxel extra cuesta 6 veces más (efecto "goma").
      const pulled = Math.max(0, -mx);
      const pull = -(pulled <= MAX_PULL ? pulled : MAX_PULL + (pulled - MAX_PULL) / 6);

      if (!last) {
        x.set(pull);
        const past = pull <= -DISMISS_DISTANCE;
        if (past && !crossed.current) void haptics.tap();
        crossed.current = past;
        return;
      }

      const commit = pull <= -DISMISS_DISTANCE || (vx > 0.7 && dx < 0 && pull < -32);
      void animate(x, 0, { type: 'spring', stiffness: 520, damping: 42 });
      if (commit) onDismiss(item.id);
      // El "click" llega justo después de soltar: se ignora si el usuario estaba arrastrando.
      setTimeout(() => {
        dragged.current = false;
      }, 60);
    },
    { axis: 'x', filterTaps: true, pointer: { touch: true } },
  );

  return (
    <motion.div
      className="pending-row"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div className="pending-row__reveal" style={{ opacity: revealOpacity }} aria-hidden="true">
        <motion.span className="pending-row__reveal-inner" style={{ scale: revealScale }}>
          <Icon name="trash" size={22} />
          Descartar
        </motion.span>
      </motion.div>

      {/* Los manejadores de useDrag son del DOM; motion.div tipa algunos (onAnimationStart...) distinto. Solo choca el tipo. */}
      <motion.div className="pending-row__front" style={{ x }} {...(bind() as unknown as HTMLMotionProps<'div'>)}>
        <button
          type="button"
          className="pending-row__main"
          onClick={() => {
            if (dragged.current) return;
            onOpen(item.id);
          }}
          aria-label={`${title}, ${formatCOP(item.amount)}. Categorizar`}
          {...longPress}
        >
          <span className="pending-row__body">
            <span className="pending-row__title">{title}</span>
            <span className="pending-row__meta">
              {describeSource(item.source)} · {whenLabel(item.occurredAt)}
            </span>
            <span className="pending-row__raw">{item.rawText}</span>
          </span>
          <span className="pending-row__amount">{formatCOP(item.amount)}</span>
        </button>
        <button type="button" className="sr-only" onClick={() => onDismiss(item.id)}>
          Descartar {title}
        </button>
        <button type="button" className="sr-only" onClick={() => onReportSpam(item.id)}>
          Reportar {title} como publicidad
        </button>
      </motion.div>

      <Sheet open={menuOpen} title={title} onClose={() => setMenuOpen(false)}>
        <div className="stack">
          <button
            type="button"
            className="row-action"
            onClick={() => {
              setMenuOpen(false);
              onReportSpam(item.id);
            }}
          >
            <Icon name="flag" size={20} />
            <span>
              Reportar como publicidad
              <small className="muted">Ayuda a que mensajes parecidos dejen de aparecer aquí</small>
            </span>
          </button>
          <button
            type="button"
            className="row-action row-action--danger"
            onClick={() => {
              setMenuOpen(false);
              onDismiss(item.id);
            }}
          >
            <Icon name="trash" size={20} />
            <span>Descartar</span>
          </button>
        </div>
      </Sheet>
    </motion.div>
  );
}
