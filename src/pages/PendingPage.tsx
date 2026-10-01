import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { PasteSheet } from '@/components/expenses/PasteSheet';
import { PendingRow } from '@/components/expenses/PendingRow';
import { IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { formatCOP } from '@/lib/money';
import { pluralize } from '@/lib/text';
import { captureService } from '@/services/captureService';
import { syncCapturedNotifications } from '@/services/captureSync';

/** Bandeja de gastos detectados en notificaciones y SMS que aún no tienen categoría. */
export function PendingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading } = useQuery(() => captureService.listPending());
  const [pasteOpen, setPasteOpen] = useState(false);

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

  const items = data ?? [];
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="page">
      <PageHeader
        title="Por categorizar"
        back
        actions={<IconButton icon="plus" label="Pegar un mensaje" onClick={() => setPasteOpen(true)} />}
      />

      {loading && !data ? (
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
          <p className="muted">
            {items.length} {pluralize(items.length, 'gasto', 'gastos')} · {formatCOP(total)}. Toca uno para elegir su categoría, deslízalo a la izquierda para descartarlo o mantenlo presionado para reportarlo como publicidad.
          </p>
          <div className="card card--flush">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <PendingRow key={item.id} item={item} onOpen={(id) => navigate(`/gasto/nuevo?pendiente=${id}`)} onDismiss={(id) => void dismiss(id)} onReportSpam={(id) => void reportSpam(id)} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      <PasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </div>
  );
}
