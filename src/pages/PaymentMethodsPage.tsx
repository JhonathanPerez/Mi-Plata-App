import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { IconPicker } from '@/components/ui/IconPicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Toggle } from '@/components/ui/Toggle';
import {
  CATEGORY_COLORS,
  NAME_MAX_LENGTH,
  PAYMENT_ICONS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
} from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { cx } from '@/lib/cx';
import { describeCut, describeDue } from '@/lib/cycles';
import { errorMessage, ValidationError } from '@/lib/errors';
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
  const { data: methods, loading } = useQuery(() => paymentMethodService.listWithCounts());
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

      {loading && !methods ? (
        <p className="muted">Cargando…</p>
      ) : (methods ?? []).length === 0 ? (
        <div className="card">
          <EmptyState emoji="💳" title="No hay métodos de pago" description="Agrega efectivo o una tarjeta para registrar gastos." />
        </div>
      ) : (
        <div className="card card--flush list-gap">
          {(methods ?? []).map((method) => (
            <button key={method.id} type="button" className="row" onClick={() => setEditing(method)}>
              <EmojiTile emoji={method.icon} color={method.color} />
              <span className="row__body">
                <span className="row__title">
                  {method.name}
                  {method.last4 && <span className="muted"> · •••• {method.last4}</span>}
                </span>
                <span className="row__detail">
                  {PAYMENT_TYPE_LABELS[method.type]} · {method.expenseCount} {pluralize(method.expenseCount, 'gasto', 'gastos')}
                  {!method.isActive && ' · Oculto al registrar'}
                </span>
              </span>
              <Icon name="edit" size={20} className="row__chevron" />
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nuevo método de pago' : 'Editar método de pago'}
        footer={
          <>
            <Button size="lg" block loading={saving} onClick={save}>
              Guardar
            </Button>
            {current && (
              <Button variant="danger" block icon="trash" onClick={remove} disabled={current.expenseCount > 0}>
                Eliminar método
              </Button>
            )}
          </>
        }
      >
        <div className="form">
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
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={draft.type === type}
                  className={cx('chip', draft.type === type && 'is-selected')}
                  onClick={() => setDraft({ ...draft, type })}
                >
                  {PAYMENT_TYPE_LABELS[type]}
                </button>
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

          <Field label="Icono" error={errors.icon}>
            <IconPicker label="Icono del método de pago" icons={PAYMENT_ICONS} value={draft.icon} onChange={(icon) => setDraft({ ...draft, icon })} allowCustom />
          </Field>
          <Field label="Color">
            <ColorPicker label="Color del método de pago" colors={CATEGORY_COLORS} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </Field>
          <Toggle
            label="Mostrar al registrar gastos"
            hint="Si lo ocultas, sus gastos siguen en tu historial."
            checked={draft.isActive}
            onChange={(isActive) => setDraft({ ...draft, isActive })}
          />
          {current && current.type === 'credit_card' && (
            <div className="field">
              <span className="field__label">Fechas del ciclo</span>
              <button
                type="button"
                className="picker-link"
                aria-haspopup="dialog"
                onClick={() => {
                  const target = current.id;
                  close();
                  navigate(`/tarjetas/${target}/fechas`);
                }}
              >
                <span className="picker-link__text">
                  <span className="picker-link__name">{current.cycle ? describeCut(current.cycle) : 'Sin configurar'}</span>
                  <span className="picker-link__desc">
                    {current.cycle ? `Pago: ${describeDue(current.cycle).toLowerCase()}` : 'Toca para elegir el corte y el pago'}
                  </span>
                </span>
                <span className="picker-link__action">
                  Cambiar
                  <Icon name="chevronRight" size={16} />
                </span>
              </button>
              <p className="field__hint">Con estas fechas se arman los extractos y se sabe cuándo vence cada pago.</p>
            </div>
          )}
          {current && current.expenseCount > 0 && (
            <p className="field__hint">
              Tiene {current.expenseCount} {pluralize(current.expenseCount, 'gasto', 'gastos')}, por eso no se puede eliminar. Puedes ocultarlo.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
