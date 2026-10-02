import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCaptureAccess } from '@/hooks/useCaptureAccess';
import { errorMessage } from '@/lib/errors';
import { captureBridge } from '@/lib/notificationCapture';

/** Ajustes › Activar notificaciones: dar a Mi Plata el permiso «Acceso a notificaciones» para detectar las compras del banco. */
export function CaptureSetupPage() {
  const toast = useToast();
  const { supported, enabled } = useCaptureAccess();

  const openSettings = async () => {
    try {
      await captureBridge.openSettings();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Activar notificaciones" back />

      <section className="card capture-status" aria-live="polite">
        <span className={`capture-status__dot${enabled ? ' is-on' : ''}`} aria-hidden="true" />
        <div>
          <p className="capture-status__title">
            {!supported ? 'Solo disponible en el teléfono' : enabled === null ? 'Comprobando…' : enabled ? 'Activadas' : 'Desactivadas'}
          </p>
          {!supported && <p className="muted">En el navegador no se pueden leer notificaciones. Puedes probar el lector pegando un mensaje.</p>}
          {supported && enabled === false && <p className="muted">Dale acceso a las notificaciones para que Mi Plata detecte tus compras.</p>}
        </div>
      </section>

      {supported && (
        <Button size="lg" block icon="bell" onClick={() => void openSettings()}>
          {enabled ? 'Abrir ajustes de acceso' : 'Dar acceso a notificaciones'}
        </Button>
      )}

      <section className="section">
        <h2 className="section__title">Cómo activarlas</h2>
        <ol className="card steps">
          <li>Toca <strong>Dar acceso a notificaciones</strong>, busca <strong>Mi Plata</strong> en la lista y actívalo.</li>
          <li>
            Si Android dice <strong>«Ajuste restringido»</strong>: sal, abre <em>Información de la app ▸ ⋮ ▸ Permitir ajustes restringidos</em> y vuelve a intentarlo.
          </li>
          <li>
            En Xiaomi, Samsung, Oppo y similares, quita el ahorro de batería para Mi Plata (<em>Batería ▸ Sin restricciones</em>); si no, el teléfono puede cerrar el lector y perderías avisos.
          </li>
        </ol>
      </section>
    </div>
  );
}
