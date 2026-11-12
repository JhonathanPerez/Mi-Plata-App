import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/Button';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { useQuery } from '@/hooks/useQuery';
import { cx } from '@/lib/cx';
import { formatLongDate, formatTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { expenseService } from '@/services/expenseService';
import { paymentMethodService } from '@/services/paymentMethodService';
import type { ExpenseWithRefs } from '@/types/models';

/** Una línea del recibo: etiqueta a la izquierda y valor a la derecha. */
function ReceiptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="receipt__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReceiptSkeleton() {
  return <div className="receipt receipt--loading" role="status" aria-label="Cargando el gasto" />;
}

function Receipt({ expense }: { expense: ExpenseWithRefs }) {
  const paid = expense.paidAt !== null;
  return (
    <article className="receipt" aria-label={`Recibo del gasto: ${expense.categoryName}`}>
      <header className="receipt__head">
        <EmojiTile emoji={expense.categoryIcon} color={expense.categoryColor} />
        <p className="receipt__amount">
          <Amount value={expense.amount} />
        </p>
        <span className={cx('receipt__status', !paid && 'receipt__status--due')}>{paid ? 'Pagado' : 'Por pagar'}</span>
      </header>

      <dl className="receipt__list">
        <ReceiptRow label="Descripción">{expense.note?.trim() || 'Sin descripción'}</ReceiptRow>
        <ReceiptRow label="Fecha">
          {formatLongDate(expense.date)}
          {expense.time ? ` · ${formatTime(expense.time)}` : ''}
        </ReceiptRow>
        <ReceiptRow label="Categoría">
          {expense.categoryIcon} {expense.categoryName}
        </ReceiptRow>
        <ReceiptRow label="Método de pago">
          {expense.paymentMethodIcon} {expense.paymentMethodName}
        </ReceiptRow>
        {expense.paidAt && <ReceiptRow label="Pagado el">{formatLongDate(expense.paidAt)}</ReceiptRow>}
      </dl>

      <footer className="receipt__total">
        <span>Total</span>
        <strong>
          <Amount value={expense.amount} />
        </strong>
      </footer>
    </article>
  );
}

/** El gasto y, si se pagó con una cuenta de ahorro, el nombre de esa cuenta (para avisar que la plata vuelve a ella al eliminarlo). */
async function loadDetail(id: string) {
  const [expense, methods] = await Promise.all([expenseService.getDetail(id), paymentMethodService.list(true)]);
  const savingsMethod = expense ? methods.find((m) => m.id === expense.paymentMethodId && m.savingsAccountId) : undefined;
  return { expense, savingsAccountName: savingsMethod?.name ?? null };
}

/**
 * Detalle de un gasto en forma de recibo. Se abre con un toque sobre el gasto (en Inicio, en Gastos o en los movimientos
 * de una cuenta de ahorro). El lápiz del encabezado lleva al formulario para modificarlo (al guardar se vuelve aquí) y la
 * papelera lo elimina directamente, con la misma confirmación del formulario.
 */
export function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: loaded, loading, error, retry } = useQuery(() => loadDetail(id), [id]);
  const data = loaded?.expense ?? null;

  const remove = async () => {
    const account = loaded?.savingsAccountName;
    const ok = await confirm({
      title: '¿Eliminar este gasto?',
      message: account
        ? `Se quitará de tu historial y de tus estadísticas, y la plata volverá a «${account}». Esta acción no se puede deshacer.`
        : 'Se quitará de tu historial y de tus estadísticas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await expenseService.remove(id);
      void haptics.success();
      toast.show('Gasto eliminado');
      // `key === 'default'` es la primera pantalla de la sesión (enlace directo o aviso): no hay a dónde volver, así que va a Inicio.
      if (location.key !== 'default') navigate(-1);
      else navigate('/', { replace: true });
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const actions = data ? (
    <>
      <IconButton icon="edit" label="Editar gasto" onClick={() => navigate(`/gasto/${id}/editar`)} />
      <IconButton icon="trash" label="Eliminar gasto" onClick={() => void remove()} />
    </>
  ) : undefined;

  let body;
  if (error && !data) {
    body = (
      <div className="card">
        <ErrorState description="No pudimos leer este gasto. Inténtalo de nuevo." onRetry={retry} />
      </div>
    );
  } else if (loading && !data) {
    body = <ReceiptSkeleton />;
  } else if (!data) {
    body = <p className="muted">Este gasto ya no existe. Es posible que lo hayas eliminado.</p>;
  } else {
    body = <Receipt expense={data} />;
  }

  return (
    <div className="page page--receipt">
      <PageHeader title={data || loading ? 'Detalle del gasto' : 'Gasto no encontrado'} back actions={actions} />
      {body}
    </div>
  );
}
