import { useEffect, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Field } from '@/components/ui/Field';
import { IconPicker } from '@/components/ui/IconPicker';
import { ItemPreview } from '@/components/ui/ItemPreview';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Notice } from '@/components/ui/Notice';
import { Sheet } from '@/components/ui/Sheet';
import { Toggle } from '@/components/ui/Toggle';
import {
  CATEGORY_COLORS,
  DEFAULT_SAVINGS_ICON,
  NAME_MAX_LENGTH,
  SAVINGS_ICONS,
  SAVINGS_VISIBLE_HINT,
  VISIBLE_TOGGLE_LABEL,
} from '@/config/constants';
import { errorMessage, ValidationError } from '@/lib/errors';
import { describeAccount } from '@/lib/savings';
import { formatCOP } from '@/lib/money';
import { pluralize } from '@/lib/text';
import { savingsService } from '@/services/savingsService';
import type { SavingsAccountInput, SavingsAccountWithBalance } from '@/types/models';

const NEW_DRAFT: SavingsAccountInput = { name: '', last4: null, icon: DEFAULT_SAVINGS_ICON, color: CATEGORY_COLORS[3], isActive: true };

interface SavingsAccountSheetProps {
  open: boolean;
  /** `null` = cuenta nueva. */
  account: SavingsAccountWithBalance | null;
  /** Cuántos gastos se pagaron con la cuenta (si son más de cero, no se puede eliminar). */
  expenseCount?: number;
  onClose: () => void;
  /** Se llama después de eliminar la cuenta (la pantalla de detalle vuelve a la lista). */
  onRemoved?: () => void;
}

/** Hoja para crear o editar una cuenta de ahorro. Al crearla se puede indicar con cuánta plata empieza. */
export function SavingsAccountSheet({ open, account, expenseCount = 0, onClose, onRemoved }: SavingsAccountSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<SavingsAccountInput>(NEW_DRAFT);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(account ? { name: account.name, last4: account.last4, icon: account.icon, color: account.color, isActive: account.isActive } : NEW_DRAFT);
    setOpeningBalance(0);
    setErrors({});
  }, [open, account]);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (account) await savingsService.updateAccount(account.id, draft);
      else await savingsService.createAccount(draft, openingBalance);
      toast.show(account ? 'Cuenta actualizada' : 'Cuenta de ahorro creada');
      onClose();
    } catch (error) {
      if (error instanceof ValidationError && error.field) setErrors({ [error.field]: error.message });
      else toast.show(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!account) return;
    const ok = await confirm({
      title: `¿Eliminar «${account.name}»?`,
      message:
        account.balance > 0
          ? `Tiene ${formatCOP(account.balance)} guardados. Se borrarán la cuenta y sus ${account.movementCount} ${pluralize(account.movementCount, 'movimiento', 'movimientos')}. Esta acción no se puede deshacer.`
          : 'Se borrarán la cuenta y sus movimientos. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await savingsService.removeAccount(account.id);
      toast.show('Cuenta eliminada');
      onClose();
      onRemoved?.();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? 'Editar cuenta de ahorro' : 'Nueva cuenta de ahorro'}
      actions={{
        primary: { label: 'Guardar', loading: saving, onClick: save },
        secondary: account ? { label: 'Eliminar cuenta', variant: 'danger', icon: 'trash', onClick: remove, disabled: expenseCount > 0 } : undefined,
      }}
    >
      <div className="form">
        <ItemPreview emoji={draft.icon} color={draft.color} name={draft.name} placeholder="Nombre de la cuenta" detail={describeAccount(draft.last4)} />

        <Field label="Nombre" htmlFor="savings-name" error={errors.name}>
          <input
            id="savings-name"
            className="input"
            type="text"
            maxLength={NAME_MAX_LENGTH}
            placeholder="Ej.: Bancolombia Ahorros, Nequi"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <Field label="Últimos 4 dígitos (opcional)" htmlFor="savings-last4" error={errors.last4} hint="Nunca guardamos el número completo de la cuenta.">
          <input
            id="savings-last4"
            className="input"
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            value={draft.last4 ?? ''}
            onChange={(event) => setDraft({ ...draft, last4: event.target.value.replace(/\D/g, '').slice(0, 4) || null })}
          />
        </Field>

        {!account && (
          <MoneyInput id="savings-opening" label="Saldo de hoy en el banco (opcional)" value={openingBalance} onChange={setOpeningBalance} error={errors.openingBalance} />
        )}

        <Field label="Icono" error={errors.icon}>
          <IconPicker label="Icono de la cuenta" icons={SAVINGS_ICONS} value={draft.icon} onChange={(icon) => setDraft({ ...draft, icon })} allowCustom />
        </Field>
        <Field label="Color">
          <ColorPicker label="Color de la cuenta" colors={CATEGORY_COLORS} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        </Field>
        <Toggle label={VISIBLE_TOGGLE_LABEL} hint={SAVINGS_VISIBLE_HINT} checked={draft.isActive} onChange={(isActive) => setDraft({ ...draft, isActive })} />

        {account && expenseCount > 0 && (
          <Notice>
            Pagó {expenseCount} {pluralize(expenseCount, 'gasto', 'gastos')}, por eso no se puede eliminar. Si ya no la usas, apaga «{VISIBLE_TOGGLE_LABEL}».
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
