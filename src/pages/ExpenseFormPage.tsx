import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { haptics } from '@/lib/haptics';
import { Button, IconButton } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { OptionSheet, type PickerOption } from '@/components/expenses/OptionSheet';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PickerField } from '@/components/ui/PickerField';
import { Segmented } from '@/components/ui/Segmented';
import { NOTE_MAX_LENGTH } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { pushBackHandler } from '@/lib/backStack';
import { describePaymentMethod, statusHint } from '@/lib/payment';
import { captureService, suggestPaymentMethodId } from '@/services/captureService';
import { categoryService } from '@/services/categoryService';
import { expenseService, validateExpenseInput, type ExpenseFieldErrors } from '@/services/expenseService';
import { paymentMethodService } from '@/services/paymentMethodService';
import { settingsService } from '@/services/settingsService';
import type { ExpenseInput } from '@/types/models';

/** Valores del formulario; el estado inicial sirve para saber si hay cambios sin guardar. */
interface FormValues {
  amount: number;
  categoryId: string | null;
  methodId: string | null;
  date: string;
  note: string;
  paid: boolean;
}

async function loadFormData(id: string | undefined, pendingId: string | null) {
  const [categories, methods, lastMethodId, existing, pending] = await Promise.all([
    categoryService.list(true),
    paymentMethodService.list(true),
    settingsService.getLastPaymentMethodId(),
    id ? expenseService.getById(id) : Promise.resolve(null),
    pendingId ? captureService.getPending(pendingId) : Promise.resolve(null),
  ]);
  return { categories, methods, lastMethodId, existing, pending };
}

