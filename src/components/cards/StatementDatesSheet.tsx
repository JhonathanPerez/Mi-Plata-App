import { useEffect, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { DateField } from '@/components/ui/DateField';
import { Notice } from '@/components/ui/Notice';
import { Row } from '@/components/ui/Row';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/errors';
import { Amount } from '@/components/ui/Money';
import { statementDates, type CycleRules } from '@/lib/cycles';
import { formatDayMonth, periodMonthName } from '@/lib/statementText';
import { pluralize } from '@/lib/text';
import { cardService, type CardStatement, type DatesPreview } from '@/services/cardService';

interface StatementDatesSheetProps {
  open: boolean;
  methodId: string;
  rules: CycleRules;
  statement: CardStatement | null;
  onClose: () => void;
  /** Para el acceso «Reglas de corte y pago». */
  onEditRules: () => void;
}

/**
 * Ajusta a mano las fechas de UN extracto (cuando el banco las mueve ese mes) sin tocar la regla de la tarjeta.
 * Antes de guardar se muestra qué gastos cambiarían de extracto.
 */
export function StatementDatesSheet({ open, methodId, rules, statement, onClose, onEditRules }: StatementDatesSheetProps) {
  const toast = useToast();
  const confirm = useConfirm();
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
  const movedCount = preview?.moved.length ?? 0;
  const differsFromRule = cut !== normal.cut || due !== normal.due;
  const count = statement.expenses.length;

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
        // Solo si este mes tiene fechas propias: volver a la regla es un cambio que se guarda al instante.
        secondary: statement.fixed ? { label: 'Volver a las fechas de la regla', icon: 'refresh', disabled: busy, onClick: () => void reset() } : undefined,
      }}
    >
      <div className="stack">
        <div className="date-sheet__summary">
          <span className="date-sheet__kicker">
            {statement.closed ? 'Extracto cerrado' : 'Ciclo abierto'} · {count} {pluralize(count, 'gasto', 'gastos')}
          </span>
          <strong className="date-sheet__amount">
            <Amount value={statement.total} />
          </strong>
        </div>

        <div className="inline inline--start">
          <DateField label="Fecha de corte" value={cut} onChange={setCut} />
          <DateField label="Pagar hasta" value={due} onChange={setDue} />
        </div>
        {differsFromRule && (
          <p className="field__hint">
            Según la regla: corte {formatDayMonth(normal.cut)} · pago {formatDayMonth(normal.due)}
          </p>
        )}

        {preview?.error ? (
          <Notice tone="danger" role="alert">
            {preview.error}
          </Notice>
        ) : (
          preview &&
          changed && (
            <Notice
              tone={movedCount > 0 ? 'warning' : 'info'}
              icon={movedCount > 0 ? 'warning' : 'check'}
              role="status"
              title={
                movedCount > 0 ? (
                  <>
                    {movedCount} {movedCount === 1 ? 'gasto cambia' : 'gastos cambian'} de extracto · <Amount value={movedTotal} />
                  </>
                ) : (
                  'Ningún gasto cambia de extracto'
                )
              }
            >
              El extracto de {monthName} quedaría en <Amount value={preview.totalAfter} />
            </Notice>
          )
        )}

        <Row
          variant="flush"
          className="date-sheet__rules"
          icon="calendar"
          title="Reglas de corte y pago"
          detail="Cambian las fechas de todos los meses"
          chevron="chevronRight"
          onClick={onEditRules}
        />
      </div>
    </Sheet>
  );
}
