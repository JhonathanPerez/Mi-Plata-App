import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import type { Category, PaymentMethod } from '@/types/models';

export type PeriodMode = 'month' | 'range' | 'all';

export interface HistoryFilters {
  mode: PeriodMode;
  from: string;
  to: string;
  categoryIds: string[];
  methodIds: string[];
  min: number;
  max: number;
}

export const EMPTY_FILTERS: Omit<HistoryFilters, 'mode' | 'from' | 'to'> = {
  categoryIds: [],
  methodIds: [],
  min: 0,
  max: 0,
};

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: HistoryFilters;
  onApply: (value: HistoryFilters) => void;
  categories: Category[];
  methods: PaymentMethod[];
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function FilterSheet({ open, onClose, value, onApply, categories, methods }: FilterSheetProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(value);
      setError('');
    }
  }, [open, value]);

  const apply = () => {
    if (draft.mode === 'range' && draft.from && draft.to && draft.from > draft.to) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    if (draft.min > 0 && draft.max > 0 && draft.min > draft.max) {
      setError('El valor mínimo no puede ser mayor que el máximo.');
      return;
    }
    onApply(draft);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      actions={{
        layout: 'split',
        secondary: { label: 'Limpiar', onClick: () => setDraft({ ...draft, ...EMPTY_FILTERS }) },
        primary: { label: 'Aplicar filtros', onClick: apply },
      }}
    >
      <div className="form">
        <Field label="Periodo">
          <Segmented
            label="Periodo"
            value={draft.mode}
            onChange={(mode) => setDraft({ ...draft, mode })}
            options={[
              { value: 'month', label: 'Mes' },
              { value: 'range', label: 'Fechas' },
              { value: 'all', label: 'Todo' },
            ]}
          />
        </Field>

        {draft.mode === 'range' && (
          <div className="inline">
            <Field label="Desde" htmlFor="filter-from">
              <input id="filter-from" className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </Field>
            <Field label="Hasta" htmlFor="filter-to">
              <input id="filter-to" className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </Field>
          </div>
        )}

        <fieldset className="fieldset">
          <legend className="field__label">Categoría</legend>
          <div className="chip-row">
            {categories.map((category) => {
              const selected = draft.categoryIds.includes(category.id);
              return (
                <Chip key={category.id} selected={selected} onClick={() => setDraft({ ...draft, categoryIds: toggle(draft.categoryIds, category.id) })}>
                  <span aria-hidden="true">{category.icon}</span>
                  {category.name}
                </Chip>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="field__label">Método de pago</legend>
          <div className="chip-row">
            {methods.map((method) => {
              const selected = draft.methodIds.includes(method.id);
              return (
                <Chip key={method.id} selected={selected} onClick={() => setDraft({ ...draft, methodIds: toggle(draft.methodIds, method.id) })}>
                  <span aria-hidden="true">{method.icon}</span>
                  {method.name}
                </Chip>
              );
            })}
          </div>
        </fieldset>

        <div className="inline">
          <MoneyInput id="filter-min" label="Valor mínimo" value={draft.min} onChange={(min) => setDraft({ ...draft, min })} />
          <MoneyInput id="filter-max" label="Valor máximo" value={draft.max} onChange={(max) => setDraft({ ...draft, max })} />
        </div>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
