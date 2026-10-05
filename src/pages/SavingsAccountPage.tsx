import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { SavingsAccountSheet } from '@/components/savings/SavingsAccountSheet';
import { SavingsAdjustSheet } from '@/components/savings/SavingsAdjustSheet';
import { SavingsMovementSheet } from '@/components/savings/SavingsMovementSheet';
import { Button, IconButton, LinkButton } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { Amount, Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { Row } from '@/components/ui/Row';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stat } from '@/components/ui/Stat';
import { useQuery } from '@/hooks/useQuery';
import { cx } from '@/lib/cx';
import { formatShortDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { describeAccount, MOVEMENT_LABELS, movementTitle, type MovementWithBalance } from '@/lib/savings';
import { pluralize } from '@/lib/text';
import { savingsService } from '@/services/savingsService';
import type { SavingsMovementKind } from '@/types/models';

/** Fila de un movimiento: ingreso (suma) o retiro (resta), con la fecha y el saldo que quedó después. */
function MovementRow({ movement, onRemove }: { movement: MovementWithBalance; onRemove: (movement: MovementWithBalance) => void }) {
  const isDeposit = movement.kind === 'deposit';
  const sign = isDeposit ? '+' : '−';
  const leading = (
    <span className={cx('savings-move__icon', `savings-move__icon--${movement.kind}`)} aria-hidden="true">
      <Icon name={isDeposit ? 'plus' : 'minus'} size={20} />
    </span>
  );
  const common = {
    className: 'savings-move',
    tight: true,
    leading,
    title: movementTitle(movement),
    detail: `${MOVEMENT_LABELS[movement.kind].title} · ${formatShortDate(movement.date)}`,
    amount: (
      <span className={cx('savings-move__amount', `savings-move__amount--${movement.kind}`)}>
        {sign}
        <Amount value={movement.amount} />
      </span>
    ),
    aside: (
      <>
        Saldo <Amount value={movement.balanceAfter} />
      </>
    ),
  };
  // Los retiros que pagaron un gasto se abren en el gasto; los manuales se pueden borrar si hubo un error.
  if (movement.expenseId) return <Row {...common} to={`/gasto/${movement.expenseId}`} chevron="chevronRight" />;
  return <Row {...common} chevron="trash" aria-label={`${common.title}. Eliminar movimiento`} onClick={() => onRemove(movement)} />;
}

/** Una cuenta de ahorro: saldo, botones para meter y sacar plata, y el historial de todos sus movimientos. */
export function SavingsAccountPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, retry } = useQuery(() => savingsService.getDetail(id), [id]);
  const [movementKind, setMovementKind] = useState<SavingsMovementKind | null>(null);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const removeMovement = async (movement: MovementWithBalance) => {
    const label = MOVEMENT_LABELS[movement.kind].title.toLowerCase();
    const ok = await confirm({
      title: `¿Eliminar este ${label}?`,
      message:
        movement.kind === 'deposit'
          ? 'Se quitará de los movimientos y el saldo bajará. Úsalo solo para corregir un error.'
          : 'Se quitará de los movimientos y la plata volverá a la cuenta. Úsalo solo para corregir un error.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await savingsService.removeMovement(movement.id);
      toast.show('Movimiento eliminado');
    } catch (failure) {
      toast.show(errorMessage(failure), 'error');
    }
  };

  if (error && !data) {
    return (
      <div className="page">
        <PageHeader title="Cuenta de ahorro" back />
        <div className="card">
          <ErrorState description="No pudimos leer esta cuenta. Inténtalo de nuevo." onRetry={retry} />
        </div>
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="page">
        <PageHeader title="Cuenta de ahorro" back />
        <div className="page-skeleton" role="status" aria-label="Cargando la cuenta">
          <Skeleton height={220} radius="l" />
          <Skeleton height={160} radius="l" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <PageHeader title="Cuenta no encontrada" back />
        <p className="muted">Esta cuenta ya no existe. Es posible que la hayas eliminado.</p>
      </div>
    );
  }

  const { account, balance, totals, movements, expenseCount } = data;
  const withBalance = { ...account, balance, movementCount: movements.length };

  return (
    <div className="page">
      <PageHeader
        title={account.name}
        subtitle={describeAccount(account.last4)}
        back
        actions={
          <>
            <PrivacyToggle />
            <IconButton icon="edit" label="Editar cuenta" onClick={() => setEditing(true)} />
          </>
        }
      />

      <section className="hero" aria-label={`Saldo de ${account.name}`}>
        <Stat
          tone="hero"
          label="Saldo en la app"
          leading={<EmojiTile emoji={account.icon} color={account.color} />}
          value={<Money value={balance} />}
          foot={
            <>
              Ingresado <Amount value={totals.deposited} /> · Retirado <Amount value={totals.withdrawn} />
            </>
          }
        />
        <div className="savings-actions">
          <Button variant="inverse" icon="plus" onClick={() => setMovementKind('deposit')}>
            Meter plata
          </Button>
          <Button variant="inverse" icon="minus" disabled={balance <= 0} onClick={() => setMovementKind('withdrawal')}>
            Sacar plata
          </Button>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__heading">
            <h2 className="section__title">Movimientos</h2>
            <p className="section__hint">
              {movements.length} {pluralize(movements.length, 'movimiento', 'movimientos')}
            </p>
          </div>
          <LinkButton onClick={() => setAdjusting(true)}>Ajustar saldo</LinkButton>
        </div>
        {movements.length === 0 ? (
          <div className="card">
            <EmptyState icon="piggy" title="Aún no hay movimientos" description="Cada ingreso, retiro o gasto pagado con esta cuenta quedará registrado aquí. Si el saldo del banco es otro, usa «Ajustar saldo»." />
          </div>
        ) : (
          <div className="card card--flush list-gap">
            {movements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} onRemove={removeMovement} />
            ))}
          </div>
        )}
      </section>

      <SavingsMovementSheet open={movementKind !== null} account={account} balance={balance} kind={movementKind ?? 'deposit'} onClose={() => setMovementKind(null)} />
      <SavingsAdjustSheet open={adjusting} account={account} balance={balance} onClose={() => setAdjusting(false)} />
      <SavingsAccountSheet
        open={editing}
        account={withBalance}
        expenseCount={expenseCount}
        onClose={() => setEditing(false)}
        onRemoved={() => navigate('/ahorros', { replace: true })}
      />
    </div>
  );
}
