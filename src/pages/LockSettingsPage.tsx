import { useEffect, useState } from 'react';
import { useToast } from '@/app/providers/ToastProvider';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { useQuery } from '@/hooks/useQuery';
import { authenticate, getBiometricSupport, type BiometricSupport } from '@/lib/biometrics';
import { errorMessage } from '@/lib/errors';
import { normalizeLockDelay } from '@/lib/lockPolicy';
import { lockService } from '@/services/lockService';

/** Ajustes › Bloqueo con huella o rostro: activarlo y elegir cada cuánto se vuelve a pedir. */
export function LockSettingsPage() {
  const toast = useToast();
  const { data: lock } = useQuery(() => lockService.getConfig());
  const [support, setSupport] = useState<BiometricSupport | null>(null);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const onToggleLock = async (next: boolean) => {
    if (support === 'web') {
      toast.show('El bloqueo funciona en la app instalada en el teléfono.', 'info');
      return;
    }
    if (next && support !== 'available') {
      toast.show('Primero configura una huella, un rostro o un PIN en los ajustes de tu teléfono.', 'error');
      return;
    }
    // Se confirma la identidad tanto para activar (prueba que funciona) como para desactivar (evita que otro lo apague).
    if (support === 'available') {
      const outcome = await authenticate(next ? 'Confirma para activar el bloqueo' : 'Confirma para desactivar el bloqueo');
      if (!outcome.ok) {
        if (!outcome.cancelled) toast.show(outcome.message, 'error');
        return;
      }
    }
    try {
      await lockService.setEnabled(next);
      toast.show(next ? 'Bloqueo activado' : 'Bloqueo desactivado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Bloqueo con huella o rostro" back />

      <div className="card">
        <Toggle
          checked={lock?.enabled ?? true}
          onChange={(next) => void onToggleLock(next)}
          label="Pedir huella o rostro"
          hint="Se pide al abrir la app. Si falla el sensor, usas el PIN del teléfono."
        />
      </div>

      {support === 'none' && (
        <Notice tone="warning" title="No se puede proteger la app">
          Tu teléfono no tiene huella, rostro ni PIN configurado. Actívalos en los ajustes del teléfono.
        </Notice>
      )}

      {lock?.enabled && support !== 'none' && (
        <section className="section">
          <h2 className="section__title">Volver a pedirlo</h2>
          <div className="card stack">
            <Segmented<string>
              label="Cuándo volver a pedir el bloqueo"
              value={String(lock.delaySeconds)}
              onChange={(value) => void lockService.setDelay(normalizeLockDelay(value))}
              options={[
                { value: '0', label: 'Siempre' },
                { value: '60', label: '1 min' },
                { value: '300', label: '5 min' },
              ]}
            />
            <p className="field__hint">«Siempre» lo pide cada vez que vuelves a la app; con un tiempo, solo si pasó más de eso.</p>
          </div>
        </section>
      )}
    </div>
  );
}
