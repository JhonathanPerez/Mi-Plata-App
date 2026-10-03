import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { CaptureAppsSheet } from '@/components/capture/CaptureAppsSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CaptureAppChoice } from '@/config/capture';
import { useCaptureAccess } from '@/hooks/useCaptureAccess';
import { useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/lib/errors';
import { REPORT_THRESHOLD } from '@/lib/spamLearning';
import { learnedSpamRepository } from '@/repositories/learnedSpamRepository';
import { captureAppsService } from '@/services/captureAppsService';
import { spamLearningService } from '@/services/spamLearningService';

/** Ajustes › Apps que se siguen: de qué apps se leen las compras, qué se toma de ellas y la publicidad reportada. */
export function TrackedAppsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { supported, enabled } = useCaptureAccess();
  const { data: learnedCount } = useQuery(() => learnedSpamRepository.count());
  const [apps, setApps] = useState<CaptureAppChoice[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const learnedLabel = useMemo(() => {
    if (!learnedCount) return 'Ninguna todavía';
    return `${learnedCount} ${learnedCount === 1 ? 'frase aprendida' : 'frases aprendidas'}`;
  }, [learnedCount]);

  useEffect(() => {
    void captureAppsService.getSelected().then(setApps);
  }, []);

  const saveApps = async (next: CaptureAppChoice[]) => {
    setApps(next);
    try {
      await captureAppsService.setSelected(next);
      toast.show('Apps vigiladas actualizadas', 'success');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

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

  return (
    <div className="page">
      <PageHeader title="Apps que se siguen" back />

      {/* Elegir apps sirve de poco sin el permiso: se avisa y se lleva a activarlo. */}
      {supported && enabled === false && (
        <Notice tone="warning" to="/ajustes/captura" title="Falta activar las notificaciones">
          Sin ese permiso no se detecta ninguna compra.
        </Notice>
      )}

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
