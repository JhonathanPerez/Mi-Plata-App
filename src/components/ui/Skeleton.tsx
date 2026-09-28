import { cx } from '@/lib/cx';

interface SkeletonProps {
  /** Alto en píxeles (por defecto 16). */
  height?: number;
  /** Ancho CSS (por defecto 100%). */
  width?: string;
  radius?: number;
  className?: string;
}

/** Marcador de carga con brillo suave: se ve el "esqueleto" de la pantalla en vez de un "Cargando…". */
export function Skeleton({ height = 16, width = '100%', radius = 10, className }: SkeletonProps) {
  return <span className={cx('skeleton', className)} style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}
