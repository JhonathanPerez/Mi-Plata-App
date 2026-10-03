import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { PendingRow } from '@/components/expenses/PendingRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Amount, Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { useSwipeHint } from '@/hooks/useSwipeHint';
import { formatDayHeading, todayIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pluralize } from '@/lib/text';
import { captureService } from '@/services/captureService';
import { syncCapturedNotifications } from '@/services/captureSync';
import type { PendingCapture } from '@/types/models';

interface DayGroup {
  date: string;
  items: PendingCapture[];
  total: number;
}

/** Agrupa por día del mensaje (la lista ya llega ordenada del más reciente al más viejo). */
function groupByDay(items: PendingCapture[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const date = todayIso(new Date(item.occurredAt));
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.items.push(item);
      last.total += item.amount;
    } else {
      groups.push({ date, items: [item], total: item.amount });
    }
  }
  return groups;
}

/** Bandeja de gastos detectados en notificaciones y SMS que aún no tienen categoría. */
export function PendingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error: loadError, retry } = useQuery(() => captureService.listPending());

  const items = data ?? [];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const groups = groupByDay(items);
  const swipeHint = useSwipeHint(items.length > 0);

  // Al abrir la bandeja se recoge lo último que capturó el teléfono.
  useEffect(() => {
    void syncCapturedNotifications();
  }, []);

  const dismiss = async (id: string) => {
    const ok = await confirm({
      title: '¿Descartar este gasto?',
      message: 'No se agregará a tu historial. Úsalo si no fue un gasto tuyo o ya lo registraste.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    try {
      await captureService.dismiss(id);
      swipeHint.markLearned();
      void haptics.warning();
      toast.show('Descartado');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  const reportSpam = async (id: string) => {
    try {
      await captureService.reportSpam(id);
      void haptics.warning();
      toast.show('Gracias, lo tendremos en cuenta para futuros mensajes parecidos');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Por categorizar" subtitle="Detectados en tus notificaciones y SMS" back />

      {loadError && !data ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus gastos por categorizar. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !data ? (
        <div className="page-skeleton" role="status" aria-label="Cargando gastos por categorizar">
          <Skeleton height={112} radius="l" />
          <div className="card card--flush">
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton-row skeleton-row--expense">
                <Skeleton height={40} width="40px" />
                <div className="skeleton-row__body">
                  <Skeleton height={16} width="55%" />
                  <Skeleton height={13} width="75%" />
                </div>
                <Skeleton height={18} width="72px" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="check"
            title="Todo al día"
            description="Cuando llegue una notificación o un SMS de tu banco con una compra, aparecerá aquí para que le pongas categoría."
          />
        </div>
      ) : (
        <>
          <section className="hero" aria-label="Resumen de gastos por categorizar">
            <Stat
              tone="hero"
              label="Pendiente por categorizar"
              value={<Money value={total} />}
              foot={`${items.length} ${pluralize(items.length, 'gasto detectado', 'gastos detectados')}`}
            />
          </section>

          <p className="muted">Toca un gasto para elegir su categoría.</p>

          <div className="expense-list">
            {groups.map((group, groupIndex) => (
              <section key={group.date} className="expense-group" aria-label={formatDayHeading(group.date)}>
                <header className="expense-group__head">
                  <h3>{formatDayHeading(group.date)}</h3>
                  {/* Con un solo día, su total repetiría el del resumen. */}
                  {groups.length > 1 && (
                    <span>
                      <Amount value={group.total} />
                    </span>
                  )}
                </header>
                <div className="card card--flush">
                  <AnimatePresence initial={false}>
                    {group.items.map((item, index) => (
                      <PendingRow
                        key={item.id}
                        item={item}
                        hint={swipeHint.showHint && groupIndex === 0 && index === 0}
                        onOpen={(id) => navigate(`/gasto/nuevo?pendiente=${id}`)}
                        onDismiss={(id) => void dismiss(id)}
                        onReportSpam={(id) => void reportSpam(id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
