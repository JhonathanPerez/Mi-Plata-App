import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
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
    <Notice
      tone="info"
      icon="bell"
      aria-label="Avisos de pago"
      title="No te olvides de pagar a tiempo"
      action={
        <Button size="md" icon="bell" onClick={() => void enable()}>
          Activar avisos
        </Button>
      }
    >
      {permission === 'denied' ? 'El permiso de notificaciones está bloqueado en el teléfono.' : 'Te avisamos un día antes y el mismo día de cada vencimiento.'}
    </Notice>
  );
}
