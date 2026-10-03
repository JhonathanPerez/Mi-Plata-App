import { LOGO_RING_COLORS } from '@/config/constants';
import { cx } from '@/lib/cx';

/** Giro de cada tramo. La longitud de trazo y el retraso de la animación de cada uno están en splash.css (.s1 a .s5). */
const SEGMENTS = [
  { className: 'ring-seg s1', rotation: -90 },
  { className: 'ring-seg s2', rotation: 1.44 },
  { className: 'ring-seg s3', rotation: 79.92 },
  { className: 'ring-seg s4', rotation: 151.92 },
  { className: 'ring-seg s5', rotation: 217.44 },
];

/**
 * Logo de Mi Plata (anillo de cinco tramos y punto amarillo). Lo usan la pantalla de carga y la de bloqueo.
 * Con `animated={false}` aparece ya dibujado: la pantalla de bloqueo lo usa para continuar la de carga
 * sin que el anillo vuelva a empezar de cero.
 */
export function RingLogo({ animated = true }: { animated?: boolean }) {
  return (
    <div className={cx('splash__mark', !animated && 'splash__mark--static')} aria-hidden="true">
      <svg viewBox="0 0 108 108">
        {SEGMENTS.map((segment, index) => (
          <circle
            key={segment.className}
            className={segment.className}
            cx="54"
            cy="52"
            r="25"
            stroke={LOGO_RING_COLORS[index]}
            transform={`rotate(${segment.rotation} 54 52)`}
          />
        ))}
        <circle className="center-dot" cx="54" cy="52" r="8.6" style={{ fill: 'var(--status-pending)' }} />
      </svg>
    </div>
  );
}
