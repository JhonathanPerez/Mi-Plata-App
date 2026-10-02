import { PendingReminderCard } from '@/components/cards/PendingReminderCard';
import { PageHeader } from '@/components/ui/PageHeader';

/** Ajustes › Recordatorio de pendientes: cada cuánto avisa el teléfono de los gastos capturados que siguen sin categoría. */
export function PendingRemindersPage() {
  return (
    <div className="page">
      <PageHeader title="Recordatorio de pendientes" back />
      <PendingReminderCard />
    </div>
  );
}
