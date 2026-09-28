import { useEffect, useState } from 'react';
import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Sheet } from '@/components/ui/Sheet';
import { formatMonthTitle } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { budgetService } from '@/services/budgetService';
import type { YearMonth } from '@/types/models';

interface BudgetSheetProps {
  open: boolean;
  onClose: () => void;
  yearMonth: YearMonth;
  currentAmount: number;
}

export function BudgetSheet({ open, onClose, yearMonth, currentAmount }: BudgetSheetProps) {
  const toast = useToast();
  const [amount, setAmount] = useState(currentAmount);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAmount(currentAmount);
  }, [open, currentAmount]);

  const save = async (value: number, message: string) => {
    setSaving(true);
    try {
      await budgetService.setBudget(yearMonth, value);
      toast.show(message);
      onClose();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Presupuesto mensual"
      footer={
        <>
          <Button
            size="lg"
            block
            loading={saving}
            disabled={amount <= 0}
            onClick={() => save(amount, 'Presupuesto guardado')}
          >
            Guardar presupuesto
          </Button>
          {currentAmount > 0 && (
            <Button variant="ghost" block disabled={saving} onClick={() => save(0, 'Presupuesto eliminado')}>
              Quitar presupuesto
            </Button>
          )}
        </>
      }
    >
      <MoneyInput id="budget-amount" label={`Presupuesto para ${formatMonthTitle(yearMonth)}`} value={amount} onChange={setAmount} size="hero" autoFocus />
      <p className="field__hint">Se aplica a este mes y a los siguientes hasta que lo cambies.</p>
    </Sheet>
  );
}
