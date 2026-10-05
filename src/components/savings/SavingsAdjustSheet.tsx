import { useEffect, useState } from 'react';
import { useToast } from '@/app/providers/ToastProvider';
import { Amount } from '@/components/ui/Money';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage, ValidationError } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { adjustmentFor } from '@/lib/savings';
import { savingsService } from '@/services/savingsService';
import type { SavingsAccount } from '@/types/models';

interface SavingsAdjustSheetProps {
  open: boolean;
  account: SavingsAccount;
  /** Saldo que lleva la app. */
  balance: number;
  onClose: () => void;
}

/**
 * «Ajustar saldo»: se escribe lo que dice el banco y la app crea el ingreso o el retiro que falta, para que su saldo coincida.
 * Es el remedio cuando algo se movió en el banco sin pasar por la app (un sueldo, un interés, un débito automático).
 */
export function SavingsAdjustSheet({ open, account, balance, onClose }: SavingsAdjustSheetProps) {
  const toast = useToast();
  const [bankBalance, setBankBalance] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankBalance(balance);
    setError(undefined);
  }, [open, balance]);

  const adjustment = adjustmentFor(balance, bankBalance);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await savingsService.adjustBalance(account.id, bankBalance);
      void haptics.success();
      toast.show('Saldo ajustado');
      onClose();
    } catch (failure) {
      if (failure instanceof ValidationError) setError(failure.message);
      else toast.show(errorMessage(failure), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Ajustar saldo · ${account.name}`} actions={{ primary: { label: 'Ajustar saldo', icon: 'check', loading: saving, onClick: save } }}>
      <div className="form">
        <MoneyInput id="adjust-balance" label="Saldo que ves en el banco" value={bankBalance} onChange={setBankBalance} error={error} autoFocus size="hero" />
        <Notice>
          En la app tiene <Amount value={balance} />.{' '}
          {adjustment ? (
            <>
              Se registrará {adjustment.kind === 'deposit' ? 'un ingreso' : 'un retiro'} de <Amount value={adjustment.amount} /> como «Ajuste de saldo».
            </>
          ) : (
            'Ya coincide con el banco.'
          )}
        </Notice>
      </div>
    </Sheet>
  );
}
