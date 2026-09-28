import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Toggle } from '@/components/ui/Toggle';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { HOUR_LABELS, HOUR_OPTIONS, LEAD_DAY_OPTIONS, LEAD_LABELS } from '@/lib/reminders';
import { reminderService } from '@/services/reminderService';
import { disableReminders, enableReminders, sendTestReminder, syncReminders } from '@/services/reminderSync';
import { useReminderStatus } from './useReminderStatus';

/** Ajustes de los avisos del teléfono antes de que venza el pago de una tarjeta. */
export function ReminderSettingsCard() {
  const toast = useToast();
  const { settings, permission, supported, refresh, active } = useReminderStatus();

  const onToggle = async (next: boolean) => {
    if (!supported) {
      toast.show('Los avisos funcionan en la app instalada en el teléfono.', 'info');
      return;
    }
    try {
      if (next) {
        const result = await enableReminders();
        await refresh();
        if (!result.ok) {
          toast.show(
            result.permission === 'denied'
              ? 'El permiso de notificaciones está bloqueado. Actívalo en Ajustes del teléfono ▸ Apps ▸ Mi Plata ▸ Notificaciones.'
              : 'Sin el permiso de notificaciones no se pueden enviar los avisos.',
            'error',
          );
          return;
        }
        toast.show('Avisos de pago activados');
      } else {
        await disableReminders();
        toast.show('Avisos de pago desactivados');
      }
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const toggleLead = async (days: number) => {
    if (!settings) return;
    const current = settings.leadDays;
    const next = current.includes(days) ? current.filter((d) => d !== days) : [...current, days];
    if (next.length === 0) {
      toast.show('Deja al menos un momento para el aviso.', 'info');
      return;
    }
    void haptics.tap();
    await reminderService.setLeadDays(next);
    void syncReminders();
  };

  const setHour = async (value: string) => {
    await reminderService.setHour(Number(value));
    void syncReminders();
  };

  const test = async () => {
    try {
      await sendTestReminder();
      toast.show('Te llegará un aviso de prueba en unos segundos. Puedes salir de la app.', 'info');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const hint = !supported
    ? 'Solo funciona en la app instalada en el teléfono.'
    : permission === 'denied'
      ? 'El permiso de notificaciones está bloqueado. Actívalo en Ajustes del teléfono ▸ Apps ▸ Mi Plata ▸ Notificaciones.'
      : 'El teléfono te avisa antes de que venza el pago de cada tarjeta, aunque la app esté cerrada.';

  return (
    <div className="card stack">
      <Toggle checked={active} onChange={(next) => void onToggle(next)} label="Avisar antes de que venza un pago" hint={hint} />

      {active && settings && (
        <>
          <div className="field">
            <span className="field__label">Avisar</span>
            <div className="chip-row" role="group" aria-label="Cuándo avisar">
              {LEAD_DAY_OPTIONS.map((days) => {
                const on = settings.leadDays.includes(days);
                return (
                  <button key={days} type="button" aria-pressed={on} className={cx('chip', on && 'is-selected')} onClick={() => void toggleLead(days)}>
                    {LEAD_LABELS[days]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <span className="field__label">A las</span>
            <Segmented<string>
              label="Hora del aviso"
              value={String(settings.hour)}
              onChange={(value) => void setHour(value)}
              options={HOUR_OPTIONS.map((hour) => ({ value: String(hour), label: HOUR_LABELS[hour] }))}
            />
          </div>

          <Button variant="secondary" block icon="bell" onClick={() => void test()}>
            Enviar aviso de prueba
          </Button>
          <p className="field__hint rm-note">
            <Icon name="info" size={16} />
            <span>
              Si pagas un extracto, sus avisos se cancelan solos. En Xiaomi, Samsung u Oppo, deja Mi Plata «sin restricciones» en Batería para que los avisos no se
              retrasen.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
