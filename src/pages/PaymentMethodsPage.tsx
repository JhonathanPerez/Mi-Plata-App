import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { IconPicker } from '@/components/ui/IconPicker';
import { ItemPreview } from '@/components/ui/ItemPreview';
import { ManagedListSkeleton } from '@/components/ui/ManagedListSkeleton';
import { ManagedRow } from '@/components/ui/ManagedRow';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { PickerField } from '@/components/ui/PickerField';
import { Sheet } from '@/components/ui/Sheet';
import { Toggle } from '@/components/ui/Toggle';
import {
  CATEGORY_COLORS,
  NAME_MAX_LENGTH,
  PAYMENT_ICONS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  VISIBLE_TOGGLE_HINT,
  VISIBLE_TOGGLE_LABEL,
} from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { describeCut, describeDue } from '@/lib/cycles';
import { errorMessage, ValidationError } from '@/lib/errors';
import { defaultIconForType, describePaymentMethod, methodKindLabel } from '@/lib/payment';
import { pluralize } from '@/lib/text';
import { paymentMethodService } from '@/services/paymentMethodService';
import type { PaymentMethodInput, PaymentMethodWithCount } from '@/types/models';

const NEW_DRAFT: PaymentMethodInput = {
  name: '',
  type: 'credit_card',
  icon: '💳',
  color: CATEGORY_COLORS[5],
  last4: null,
  isActive: true,
};

export function PaymentMethodsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: methods, loading, error, retry } = useQuery(() => paymentMethodService.listWithCounts());
  const navigate = useNavigate();
  const [editing, setEditing] = useState<PaymentMethodWithCount | 'new' | null>(null);
  const [draft, setDraft] = useState<PaymentMethodInput>(NEW_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing === 'new') setDraft(NEW_DRAFT);
    else if (editing) {
      setDraft({
        name: editing.name,
        type: editing.type,
        icon: editing.icon,
        color: editing.color,
        last4: editing.last4,
        isActive: editing.isActive,
      });
    }
    setErrors({});
  }, [editing]);

  const close = () => setEditing(null);
  const isCard = draft.type === 'credit_card' || draft.type === 'debit_card';

  // Al cambiar el tipo, el icono acompaña mientras la persona no haya escogido uno propio; sin tarjeta no hay últimos 4 dígitos.
  const changeType = (type: PaymentMethodInput['type']) =>
    setDraft((prev) => ({
      ...prev,
      type,
      icon: prev.icon === defaultIconForType(prev.type) ? defaultIconForType(type) : prev.icon,
      last4: type === 'credit_card' || type === 'debit_card' ? prev.last4 : null,
    }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (editing === 'new') await paymentMethodService.create(draft);
      else if (editing) await paymentMethodService.update(editing.id, draft);
      toast.show(editing === 'new' ? 'Método de pago creado' : 'Método de pago actualizado');
      close();
    } catch (error) {
      if (error instanceof ValidationError && error.field) setErrors({ [error.field]: error.message });
      else toast.show(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    const ok = await confirm({
      title: `¿Eliminar «${editing.name}»?`,
      message: 'El método de pago se eliminará definitivamente.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await paymentMethodService.remove(editing.id);
      toast.show('Método de pago eliminado');
      close();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const current = editing && editing !== 'new' ? editing : null;

  return (
    <div className="page">
      <PageHeader title="Métodos de pago" back />

      <Button icon="plus" block onClick={() => setEditing('new')}>
        Nueva tarjeta o método
      </Button>

      {error && !methods ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus métodos de pago. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !methods ? (
        <ManagedListSkeleton label="Cargando métodos de pago" />
      ) : (methods ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            icon="card"
            title="Aún no hay métodos de pago"
            description="Toca «Nueva tarjeta o método» para agregar efectivo o una tarjeta."
          />
        </div>
      ) : (
        <div className="card card--flush list-gap">
          {(methods ?? []).map((method) => (
            <ManagedRow
              key={method.id}
              emoji={method.icon}
              color={method.color}
              name={method.name}
              suffix={method.last4 && <span className="muted"> · •••• {method.last4}</span>}
              kind={methodKindLabel(method.name, method.type)}
              expenseCount={method.expenseCount}
              hidden={!method.isActive}
              onEdit={() => setEditing(method)}
            />
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nuevo método de pago' : 'Editar método de pago'}
        actions={{
          primary: { label: 'Guardar', loading: saving, onClick: save },
          secondary: current
            ? { label: 'Eliminar método', variant: 'danger', icon: 'trash', onClick: remove, disabled: current.expenseCount > 0 }
            : undefined,
        }}
      >
        <div className="form">
          <ItemPreview
            emoji={draft.icon}
            color={draft.color}
            name={draft.name}
            placeholder="Nombre del método"
            detail={describePaymentMethod(draft.type, isCard ? draft.last4 : null)}
          />

          <Field label="Nombre" htmlFor="pm-name" error={errors.name}>
            <input
              id="pm-name"
              className="input"
              type="text"
              maxLength={NAME_MAX_LENGTH}
              placeholder="Ej.: Bancolombia Visa"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>

          <fieldset className="fieldset">
            <legend className="field__label">Tipo</legend>
            <div className="chip-row" role="radiogroup" aria-label="Tipo de método de pago">
              {PAYMENT_TYPES.map((type) => (
                <Chip key={type} role="radio" selected={draft.type === type} onClick={() => changeType(type)}>
                  {PAYMENT_TYPE_LABELS[type]}
                </Chip>
              ))}
            </div>
          </fieldset>

          {isCard && (
            <Field label="Últimos 4 dígitos (opcional)" htmlFor="pm-last4" error={errors.last4} hint="Nunca guardamos el número completo de la tarjeta.">
              <input
                id="pm-last4"
                className="input"
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={draft.last4 ?? ''}
                onChange={(event) => setDraft({ ...draft, last4: event.target.value.replace(/\D/g, '').slice(0, 4) || null })}
              />
            </Field>
          )}

          {current && current.type === 'credit_card' && (
            <PickerField
              label="Reglas de corte y pago"
              popup={false}
              selected={{
                name: current.cycle ? describeCut(current.cycle) : 'Sin configurar',
                description: current.cycle ? `Pago: ${describeDue(current.cycle).toLowerCase()}` : 'Toca para elegir el corte y el pago',
              }}
              hint="Con estas fechas se arman los extractos y se sabe cuándo vence cada pago."
              onOpen={() => {
                const target = current.id;
                close();
                navigate(`/tarjetas/${target}/fechas`);
              }}
            />
          )}

          <Field label="Icono" error={errors.icon}>
            <IconPicker label="Icono del método de pago" icons={PAYMENT_ICONS} value={draft.icon} onChange={(icon) => setDraft({ ...draft, icon })} allowCustom />
          </Field>
          <Field label="Color">
            <ColorPicker label="Color del método de pago" colors={CATEGORY_COLORS} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </Field>
          <Toggle
            label={VISIBLE_TOGGLE_LABEL}
            hint={VISIBLE_TOGGLE_HINT}
            checked={draft.isActive}
            onChange={(isActive) => setDraft({ ...draft, isActive })}
          />
          {current && current.expenseCount > 0 && (
            <Notice>
              Tiene {current.expenseCount} {pluralize(current.expenseCount, 'gasto', 'gastos')}, por eso no se puede eliminar. Si ya no lo usas, apaga «{VISIBLE_TOGGLE_LABEL}».
            </Notice>
          )}
        </div>
      </Sheet>
    </div>
  );
}
