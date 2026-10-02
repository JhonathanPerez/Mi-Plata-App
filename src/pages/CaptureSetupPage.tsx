import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCaptureAccess } from '@/hooks/useCaptureAccess';
import { errorMessage } from '@/lib/errors';
import { captureBridge } from '@/lib/notificationCapture';
import { syncCapturedNotifications } from '@/services/captureSync';

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

  const syncNow = async () => {
    const summary = await syncCapturedNotifications();
    toast.show(summary.added > 0 ? `Se detectaron ${summary.added} gastos nuevos` : 'No hay gastos nuevos por ahora', 'info');
  };

  return (
    <div className="page">
      <PageHeader title="Activar notificaciones" back />

      <section className="card capture-status" aria-live="polite">
        <span className={`capture-status__dot${enabled ? ' is-on' : ''}`} aria-hidden="true" />
        <div>
          <p className="capture-status__title">
            {!supported ? 'Solo disponible en el teléfono' : enabled === null ? 'Comprobando…' : enabled ? 'Activadas' : 'Sin activar'}
          </p>
          <p className="muted">
            {!supported
              ? 'En el navegador no se pueden leer notificaciones. Puedes probar el lector pegando un mensaje.'
              : enabled
                ? 'Los gastos que detecte aparecerán en "Por categorizar".'
                : 'Dale acceso a las notificaciones para que Mi Plata detecte tus compras.'}
          </p>
        </div>
      </section>

      {supported && (
        <div className="stack">
          <Button size="lg" block icon="bell" onClick={() => void openSettings()}>
            {enabled ? 'Abrir ajustes de acceso' : 'Dar acceso a notificaciones'}
          </Button>
          {enabled && (
            <Button variant="secondary" block icon="refresh" onClick={() => void syncNow()}>
              Buscar gastos nuevos
            </Button>
          )}
        </div>
      )}

      <section className="section">
        <h2 className="section__title">Cómo activarla</h2>
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