export function ExpenseFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  // Si viene de "Por categorizar", el valor, el comercio, la fecha y el método ya llegan rellenos.
  const pendingId = useSearchParams()[0].get('pendiente');
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading } = useQuery(() => loadFormData(id, pendingId), [id, pendingId]);

  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [picker, setPicker] = useState<'category' | 'method' | null>(null);
  const [note, setNote] = useState('');
  // Estado del gasto: true = pagado, false = por pagar.
  const [paid, setPaid] = useState(true);
  // Si el usuario ya tocó el estado, dejamos de sugerirlo según el método de pago.
  const statusTouched = useRef(false);
  const [errors, setErrors] = useState<ExpenseFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  // Cómo quedó el formulario al rellenarse: lo que se compara para avisar antes de descartar.
  const [initial, setInitial] = useState<FormValues | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rellena el formulario una sola vez cuando llegan los datos.
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    const start: FormValues = { amount: 0, categoryId: null, methodId: null, date: todayIso(), note: '', paid: true };
    if (data.existing) {
      start.amount = data.existing.amount;
      start.categoryId = data.existing.categoryId;
      start.methodId = data.existing.paymentMethodId;
      start.date = data.existing.date;
      start.note = data.existing.note ?? '';
      start.paid = data.existing.paidAt !== null;
      statusTouched.current = true; // al editar se respeta el estado que ya tenía
    } else {
      const active = data.methods.filter((m) => m.isActive);
      const last = active.find((m) => m.id === data.lastMethodId);
      const fallback = (last ?? active[0])?.id ?? null;
      start.methodId = fallback;
      if (data.pending) {
        const pending = data.pending;
        start.amount = pending.amount;
        start.note = pending.merchant ?? '';
        start.date = todayIso(new Date(pending.occurredAt));
        // La categoría se deja vacía a propósito: es lo que falta por decidir.
        start.methodId = suggestPaymentMethodId(data.methods, pending) ?? fallback;
      }
    }
    setAmount(start.amount);
    setCategoryId(start.categoryId);
    setMethodId(start.methodId);
    setDate(start.date);
    setNote(start.note);
    setPaid(start.paid);
    setInitial(start);
  }, [data]);

  const methodType = (data?.methods ?? []).find((m) => m.id === methodId)?.type ?? null;
  useEffect(() => {
    if (isEdit || statusTouched.current || !methodType) return;
    setPaid(methodType !== 'credit_card');
  }, [isEdit, methodType]);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const categories = useMemo(
    () => (data?.categories ?? []).filter((c) => c.isActive || c.id === categoryId),
    [data, categoryId],
  );
  const methods = useMemo(
    () => (data?.methods ?? []).filter((m) => m.isActive || m.id === methodId),
    [data, methodId],
  );

  const categoryOptions: PickerOption[] = categories.map((c) => ({ id: c.id, icon: c.icon, color: c.color, name: c.name }));
  const methodOptions: PickerOption[] = methods.map((m) => {
    const description = describePaymentMethod(m.type, m.last4);
    // Si el nombre ya dice lo mismo ("Efectivo"), no se repite en la segunda línea.
    return {
      id: m.id,
      icon: m.icon,
      color: m.color,
      name: m.name,
      description: description.toLowerCase() === m.name.trim().toLowerCase() ? undefined : description,
    };
  });
  const selectedCategory = categoryOptions.find((o) => o.id === categoryId) ?? null;
  const selectedMethod = methodOptions.find((o) => o.id === methodId) ?? null;

  // Cambios sin guardar. El estado «pagado» solo cuenta al editar: en un gasto nuevo se sugiere solo según el método.
  const hasChanges =
    initial !== null &&
    !saved &&
    !saving &&
    (amount !== initial.amount ||
      categoryId !== initial.categoryId ||
      methodId !== initial.methodId ||
      date !== initial.date ||
      note !== initial.note ||
      (isEdit && paid !== initial.paid));

  const requestClose = async () => {
    if (!hasChanges) {
      navigate(-1);
      return;
    }
    const discard = await confirm({
      title: isEdit || pendingId ? '¿Descartar los cambios?' : '¿Descartar este gasto?',
      message: isEdit || pendingId ? 'Los cambios que hiciste no se guardarán.' : 'Lo que ingresaste no se guardará.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Seguir editando',
      danger: true,
    });
    if (discard) navigate(-1);
  };

  // El botón o gesto Atrás de Android pide la misma confirmación que la «X».
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!hasChanges) return undefined;
    return pushBackHandler(() => void requestCloseRef.current());
  }, [hasChanges]);

  if (pendingId && !isEdit && data && !data.pending && !saved && !saving) {
    return (
      <div className="page page--form">
        <PageHeader title="Gasto no disponible" back />
        <p className="muted">Este gasto detectado ya se categorizó o se descartó.</p>
      </div>
    );
  }

  if (isEdit && data && !data.existing && !saved) {
    return (
      <div className="page page--form">
        <PageHeader title="Gasto no encontrado" back />
        <p className="muted">Este gasto ya no existe. Es posible que lo hayas eliminado.</p>
      </div>
    );
  }

  const submit = async () => {
    const input: ExpenseInput = {
      amount,
      categoryId: categoryId ?? '',
      paymentMethodId: methodId ?? '',
      date,
      // La hora ya no se pide. Al editar se conserva la que el gasto ya tuviera para no perder datos.
      time: isEdit ? (data?.existing?.time ?? null) : null,
      note: note.trim() ? note.trim() : null,
      paid,
    };
    const found = validateExpenseInput(input, { requireNote: true });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Lleva la vista al primer error para que se vea sin buscarlo.
      setTimeout(() => document.querySelector('.field__error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
      return;
    }
    setSaving(true);
    try {
      if (isEdit && id) await expenseService.update(id, input);
      else await expenseService.create(input, { fromPendingId: pendingId ?? undefined });
      void haptics.success();
      setSaved(true);
      leaveTimer.current = setTimeout(() => {
        // Se vuelve a donde se estaba (Inicio o Gastos, desde donde se tocó «+»; o la bandeja de pendientes).
        // `key === 'default'` es la primera pantalla de la sesión (enlace directo): no hay a dónde volver, así que va a Inicio.
        if (location.key !== 'default') navigate(-1);
        else navigate('/', { replace: true });
      }, 850);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({
      title: '¿Eliminar este gasto?',
      message: 'Se quitará de tu historial y de tus estadísticas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await expenseService.remove(id);
      toast.show('Gasto eliminado');
      navigate(-1);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <div className="page page--form">
      <PageHeader
        title={isEdit ? 'Editar gasto' : pendingId ? 'Categorizar gasto' : 'Agregar gasto'}
        close
        closeLabel="Cerrar sin guardar"
        onClose={() => void requestClose()}
        actions={isEdit ? <IconButton icon="trash" label="Eliminar gasto" onClick={remove} /> : undefined}
      />

      {loading && !data ? (
        <p className="muted" role="status">
          Cargando…
        </p>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <MoneyInput
            id="expense-amount"
            label="Valor"
            value={amount}
            onChange={setAmount}
            error={errors.amount}
            autoFocus={!isEdit && !pendingId}
            size="hero"
          />

          <Field label="Descripción" htmlFor="expense-note" error={errors.note}>
            <input
              id="expense-note"
              className="input"
              type="text"
              placeholder="¿En qué gastaste? Ej.: Almuerzo con el equipo"
              maxLength={NOTE_MAX_LENGTH}
              aria-required="true"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <DateField label="Fecha" quick value={date} onChange={setDate} min="2000-01-01" max="2100-12-31" error={errors.date} />

          <PickerField
            label="Categoría"
            placeholder="Elegir categoría"
            selected={selectedCategory}
            error={errors.category}
            onOpen={() => setPicker('category')}
          />

          <PickerField
            label="Método de pago"
            placeholder="Elegir método de pago"
            selected={selectedMethod}
            error={errors.method}
            onOpen={() => setPicker('method')}
          />

          <div className="field">
            <span className="field__label">Estado</span>
            <Segmented<string>
              label="Estado del gasto"
              value={paid ? 'paid' : 'due'}
              onChange={(value) => {
                statusTouched.current = true;
                setPaid(value === 'paid');
              }}
              options={[
                { value: 'paid', label: 'Pagado' },
                { value: 'due', label: 'Por pagar' },
              ]}
            />
            <Notice tone={paid ? 'info' : 'warning'} icon={paid ? 'check' : 'info'}>
              {statusHint(paid, methodType)}
            </Notice>
          </div>

          <div className="form__footer">
            <Button type="submit" size="lg" block loading={saving} icon="check">
              {isEdit ? 'Guardar cambios' : 'Guardar gasto'}
            </Button>
          </div>
        </form>
      )}

      <OptionSheet
        open={picker === 'category'}
        title="Categoría"
        options={categoryOptions}
        value={categoryId}
        onSelect={setCategoryId}
        onClose={() => setPicker(null)}
      />
      <OptionSheet
        open={picker === 'method'}
        title="Método de pago"
        options={methodOptions}
        value={methodId}
        onSelect={setMethodId}
        onClose={() => setPicker(null)}
      />

      {saved && (
        <div className="saved" role="status">
          <div className="saved__badge">
            <Icon name="check" size={44} />
          </div>
          <p className="saved__text">{isEdit ? 'Cambios guardados' : 'Gasto guardado'}</p>
        </div>
      )}
    </div>
  );
}
