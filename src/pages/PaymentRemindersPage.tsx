import { ReminderSettingsCard } from '@/components/cards/ReminderSettingsCard';
import { PageHeader } from '@/components/ui/PageHeader';

/** Ajustes › Avisos de pago: cuándo avisa el teléfono antes de que venza el pago de una tarjeta. */
export function PaymentRemindersPage() {
  return (
    <div className="page">
      <PageHeader title="Avisos de pago" back />
      <ReminderSettingsCard />
    </div>
  );
}
