import { useEffect, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { LinkButton } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/errors';
import { Amount } from '@/components/ui/Money';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { describeCut, describeDue, statementDates, type CycleRules } from '@/lib/cycles';
import { formatDayMonth, periodMonthName } from '@/lib/statementText';
import { cardService, type CardStatement, type DatesPreview } from '@/services/cardService';

interface StatementDatesSheetProps {
  open: boolean;
  methodId: string;
  rules: CycleRules;
  statement: CardStatement | null;
  onClose: () => void;
  /** Para el atajo "Cambiar la regla de siempre". */
  onEditRules: () => void;
}

/**
 * Ajusta a mano las fechas de UN extracto (cuando el banco las mueve ese mes) sin tocar la regla de la tarjeta.
 * Antes de guardar se muestra qué gastos cambiarían de extracto.
 */
export function StatementDatesSheet({ open, methodId, rules, statement, onClose, onEditRules }: StatementDatesSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { cop } = useAmountFormat();
  const [cut, setCut] = useState('');
  const [due, setDue] = useState('');
  const [preview, setPreview] = useState<DatesPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const period = statement?.period ?? '';
  const normal = period ? statementDates(rules, period) : null;

  useEffect(() => {
    if (open && statement) {
      setCut(statement.cutDate);
      setDue(statement.dueDate);
    }
  }, [open, statement]);

  // Simula el cambio cada vez que se tocan las fechas.
  useEffect(() => {
    if (!open || !period || !cut || !due) return undefined;
    let cancelled = false;
    void cardService.previewStatementDates(methodId, period, cut, due).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, methodId, period, cut, due]);

  if (!statement || !normal) return null;
  const changed = cut !== statement.cutDate || due !== statement.dueDate;
  const monthName = periodMonthName(statement.period);

  const save = async () => {
    setBusy(true);
    try {
      try {
        await cardService.setStatementDates(methodId, period, cut, due);
      } catch (error) {
        const needsConfirm = (error as { field?: string }).field === 'paid';
        if (!needsConfirm) throw error;
        const ok = await confirm({
          title: 'Este extracto ya tiene pagos',
          message: 'Si cambias sus fechas, algunos gastos pueden pasar a otro extracto. ¿Quieres continuar?',
          confirmLabel: 'Cambiar fechas',
        });
        if (!ok) return;
        await cardService.setStatementDates(methodId, period, cut, due, { confirmPaid: true });
      }
      toast.show(`Fechas de ${monthName} actualizadas`);
      onClose();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      try {
        await cardService.resetStatementDates(methodId, period);
      } catch (error) {
        if ((error as { field?: string }).field !== 'paid') throw error;
        const ok = await confirm({
          title: 'Este extracto ya tiene pagos',
          message: 'Al volver a la regla, algunos gastos pueden pasar a otro extracto. ¿Continuar?',
          confirmLabel: 'Volver a la regla',
        });
        if (!ok) return;
        await cardService.resetStatementDates(methodId, period, { confirmPaid: true });
      }
      toast.show('Volvió a las fechas de la regla');
      onClose();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const movedTotal = preview ? preview.moved.reduce((total, m) => total + m.expense.amount, 0) : 0;

  return (
    <Sheet
      open={open}
      title={`Fechas de ${monthName}`}
      onClose={onClose}
      actions={{
        primary: {
          label: 'Guardar fechas',
          icon: 'check',
          loading: busy,
          disabled: !changed || Boolean(preview?.error),
          onClick: () => void save(),
        },
      }}
    >
      <div className="stack">
        <DateField label="Fecha de corte" value={cut} onChange={setCut}>
          <p className="field__hint">Normalmente: {describeCut(rules).toLowerCase()} ({formatDayMonth(normal.cut)})</p>
        </DateField>
        <DateField label="Pagar hasta" value={due} onChange={setDue}>
          <p className="field__hint">Normalmente: {describeDue(rules).toLowerCase()} ({formatDayMonth(normal.due)})</p>
        </DateField>

        {preview?.error ? (
          <p className="field__error" role="alert">
            <Icon name="warning" size={16} />
            <span>{preview.error}</span>
          </p>
        ) : (
          preview &&
          changed && (
            <section className={preview.moved.length > 0 ? 'date-impact' : 'date-impact date-impact--ok'} aria-live="polite">
              <p className="date-impact__head">
                <Icon name={preview.moved.length > 0 ? 'warning' : 'check'} size={18} />
                <span>
                  {preview.moved.length > 0
                    ? `Con este corte, ${preview.moved.length} ${preview.moved.length === 1 ? 'gasto cambia' : 'gastos cambian'} de extracto (${cop(movedTotal)})`
                    : 'Ningún gasto cambia de extracto con este corte'}
                </span>
              </p>
              <div className="date-impact__total">
                <span>El extracto de {monthName} quedaría en</span>
                <strong>
                  <Amount value={preview.totalAfter} />
                </strong>
              </div>
            </section>
          )
        )}

        <div className="stack">
          <LinkButton onClick={onEditRules}>Cambiar la regla de siempre</LinkButton>
          {statement.fixed && (
            <LinkButton onClick={() => void reset()} disabled={busy}>
              Volver a las fechas de la regla
            </LinkButton>
          )}
        </div>
      </div>
    </Sheet>
  );
}
