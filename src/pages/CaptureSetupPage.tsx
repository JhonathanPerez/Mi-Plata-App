import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { CaptureAppsSheet } from '@/components/capture/CaptureAppsSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CaptureAppChoice } from '@/config/capture';
import { useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/lib/errors';
import { captureBridge } from '@/lib/notificationCapture';
import { REPORT_THRESHOLD } from '@/lib/spamLearning';
import { learnedSpamRepository } from '@/repositories/learnedSpamRepository';
import { captureAppsService } from '@/services/captureAppsService';
import { syncCapturedNotifications } from '@/services/captureSync';
import { spamLearningService } from '@/services/spamLearningService';

/** Guía para activar la lectura de notificaciones y SMS del banco (permiso "Acceso a notificaciones"). */
export function CaptureSetupPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const supported = captureBridge.isSupported();
  const { data: learnedCount } = useQuery(() => learnedSpamRepository.count());
  const learnedLabel = useMemo(() => {
    if (!learnedCount) return 'Ninguna todavía';
    return `${learnedCount} ${learnedCount === 1 ? 'frase aprendida' : 'frases aprendidas'}`;
  }, [learnedCount]);

  const forgetLearned = async () => {
    const ok = await confirm({
      title: '¿Olvidar lo aprendido?',
      message: 'Se borran las frases que la app aprendió de tus reportes de publicidad. Puedes volver a reportarlas cuando quieras.',
      confirmLabel: 'Olvidar',
      danger: true,
    });
    if (!ok) return;
    try {
      await spamLearningService.forgetAll();
      toast.show('Aprendizaje borrado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [apps, setApps] = useState<CaptureAppChoice[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEnabled(await captureBridge.isEnabled());
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void captureAppsService.getSelected().then(setApps);
  }, []);

  // Al volver de los ajustes de Android se vuelve a comprobar si ya se concedió el acceso.
  useEffect(() => {
    if (!supported) return undefined;
    void refresh();
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [supported, refresh]);

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

  const saveApps = async (next: CaptureAppChoice[]) => {
    setApps(next);
    try {
      await captureAppsService.setSelected(next);
      toast.show('Apps vigiladas actualizadas', 'success');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Captura automática" back />

      <section className="card capture-status" aria-live="polite">
        <span className={`capture-status__dot${enabled ? ' is-on' : ''}`} aria-hidden="true" />
        <div>
          <p className="capture-status__title">
            {!supported ? 'Solo disponible en el teléfono' : enabled === null ? 'Comprobando…' : enabled ? 'Activa' : 'Desactivada'}
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

      <section className="section">
        <h2 className="section__title">Qué se lee</h2>
        <div className="card about">
          <p className="about__line">
            <Icon name="shield" size={18} />
            <span>Solo las notificaciones de las apps que elijas. Las de cualquier otra se ignoran al instante y no se guardan:</span>
          </p>
          <ul className="sources">
            {apps.length === 0 ? (
              <li>Ninguna todavía</li>
            ) : (
              apps.map((app) => <li key={app.pkg}>{app.label}</li>)
            )}
          </ul>
          {supported && (
            <Button variant="secondary" icon="apps" onClick={() => setPickerOpen(true)}>
              Elegir apps
            </Button>
          )}
          <p className="about__line">
            <Icon name="info" size={18} />
            <span>De esas apps solo se toman las que traen un monto en pesos. El resto (chats personales, códigos) nunca sale del lector.</span>
          </p>
          <p className="about__line">
            <Icon name="lock" size={18} />
            <span>Todo queda en este teléfono. La app no envía nada a Internet.</span>
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Publicidad reportada</h2>
        <div className="card about">
          <p className="about__line">
            <Icon name="flag" size={18} />
            <span>
              En <em>Gastos por categorizar</em>, mantén presionado un mensaje para reportarlo como publicidad.
              Cuando un mismo tipo de mensaje se reporta {REPORT_THRESHOLD} veces o más, deja de aparecer.
            </span>
          </p>
          <p className="about__line">
            <Icon name="info" size={18} />
            <span>
              No se guarda el mensaje completo: solo fragmentos cortos de texto que se repiten entre lo que
              reportas (nunca el valor ni el comercio). {learnedLabel}.
            </span>
          </p>
          {(learnedCount ?? 0) > 0 && (
            <Button variant="secondary" icon="trash" onClick={() => void forgetLearned()}>
              Olvidar lo aprendido
            </Button>
          )}
        </div>
      </section>

      <CaptureAppsSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={apps}
        onSaved={(next) => void saveApps(next)}
      />
    </div>
  );
}

