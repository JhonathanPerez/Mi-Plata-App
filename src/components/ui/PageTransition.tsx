import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface PageTransitionProps {
  children: ReactNode;
  /**
   * Además de aparecer, sube unos píxeles. Solo para las pestañas: al mover con `transform` un contenedor,
   * los elementos `position: fixed` que lleve dentro (como la barra de guardar) quedarían mal ubicados
   * durante la animación, así que las demás pantallas solo hacen fundido.
   */
  slide?: boolean;
}

/** Entrada suave de una pantalla. Respeta "reducir movimiento" del sistema. */
export function PageTransition({ children, slide = false }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: slide ? 10 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
