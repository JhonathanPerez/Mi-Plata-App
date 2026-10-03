import { useEffect, useState } from 'react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { IconPicker } from '@/components/ui/IconPicker';
import { ManagedListSkeleton } from '@/components/ui/ManagedListSkeleton';
import { ManagedRow } from '@/components/ui/ManagedRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Toggle } from '@/components/ui/Toggle';
import { CATEGORY_COLORS, CATEGORY_ICONS, NAME_MAX_LENGTH, VISIBLE_TOGGLE_HINT, VISIBLE_TOGGLE_LABEL } from '@/config/constants';
import { useQuery } from '@/hooks/useQuery';
import { errorMessage, ValidationError } from '@/lib/errors';
import { pluralize } from '@/lib/text';
import { categoryService } from '@/services/categoryService';
import type { CategoryWithCount } from '@/types/models';

interface Draft {
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
}

const NEW_DRAFT: Draft = { name: '', icon: CATEGORY_ICONS[0], color: CATEGORY_COLORS[0], isActive: true };

export function CategoriesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: categories, loading, error, retry } = useQuery(() => categoryService.listWithCounts());
  const [editing, setEditing] = useState<CategoryWithCount | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [nameError, setNameError] = useState('');
  const [iconError, setIconError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing === 'new') setDraft(NEW_DRAFT);
    else if (editing) setDraft({ name: editing.name, icon: editing.icon, color: editing.color, isActive: editing.isActive });
    setNameError('');
    setIconError('');
  }, [editing]);

  const close = () => setEditing(null);

  const save = async () => {
    setSaving(true);
    setNameError('');
    setIconError('');
    try {
      if (editing === 'new') await categoryService.create(draft);
      else if (editing) await categoryService.update(editing.id, draft);
      toast.show(editing === 'new' ? 'Categoría creada' : 'Categoría actualizada');
      close();
    } catch (error) {
      if (error instanceof ValidationError && error.field === 'name') setNameError(error.message);
      else if (error instanceof ValidationError && error.field === 'icon') setIconError(error.message);
      else toast.show(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    const ok = await confirm({
      title: `¿Eliminar «${editing.name}»?`,
      message: 'La categoría se eliminará definitivamente.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await categoryService.remove(editing.id);
      toast.show('Categoría eliminada');
      close();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const current = editing && editing !== 'new' ? editing : null;

  return (
    <div className="page">
      <PageHeader title="Categorías" back />

      <Button icon="plus" block onClick={() => setEditing('new')}>
        Nueva categoría
      </Button>

      {error && !categories ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus categorías. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !categories ? (
        <ManagedListSkeleton label="Cargando categorías" />
      ) : (categories ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            icon="tag"
            title="Aún no hay categorías"
            description="Toca «Nueva categoría» para crear la primera y empezar a registrar gastos."
          />
        </div>
      ) : (
        <div className="card card--flush list-gap">
          {(categories ?? []).map((category) => (
            <ManagedRow
              key={category.id}
              emoji={category.icon}
              color={category.color}
              name={category.name}
              expenseCount={category.expenseCount}
              hidden={!category.isActive}
              onEdit={() => setEditing(category)}
            />
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}
        actions={{
          primary: { label: 'Guardar', loading: saving, onClick: save },
          secondary: current
            ? { label: 'Eliminar categoría', variant: 'danger', icon: 'trash', onClick: remove, disabled: current.expenseCount > 0 }
            : undefined,
        }}
      >
        <div className="form">
          <Field label="Nombre" htmlFor="category-name" error={nameError}>
            <input
              id="category-name"
              className="input"
              type="text"
              maxLength={NAME_MAX_LENGTH}
              placeholder="Ej.: Mascotas"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field label="Icono" error={iconError}>
            <IconPicker label="Icono de la categoría" icons={CATEGORY_ICONS} value={draft.icon} onChange={(icon) => setDraft({ ...draft, icon })} allowCustom />
          </Field>
          <Field label="Color">
            <ColorPicker label="Color de la categoría" colors={CATEGORY_COLORS} value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </Field>
          <Toggle
            label={VISIBLE_TOGGLE_LABEL}
            hint={VISIBLE_TOGGLE_HINT}
            checked={draft.isActive}
            onChange={(isActive) => setDraft({ ...draft, isActive })}
          />
          {current && current.expenseCount > 0 && (
            <p className="field__hint">
              Tiene {current.expenseCount} {pluralize(current.expenseCount, 'gasto', 'gastos')}, por eso no se puede eliminar. Puedes ocultarla.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
