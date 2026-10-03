import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ExpenseListSkeleton } from '@/components/expenses/ExpenseListSkeleton';
import { EMPTY_FILTERS, FilterSheet, type HistoryFilters } from '@/components/expenses/FilterSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { MonthNavigator } from '@/components/ui/MonthNavigator';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useDebounced } from '@/hooks/useDebounced';
import { useSwipeHint } from '@/hooks/useSwipeHint';
import { useQuery } from '@/hooks/useQuery';
import { clampYearMonth, currentYearMonth, formatNumericDate, monthRange } from '@/lib/dates';
import { parseHistoryParams } from '@/lib/historyLink';
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
  // Otras pantallas pueden abrir Gastos ya filtrado (Por pagar desde Inicio; una categoría y un mes desde Estadísticas). Se lee una sola vez.
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => parseHistoryParams(searchParams));
  const [status, setStatus] = useState<StatusView>(initial.status);
  // Gastos no navega a meses que aún no llegan; un enlace con un mes futuro cae en el actual.
  const maxMonth = currentYearMonth();
  const [yearMonth, setYearMonth] = useState(() => clampYearMonth(initial.yearMonth ?? maxMonth, maxMonth));
  const [filters, setFilters] = useState<HistoryFilters>({
    mode: 'month',
    from: '',
    to: '',
    ...EMPTY_FILTERS,
    categoryIds: initial.categoryId ? [initial.categoryId] : [],
  });
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

  const { data: expenses, loading, error: loadError, retry } = useQuery(() => expenseService.list(sqlFilters), [JSON.stringify(sqlFilters)]);

  const swipeHint = useSwipeHint((expenses?.length ?? 0) > 0);

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
      swipeHint.markLearned();
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
      swipeHint.markLearned();
      void haptics.success();
      toast.show('Gasto eliminado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const hasSearch = search.trim() !== '';

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
        <IconButton
          className="search__filter"
          icon="filter"
          label={activeCount > 0 ? `Filtros, ${activeCount} ${pluralize(activeCount, 'activo', 'activos')}` : 'Filtros'}
          badge={activeCount}
          onClick={() => setSheetOpen(true)}
        />
      </div>

      <div className="toolbar">
        {periodText === null ? <MonthNavigator value={yearMonth} onChange={setYearMonth} max={maxMonth} /> : <p className="period-pill">{periodText}</p>}
        {expenses ? (
          <p className="toolbar__summary" aria-live="polite">
            <span className="toolbar__count">
              {count} {status === 'due' ? 'por pagar' : pluralize(count, 'gasto', 'gastos')}
            </span>
            <strong className="toolbar__total">
              <Amount value={total} />
            </strong>
          </p>
        ) : loading ? (
          <div className="toolbar__summary" aria-hidden="true">
            <Skeleton height={13} width="64px" />
            <Skeleton height={18} width="96px" />
          </div>
        ) : null}
      </div>

      <Segmented<StatusView>
        label="Estado de los gastos"
        tone="primary"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'due', label: 'Por pagar' },
          { value: 'paid', label: 'Pagados' },
        ]}
      />

      {loadError && !expenses ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus gastos. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !expenses ? (
        <ExpenseListSkeleton />
      ) : count === 0 ? (
        <div className="card">
          {activeCount > 0 || hasSearch ? (
            <EmptyState
              icon="search"
              title="Sin resultados"
              description="Prueba cambiando o limpiando los filtros."
              action={
                <Button variant="secondary" onClick={clearAll}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : status === 'due' ? (
            <EmptyState
              icon="check"
              title="Nada por pagar"
              description="Los gastos con tarjeta de crédito quedan aquí hasta que le pagues el extracto al banco."
            />
          ) : status === 'paid' ? (
            <EmptyState icon="check" title="Sin gastos pagados" description="Aquí verás los gastos que ya pagaste en este periodo." />
          ) : (
            <EmptyState icon="list" title="No hay gastos en este periodo" description="Toca el botón + para registrar uno." />
          )}
        </div>
      ) : (
        <ExpenseList
          expenses={expenses ?? []}
          onSelect={(id) => navigate(`/gasto/${id}`)}
          onTogglePaid={togglePaid}
          onDelete={removeExpense}
          hintFirst={swipeHint.showHint}
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
