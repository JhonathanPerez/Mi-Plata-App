import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/app/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { EmojiTile } from '@/components/ui/EmojiTile';
import { Icon } from '@/components/ui/Icon';
import { Amount } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrivacyToggle } from '@/components/ui/PrivacyToggle';
import { useQuery } from '@/hooks/useQuery';
import { addDays, formatShortDate, todayIso } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useAmountFormat } from '@/app/providers/PrivacyProvider';
import { formatDayMonth, periodMonthName } from '@/lib/statementText';
import { pluralize } from '@/lib/text';
import { cardService } from '@/services/cardService';
import { categoryService } from '@/services/categoryService';

/** Pagar el extracto de una tarjeta: se marcan los gastos incluidos y todos pasan a "Pagado" a la vez. */
export function PayCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { cop } = useAmountFormat();
  const today = todayIso();
  const { data, loading } = useQuery(async () => ({
    overview: await cardService.getOverview(id),
    categories: await categoryService.list(true),
  }), [id]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paidOn, setPaidOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  const payable = data?.overview?.payable ?? [];
  const categories = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c])), [data]);

  // Al abrir, todo lo del extracto viene marcado (se desmarca lo que no entra).
  useEffect(() => {
    if (initialized.current || !data?.overview) return;
    initialized.current = true;
    setSelected(new Set(data.overview.payable.flatMap((s) => s.expenses.filter((e) => e.paidAt === null).map((e) => e.id))));
  }, [data]);

  const unpaidOf = (statement: (typeof payable)[number]) => statement.expenses.filter((e) => e.paidAt === null);
  const allIds = payable.flatMap((s) => unpaidOf(s).map((e) => e.id));
  const chosen = payable.flatMap((s) => unpaidOf(s)).filter((e) => selected.has(e.id));
  const total = chosen.reduce((sum, e) => sum + e.amount, 0);
  const grandTotal = payable.reduce((sum, s) => sum + s.unpaidTotal, 0);

  const toggle = (expenseId: string) => {
    void haptics.tap();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      const result = await cardService.payExpenses(id, chosen.map((e) => e.id), paidOn);
      void haptics.success();
      toast.show(`${result.paid} ${pluralize(result.paid, 'gasto marcado', 'gastos marcados')} como ${pluralize(result.paid, 'pagado', 'pagados')} · ${cop(result.total)}`);
      navigate(-1);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
      setSaving(false);
    }
  };

  if (!loading && data && !data.overview) {
    return (
      <div className="page">
        <PageHeader title="Pagar tarjeta" back />
        <p className="muted">Esta tarjeta ya no existe.</p>
      </div>
    );
  }
  const method = data?.overview?.method;
  const open = data?.overview?.open;
  const openUnpaid = open ? open.expenses.filter((e) => e.paidAt === null) : [];

  return (
    <div className="page page--form">
      <PageHeader title={method ? `Pagar ${method.name}` : 'Pagar tarjeta'} back actions={<PrivacyToggle />} />

      {payable.length === 0 ? (
        <div className="card">
          <p className="muted empty-note">
            No hay extractos cerrados por pagar en esta tarjeta.
            {open ? ` El ciclo de ${periodMonthName(open.period)} corta el ${formatDayMonth(open.cutDate)}.` : ''}
          </p>
        </div>
      ) : (
        <>
          <section className="pay-summary">
            <span>
              {payable.length === 1
                ? `Extracto de ${periodMonthName(payable[0].period)} · corte ${formatDayMonth(payable[0].cutDate)}`
                : `${payable.length} extractos cerrados`}
            </span>
            <strong>
              <Amount value={total} />
            </strong>
            <small>
              {chosen.length} de {allIds.length} gastos seleccionados
              {total !== grandTotal ? ` · total del extracto ${cop(grandTotal)}` : ''}
            </small>
          </section>

          <div className="field">
            <span className="field__label">Fecha del pago</span>
            <div className="chip-row">
              <button type="button" className={cx('chip', paidOn === today && 'is-selected')} aria-pressed={paidOn === today} onClick={() => setPaidOn(today)}>
                Hoy
              </button>
              <button type="button" className={cx('chip', paidOn === addDays(today, -1) && 'is-selected')} aria-pressed={paidOn === addDays(today, -1)} onClick={() => setPaidOn(addDays(today, -1))}>
                Ayer
              </button>
              <input className="input input--date" type="date" aria-label="Otra fecha de pago" max={today} value={paidOn} onChange={(event) => event.target.value && setPaidOn(event.target.value)} />
            </div>
          </div>

          {payable.map((statement) => (
            <section key={statement.period}>
              <div className="pay-list-head">
                <h2 className="section__title">
                  {payable.length > 1 ? `Extracto de ${periodMonthName(statement.period)}` : 'Incluidos'}
                </h2>
                <button
                  type="button"
                  className="link link--button pay-link"
                  onClick={() => {
                    const ids = unpaidOf(statement).map((e) => e.id);
                    const everySelected = ids.every((x) => selected.has(x));
                    setSelected((current) => {
                      const next = new Set(current);
                      ids.forEach((x) => (everySelected ? next.delete(x) : next.add(x)));
                      return next;
                    });
                  }}
                >
                  {unpaidOf(statement).every((e) => selected.has(e.id)) ? 'Quitar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="card card--flush">
                {unpaidOf(statement).map((expense) => {
                  const category = categories.get(expense.categoryId);
                  const on = selected.has(expense.id);
                  return (
                    <label className={cx('pay-item', !on && 'is-off')} key={expense.id}>
                      <input className="sr-only" type="checkbox" checked={on} onChange={() => toggle(expense.id)} />
                      <span className={cx('pay-item__check', on && 'is-on')} aria-hidden="true">
                        {on && <Icon name="check" size={16} />}
                      </span>
                      <EmojiTile emoji={category?.icon ?? '🧾'} color={category?.color ?? '#7A6F66'} />
                      <span className="pay-item__body">
                        <strong>{expense.note ?? category?.name ?? 'Gasto'}</strong>
                        <small>
                          {category?.name ?? 'Sin categoría'} · {formatShortDate(expense.date)}
                        </small>
                      </span>
                      <strong className="pay-item__amount">
                        <Amount value={expense.amount} />
                      </strong>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="muted pay-tip">
            <Icon name="info" size={16} />
            <span>Desmarca lo que no pagaste con este extracto (por ejemplo, algo que pagaste aparte): seguirá como «Por pagar».</span>
          </p>
        </>
      )}

      {open && openUnpaid.length > 0 && (
        <section>
          <h2 className="section__title">Después del corte · próximo ciclo</h2>
          <div className="card card--flush pay-locked">
            {openUnpaid.map((expense) => {
              const category = categories.get(expense.categoryId);
              return (
                <div className="pay-item" key={expense.id}>
                  <span className="pay-item__lock" aria-hidden="true">
                    <Icon name="lock" size={16} />
                  </span>
                  <EmojiTile emoji={category?.icon ?? '🧾'} color={category?.color ?? '#7A6F66'} />
                  <span className="pay-item__body">
                    <strong>{expense.note ?? category?.name ?? 'Gasto'}</strong>
                    <small>
                      {category?.name ?? 'Sin categoría'} · {formatShortDate(expense.date)}
                    </small>
                  </span>
                  <strong className="pay-item__amount">
                        <Amount value={expense.amount} />
                      </strong>
                </div>
              );
            })}
          </div>
          <p className="muted pay-tip">
            <Icon name="info" size={16} />
            <span>Entran al extracto que corta el {formatDayMonth(open.cutDate)} y se pagarán entonces.</span>
          </p>
        </section>
      )}

      {payable.length > 0 && (
        <div className="form__footer">
          <Button block size="lg" icon="check" loading={saving} disabled={chosen.length === 0} onClick={() => void submit()}>
            Marcar pagado · {cop(total)}
          </Button>
        </div>
      )}
    </div>
  );
}
