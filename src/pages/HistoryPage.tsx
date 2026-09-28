import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { EMPTY_FILTERS, FilterSheet, type HistoryFilters } from '@/components/expenses/FilterSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Segmented } from '@/components/ui/Segmented';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useDebounced } from '@/hooks/useDebounced';
import { useQuery } from '@/hooks/useQuery';
import { currentYearMonth, formatNumericDate, monthRange } from '@/lib/dates';
import { pluralize } from '@/lib/text';
import { categoryService } from '@/services/categoryService';
import { expenseService } from '@/services/expenseService';
import { paymentMethodService } from '@/services/paymentMethodService';
import type { ExpenseFilters, ExpenseWithRefs } from '@/types/models';

type StatusView = 'all' | 'due' | 'paid';

export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<StatusView>(useSearchParams()[0].get('estado') === 'por-pagar' ? 'due' : 'all');
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [filters, setFilters] = useState<HistoryFilters>({ mode: 'month', from: '', to: '', ...EMPTY_FILTERS });
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const refs = useQuery(async () => ({
    categories: await categoryService.list(true),
    methods: await paymentMethodService.list(true),
  }));

  const sqlFilters = useMemo<ExpenseFilters>(() => {
    const result: ExpenseFilters = {};
    if (status !== 'all') result.status = status;
    // "Por pagar" muestra TODO lo pendiente, de cualquier mes: una deuda de agosto sigue pendiente en septiembre.
    if (status === 'due') {
      // sin límite de fechas
    } else if (filters.mode === 'month') {
      const range = monthRange(yearMonth);
      result.from = range.from;
      result.to = range.to;
    } else if (filters.mode === 'range') {
      if (filters.from) result.from = filters.from;
      if (filters.to) result.to = filters.to;
    }
    if (filters.categoryIds.length > 0) result.categoryIds = filters.categoryIds;
    if (filters.methodIds.length > 0) result.paymentMethodIds = filters.methodIds;
    if (filters.min > 0) result.minAmount = filters.min;
    if (filters.max > 0) result.maxAmount = filters.max;
    if (debouncedSearch.trim()) result.search = debouncedSearch;
    return result;
  }, [filters, yearMonth, debouncedSearch, status]);

  const { data: expenses, loading } = useQuery(() => expenseService.list(sqlFilters), [JSON.stringify(sqlFilters)]);

  const activeCount =
    (filters.mode === 'month' ? 0 : 1) +
    (filters.categoryIds.length > 0 ? 1 : 0) +
    (filters.methodIds.length > 0 ? 1 : 0) +
    (filters.min > 0 || filters.max > 0 ? 1 : 0);

  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const count = expenses?.length ?? 0;

  const periodText =
    status === 'due'
      ? 'Todos los meses'
      : filters.mode === 'range'
      ? `${filters.from ? formatNumericDate(filters.from) : 'inicio'} al ${filters.to ? formatNumericDate(filters.to) : 'hoy'}`
      : filters.mode === 'all'
        ? 'Todo el historial'
        : null;

  const togglePaid = async (expense: ExpenseWithRefs) => {
    const nowPaid = expense.paidAt === null;
    try {
      await expenseService.setPaid(expense.id, nowPaid);
      void haptics.success();
      toast.show(nowPaid ? 'Marcado como pagado' : 'Marcado como por pagar');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const removeExpense = async (expense: ExpenseWithRefs) => {
    const ok = await confirm({
      title: '¿Eliminar este gasto?',
      message: 'Se quitará de tu historial y de tus estadísticas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await expenseService.remove(expense.id);
      void haptics.success();
      toast.show('Gasto eliminado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const clearAll = () => {
    setFilters({ mode: 'month', from: '', to: '', ...EMPTY_FILTERS });
    setSearch('');
  };

  return (
    <div className="page">
      <PageHeader title="Gastos" actions={<PrivacyToggle />} />

      <div className="search">
        <Icon name="search" size={20} />
        <input
          className="search__input"
          type="search"
          placeholder="Buscar gastos"
          aria-label="Buscar gastos"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="toolbar">
        {filters.mode === 'month' && status !== 'due' ? (
          <MonthNavigator value={yearMonth} onChange={setYearMonth} />
        ) : (
          <p className="toolbar__period">{periodText}</p>
        )}
        <Button variant="secondary" icon="filter" onClick={() => setSheetOpen(true)}>
          Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </div>

      <Segmented<StatusView>
        label="Estado de los gastos"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'due', label: 'Por pagar' },
          { value: 'paid', label: 'Pagados' },
        ]}
      />

      <p className="summary-line" aria-live="polite">
        {status === 'due' ? (
          <>
            {count} por pagar · <strong><Amount value={total} /></strong>
          </>
        ) : (
          <>
            {count} {pluralize(count, 'gasto', 'gastos')} · <strong><Amount value={total} /></strong>
          </>
        )}
      </p>

      {loading && !expenses ? (
        <p className="muted">Cargando…</p>
      ) : count === 0 ? (
        <div className="card">
          <EmptyState
            emoji="🔎"
            title={status === 'due' ? 'Nada por pagar' : activeCount > 0 || search ? 'Sin resultados' : 'No hay gastos en este periodo'}
            description={
              status === 'due'
                ? 'Los gastos con tarjeta de crédito quedan aquí hasta que le pagues el extracto al banco.'
                : activeCount > 0 || search
                  ? 'Prueba cambiando o limpiando los filtros.'
                  : 'Cuando registres gastos aparecerán aquí.'
            }
            action={
              activeCount > 0 || search ? (
                <Button variant="secondary" onClick={clearAll}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button icon="plus" onClick={() => navigate('/gasto/nuevo')}>
                  Agregar gasto
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ExpenseList
          expenses={expenses ?? []}
          onSelect={(id) => navigate(`/gasto/${id}`)}
          onTogglePaid={togglePaid}
          onDelete={removeExpense}
        />
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={filters}
        onApply={setFilters}
        categories={refs.data?.categories ?? []}
        methods={refs.data?.methods ?? []}
      />
    </div>
  );
}
