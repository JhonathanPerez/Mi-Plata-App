import { useNavigate } from 'react-router-dom';
import { CreditCardTile } from '@/components/cards/CreditCardTile';
import { ReminderPrompt } from '@/components/cards/ReminderPrompt';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { useQuery } from '@/hooks/useQuery';
import { cardService } from '@/services/cardService';

/** Tarjetas de crédito: qué se debe, cuándo corta cada una y cuándo vence el pago. */
export function CardsPage() {
  const navigate = useNavigate();
  const { data, loading, error, retry } = useQuery(() => cardService.listOverviews());
  const overviews = data ?? [];

  return (
    <div className="page">
      <PageHeader title="Tarjetas" back actions={<PrivacyToggle />} />

      {error && !data ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus tarjetas. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !data ? (
        <div className="page-skeleton" role="status" aria-label="Cargando tarjetas">
          <Skeleton height={300} radius="l" />
          <Skeleton height={220} radius="l" />
        </div>
      ) : overviews.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="card"
            title="No tienes tarjetas de crédito"
            description="Crea una como método de pago de tipo «Tarjeta de crédito» y configura sus fechas de corte y pago."
            action={
              <Button icon="plus" onClick={() => navigate('/ajustes/metodos')}>
                Ir a métodos de pago
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <ReminderPrompt />
          {overviews.map((overview) => (
            <CreditCardTile key={overview.method.id} overview={overview} />
          ))}
        </>
      )}
    </div>
  );
}
