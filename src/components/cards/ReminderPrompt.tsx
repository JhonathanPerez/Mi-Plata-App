import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PromptCard } from '@/components/ui/PromptCard';
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

  const blocked = permission === 'denied';

  return (
    <PromptCard
      icon="bell"
      tone={blocked ? 'warning' : 'info'}
      aria-label="Avisos de pago"
      title="Paga a tiempo"
      text={blocked ? 'El permiso de notificaciones está bloqueado en el teléfono.' : 'Te avisamos de cada vencimiento:'}
      action={
        <Button block onClick={() => void enable()}>
          Activar avisos
        </Button>
      }
    >
      {!blocked && (
        <ul className="prompt__tiles" aria-label="Cuándo te avisamos">
          <li className="prompt__tile">
            <Icon name="calendar" size={20} />
            Un día antes
          </li>
          <li className="prompt__tile">
            <Icon name="clockCountdown" size={20} />
            El mismo día
          </li>
        </ul>
      )}
    </PromptCard>
  );
}
