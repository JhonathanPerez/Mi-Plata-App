import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { PasteSheet } from '@/components/expenses/PasteSheet';
import { PendingRow } from '@/components/expenses/PendingRow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { useSwipeHint } from '@/hooks/useSwipeHint';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { pluralize } from '@/lib/text';
import { captureService } from '@/services/captureService';
import { syncCapturedNotifications } from '@/services/captureSync';

/** Bandeja de gastos detectados en notificaciones y SMS que aún no tienen categoría. */
export function PendingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error: loadError, retry } = useQuery(() => captureService.listPending());
  const [pasteOpen, setPasteOpen] = useState(false);

  const items = data ?? [];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
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
      <PageHeader title="Por categorizar" back />

      <div className="toolbar">
        <Button variant="secondary" icon="clipboard" onClick={() => setPasteOpen(true)}>
          Pegar mensaje
        </Button>
        {items.length > 0 ? (
          <p className="toolbar__summary" aria-live="polite">
            <span className="toolbar__count">
              {items.length} {pluralize(items.length, 'gasto', 'gastos')}
            </span>
            <strong className="toolbar__total">
              <Amount value={total} />
            </strong>
          </p>
        ) : loading && !data ? (
          <div className="toolbar__summary" aria-hidden="true">
            <Skeleton height={13} width="64px" />
            <Skeleton height={18} width="96px" />
          </div>
        ) : null}
      </div>

      {loadError && !data ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus gastos por categorizar. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !data ? (
        <div className="card card--flush" role="status" aria-label="Cargando">
          {[0, 1, 2].map((n) => (
            <div key={n} className="skeleton-row">
              <div className="skeleton-row__body">
                <Skeleton height={16} width="46%" />
                <Skeleton height={12} width="70%" />
              </div>
              <Skeleton height={18} width="72px" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="check"
            title="Todo al día"
            description="Cuando llegue una notificación o un SMS de tu banco con una compra, aparecerá aquí para que le pongas categoría."
            action={
              <Link className="link" to="/ajustes/captura">
                Configurar captura automática
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <p className="muted">Toca un gasto para elegir su categoría.</p>
          <div className="card card--flush">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <PendingRow
                  key={item.id}
                  item={item}
                  hint={swipeHint.showHint && index === 0}
                  onOpen={(id) => navigate(`/gasto/nuevo?pendiente=${id}`)}
                  onDismiss={(id) => void dismiss(id)}
                  onReportSpam={(id) => void reportSpam(id)}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      <PasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </div>
  );
}
