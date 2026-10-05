import { useState } from 'react';
import { SavingsAccountSheet } from '@/components/savings/SavingsAccountSheet';
import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ManagedListSkeleton } from '@/components/ui/ManagedListSkeleton';
import { Amount, Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Row } from '@/components/ui/Row';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { movementCountLabel } from '@/lib/savings';
import { savingsService } from '@/services/savingsService';

/** Cuentas de ahorro: cuánta plata hay en cada una y cuánto en total. Tocar una abre sus movimientos. */
export function SavingsPage() {
  const { data: accounts, loading, error, retry } = useQuery(() => savingsService.listAccounts(true));
  const [creating, setCreating] = useState(false);

  const list = accounts ?? [];
  const active = list.filter((account) => account.isActive);
  const total = active.reduce((sum, account) => sum + account.balance, 0);

  return (
    <div className="page">
      <PageHeader title="Cuentas de ahorro" back actions={<PrivacyToggle />} />

      {error && !accounts ? (
        <div className="card">
          <ErrorState description="No pudimos leer tus cuentas de ahorro. Inténtalo de nuevo." onRetry={retry} />
        </div>
      ) : loading && !accounts ? (
        <ManagedListSkeleton label="Cargando cuentas de ahorro" />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="piggy"
            title="Aún no tienes cuentas de ahorro"
            description="Agrega tus cuentas de los bancos o billeteras (Bancolombia, Nequi, Davivienda…) para llevar su saldo, ver sus movimientos y pagar gastos con ellas."
            action={
              <Button icon="plus" onClick={() => setCreating(true)}>
                Crear cuenta de ahorro
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Con una sola cuenta su saldo ya es el total: el resumen solo suma cuando hay varias. */}
          {active.length > 1 && (
            <section className="hero" aria-label="Total en tus cuentas">
              <Stat tone="hero" label="Total en tus cuentas" value={<Money value={total} />} foot={`${active.length} cuentas activas`} />
            </section>
          )}

          <div className="card card--flush list-gap">
            {list.map((account) => (
              <Row
                key={account.id}
                to={`/ahorros/${account.id}`}
                tight
                className={account.isActive ? undefined : 'row--dim'}
                leading={<EmojiTile emoji={account.icon} color={account.color} />}
                title={account.name}
                detail={account.last4 ? <span className="row__nowrap">••••&nbsp;{account.last4}</span> : undefined}
                amount={<Amount value={account.balance} />}
                chevron="chevronRight"
              >
                <span className="row__detail row__detail--truncate">
                  {movementCountLabel(account.movementCount)}
                </span>
                {!account.isActive && <span className="row__detail">No aparece al registrar un gasto</span>}
              </Row>
            ))}
          </div>

          <Button icon="plus" block onClick={() => setCreating(true)}>
            Nueva cuenta de ahorro
          </Button>
        </>
      )}

      <SavingsAccountSheet
        open={creating}
        account={null}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}
