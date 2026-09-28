import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { errorMessage } from '@/lib/errors';
import { enableReminders } from '@/services/reminderSync';
import { useReminderStatus } from './useReminderStatus';

/** Invitación a activar los avisos de pago. Solo aparece en el teléfono y mientras estén apagados. */
export function ReminderPrompt() {
  const toast = useToast();
  const { supported, active, permission, refresh, settings } = useReminderStatus();
  if (!supported || !settings || active) return null;

  const enable = async () => {
    try {
      const result = await enableReminders();
      await refresh();
      if (result.ok) toast.show('Avisos de pago activados');
      else toast.show('Activa el permiso de notificaciones en los ajustes del teléfono para recibir los avisos.', 'error');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <section className="rm-prompt" aria-label="Avisos de pago">
      <span className="rm-prompt__icon" aria-hidden="true">
        <Icon name="bell" size={22} />
      </span>
      <div>
        <strong>No te olvides de pagar a tiempo</strong>
        <p>{permission === 'denied' ? 'El permiso de notificaciones está bloqueado en el teléfono.' : 'Te avisamos un día antes y el mismo día de cada vencimiento.'}</p>
      </div>
      <Button size="md" icon="bell" onClick={() => void enable()}>
        Activar avisos
      </Button>
    </section>
  );
}
