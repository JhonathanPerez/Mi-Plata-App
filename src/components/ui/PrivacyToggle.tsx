import { usePrivacy } from '@/app/providers/PrivacyProvider';
import { haptics } from '@/lib/haptics';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

/** El ojito: oculta o muestra todos los valores en pesos. Es el mismo interruptor en Inicio, Gastos y Estadísticas. */
export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy();
  const label = hidden ? 'Mostrar valores' : 'Ocultar valores';
  return (
    <button
      type="button"
      className={cx('icon-btn', 'privacy-toggle', className)}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      onClick={() => {
        void haptics.tap();
        toggle();
      }}
    >
      <Icon name={hidden ? 'eyeOff' : 'eye'} size={22} />
    </button>
  );
}
