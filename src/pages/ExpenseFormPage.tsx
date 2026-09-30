import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { haptics } from '@/lib/haptics';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { OptionSheet, type PickerOption } from '@/components/expenses/OptionSheet';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PickerField } from '@/components/ui/PickerField';
import { Segmented } from '@/components/ui/Segmented';
import { NOTE_MAX_LENGTH } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { addDays, formatLongDate, todayIso } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { describePaymentMethod } from '@/lib/payment';
import { captureService, suggestPaymentMethodId } from '@/services/captureService';
import { categoryService } from '@/services/categoryService';
import { expenseService, validateExpenseInput, type ExpenseFieldErrors } from '@/services/expenseService';
import { paymentMethodService } from '@/services/paymentMethodService';
import { settingsService } from '@/services/settingsService';
import type { ExpenseInput } from '@/types/models';

/** Explica qué significa el estado elegido, según el método de pago. */
function statusHint(paid: boolean, methodType: string | null, methodName: string | undefined): string {
  if (methodType === 'credit_card') {
    return paid
      ? 'Ya se lo pagaste al banco: no aparecerá en «Pagar tarjeta».'
      : `Con tarjeta de crédito queda por pagar hasta que le pagues el extracto a ${methodName ?? 'tu banco'}.`;
  }
  return paid
    ? 'Con este método se marca como pagado. Puedes cambiarlo si fue fiado.'
    : 'Queda pendiente hasta que lo marques como pagado.';
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
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rellena el formulario una sola vez cuando llegan los datos.
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    if (data.existing) {
      setAmount(data.existing.amount);
      setCategoryId(data.existing.categoryId);
      setMethodId(data.existing.paymentMethodId);
      setDate(data.existing.date);
      setNote(data.existing.note ?? '');
      setPaid(data.existing.paidAt !== null);
      statusTouched.current = true; // al editar se respeta el estado que ya tenía
    } else {
      const active = data.methods.filter((m) => m.isActive);
      const last = active.find((m) => m.id === data.lastMethodId);
      const fallback = (last ?? active[0])?.id ?? null;
      if (data.pending) {
        const pending = data.pending;
        const when = new Date(pending.occurredAt);
        setAmount(pending.amount);
        setNote(pending.merchant ?? '');
        setDate(todayIso(when));
        // La categoría se deja vacía a propósito: es lo que falta por decidir.
        setMethodId(suggestPaymentMethodId(data.methods, pending) ?? fallback);
      } else {
        setMethodId(fallback);
      }
    }
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

  const today = todayIso();
  const yesterday = addDays(today, -1);

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
    const found = validateExpenseInput(input);
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
        // Editar o categorizar un pendiente regresa a la pantalla anterior (la bandeja, para seguir con el siguiente).
        if (isEdit || pendingId) navigate(-1);
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

          <Field label="Descripción (opcional)" htmlFor="expense-note" error={errors.note}>
            <input
              id="expense-note"
              className="input"
              type="text"
              placeholder="¿En qué gastaste? Ej.: Almuerzo con el equipo"
              maxLength={NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <fieldset className="fieldset">
            <legend className="field__label">Fecha</legend>
            <div className="chip-row">
              <Chip selected={date === today} onClick={() => setDate(today)}>
                Hoy
              </Chip>
              <Chip selected={date === yesterday} onClick={() => setDate(yesterday)}>
                Ayer
              </Chip>
              <input
                className="input input--date"
                type="date"
                aria-label="Elegir otra fecha"
                value={date}
                max="2100-12-31"
                min="2000-01-01"
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <p className="field__hint">{errors.date ?? formatLongDate(date)}</p>
          </fieldset>

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
            <p className={cx('payment-hint', !paid && 'payment-hint--due')}>
              <Icon name={paid ? 'check' : 'info'} size={16} />
              <span>{statusHint(paid, methodType, selectedMethod?.name)}</span>
            </p>
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
