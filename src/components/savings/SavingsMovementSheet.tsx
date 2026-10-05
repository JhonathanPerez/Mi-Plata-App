import { useEffect, useState } from 'react';
import { useToast } from '@/app/providers/ToastProvider';
import { DateField } from '@/components/ui/DateField';
import { Field } from '@/components/ui/Field';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Amount } from '@/components/ui/Money';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { NOTE_MAX_LENGTH } from '@/config/constants';
import { todayIso } from '@/lib/dates';
import { errorMessage, ValidationError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { MOVEMENT_LABELS, validateMovement } from '@/lib/savings';
import { savingsService } from '@/services/savingsService';
import type { SavingsAccount, SavingsMovementKind } from '@/types/models';

interface SavingsMovementSheetProps {
  open: boolean;
  account: SavingsAccount;
  /** Saldo actual: un retiro no puede superarlo. */
  balance: number;
  kind: SavingsMovementKind;
  onClose: () => void;
}

/** Hoja para meter plata a una cuenta de ahorro o sacarla. Cada uno queda en los movimientos con su fecha y nota. */
export function SavingsMovementSheet({ open, account, balance, kind, onClose }: SavingsMovementSheetProps) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isWithdrawal = kind === 'withdrawal';

  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setDate(todayIso());
    setNote('');
    setErrors({});
  }, [open, kind]);

  const save = async () => {
    const input = { accountId: account.id, kind, amount, date, note: note.trim() ? note.trim() : null };
    const found = validateMovement(input, { maxDate: todayIso() });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await savingsService.addMovement(input);
      void haptics.success();
      toast.show(MOVEMENT_LABELS[kind].saved);
      onClose();
    } catch (error) {
      if (error instanceof ValidationError && error.field) setErrors({ [error.field]: error.message });
      else toast.show(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${MOVEMENT_LABELS[kind].action} · ${account.name}`}
      actions={{ primary: { label: isWithdrawal ? 'Sacar plata' : 'Meter plata', icon: isWithdrawal ? 'minus' : 'plus', loading: saving, onClick: save } }}
    >
      <div className="form">
        <MoneyInput id="movement-amount" label="Valor" value={amount} onChange={setAmount} error={errors.amount} autoFocus size="hero" />
        {isWithdrawal && <Notice>
            Disponible en la cuenta: <Amount value={balance} />
          </Notice>}
        <Field label="Nota (opcional)" htmlFor="movement-note" error={errors.note}>
          <input
            id="movement-note"
            className="input"
            type="text"
            maxLength={NOTE_MAX_LENGTH}
            placeholder={isWithdrawal ? 'Ej.: Para el arriendo' : 'Ej.: Ahorro de la quincena'}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <DateField label="Fecha" quick value={date} onChange={setDate} min="2000-01-01" max={todayIso()} error={errors.date} />
      </div>
    </Sheet>
  );
}
